ALTER TABLE public.estoque_reservas DROP CONSTRAINT IF EXISTS estoque_reservas_quantidade_check;
ALTER TABLE public.estoque_reservas ADD CONSTRAINT estoque_reservas_quantidade_check CHECK (quantidade >= 0);

CREATE OR REPLACE FUNCTION public.estoque_baixar(p_item_id uuid, p_quantidade integer, p_motivo text, p_os text DEFAULT NULL::text, p_tecnico_id uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text, p_reserva_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item record;
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_disp int;
  v_reserva record;
  v_res_qtd int := 0;
  v_custo_id uuid;
  v_mov_id uuid;
  v_novo int;
  v_tipo_peca uuid;
  v_tecnico_nome text;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;
  if p_motivo not in ('uso_os','defeito_perda','devolucao_fornecedor','transferencia','ajuste_inventario') then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_INVALIDO');
  end if;
  if p_motivo = 'uso_os' and v_os is null then
    return jsonb_build_object('ok', false, 'code', 'OS_OBRIGATORIA');
  end if;

  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id for update of i;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;

  if p_reserva_id is not null then
    select * into v_reserva from public.estoque_reservas
     where id = p_reserva_id and item_id = p_item_id
       and status in ('ativa','parcialmente_utilizada') for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'RESERVA_INVALIDA');
    end if;
    v_res_qtd := v_reserva.quantidade;
    if p_quantidade > v_res_qtd then
      return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_ACIMA_RESERVA');
    end if;
    v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0) + v_res_qtd;
  else
    v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);
  end if;

  if p_quantidade > v_disp or (v_item.quantidade - p_quantidade) < 0 then
    return jsonb_build_object('ok', false, 'code', 'SALDO_INSUFICIENTE',
      'disponivel', v_disp, 'reservado', v_item.quantidade_reservada,
      'fisico', v_item.quantidade);
  end if;

  v_novo := v_item.quantidade - p_quantidade;

  if p_motivo = 'uso_os' and coalesce(v_item.custo_unitario, 0) > 0 then
    select id into v_tipo_peca from public.tipos_custo where eh_peca and ativo order by ordem limit 1;
    if v_tipo_peca is not null then
      insert into public.custos_os (os, tecnico_id, tipo_custo_id, descricao, marca, modelo,
        quantidade, custo_unitario, custo_total, status, observacao, created_by, updated_by)
      values (v_os, p_tecnico_id, v_tipo_peca,
        case when v_item.tipo = 'kit_led' then 'Kit de LED ' else 'Placa Main ' end || v_item.modelo,
        v_item.marca_nome, v_item.modelo,
        p_quantidade, v_item.custo_unitario, round(v_item.custo_unitario * p_quantidade, 2),
        'registrado', 'Baixa automática do Estoque Técnico.', auth.uid(), auth.uid())
      returning id into v_custo_id;
    end if;
  end if;

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, os, tecnico_id,
    observacao, saldo_anterior, saldo_posterior, custo_unitario, custo_os_id, reserva_id, created_by)
  values (p_item_id, 'saida', p_motivo, p_quantidade, v_os, p_tecnico_id,
    nullif(btrim(coalesce(p_observacao,'')), ''), v_item.quantidade, v_novo,
    coalesce(v_item.custo_unitario, 0), v_custo_id, p_reserva_id, auth.uid())
  returning id into v_mov_id;

  if p_reserva_id is not null then
    update public.estoque_itens
       set quantidade_reservada = greatest(quantidade_reservada - least(p_quantidade, v_res_qtd), 0),
           quantidade = v_novo, updated_by = auth.uid()
     where id = p_item_id;
    update public.estoque_reservas
       set quantidade = greatest(v_res_qtd - p_quantidade, 0),
           status = case when greatest(v_res_qtd - p_quantidade, 0) = 0 then 'atendida'
                         else 'parcialmente_utilizada' end,
           encerrada_em = case when greatest(v_res_qtd - p_quantidade, 0) = 0 then now() else null end,
           movimento_id = v_mov_id, updated_by = auth.uid()
     where id = p_reserva_id;
  else
    update public.estoque_itens set quantidade = v_novo, updated_by = auth.uid() where id = p_item_id;
  end if;

  select full_name into v_tecnico_nome from public.profiles where id = p_tecnico_id;

  perform public.registrar_auditoria('estoque', 'baixa', null,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'motivo', p_motivo,
      'os', v_os, 'tecnico_id', p_tecnico_id, 'saldo_anterior', v_item.quantidade,
      'saldo_posterior', v_novo, 'custo_os_id', v_custo_id, 'reserva_id', p_reserva_id));

  return jsonb_build_object('ok', true, 'id', v_mov_id,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'tipo', v_item.tipo,
    'gaveta', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'quantidade', p_quantidade, 'os', v_os,
    'tecnico', v_tecnico_nome,
    'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo,
    'reservado', greatest(v_item.quantidade_reservada - least(p_quantidade, v_res_qtd), 0),
    'custo_os_id', v_custo_id);
end;
$function$;