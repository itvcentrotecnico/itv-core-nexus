CREATE OR REPLACE FUNCTION public.estoque_buscar(p_busca text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_marca_id uuid DEFAULT NULL::uuid, p_polegada text DEFAULT NULL::text, p_localizacao_id uuid DEFAULT NULL::uuid, p_disponibilidade text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q text := nullif(public.estoque_norm(p_busca), '');
  v_total integer;
  v_itens jsonb;
  v_ver_custo boolean := public.has_permission(auth.uid(), 'estoque', 'movimentar');
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  with base as (
    select i.id
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo
       and (p_tipo is null or i.tipo = p_tipo)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_polegada is null or i.polegada = p_polegada)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_disponibilidade is null
            or (p_disponibilidade = 'com_estoque' and (i.quantidade - i.quantidade_reservada) > 0)
            or (p_disponibilidade = 'sem_estoque' and (i.quantidade - i.quantidade_reservada) <= 0)
            or (p_disponibilidade = 'baixo' and (i.quantidade - i.quantidade_reservada) > 0
                and (i.quantidade - i.quantidade_reservada) <= i.estoque_minimo))
       and (v_q is null
            or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%'
            or public.estoque_norm(l.codigo) like '%' || v_q || '%'
            or public.estoque_norm(l.grupo || ' Gaveta ' || lpad(l.numero::text, 2, '0')) like '%' || v_q || '%'
            or exists (select 1 from public.estoque_compatibilidades c
                        where c.item_id = i.id
                          and public.estoque_norm(c.modelo) like '%' || v_q || '%'))
  )
  select count(*)::int into v_total from base;

  with base as (
    select i.*, m.nome as marca_nome, l.grupo, l.numero, l.codigo as gaveta_codigo,
           (select coalesce(jsonb_agg(c.modelo order by c.modelo), '[]'::jsonb)
              from public.estoque_compatibilidades c where c.item_id = i.id) as compatibilidades,
           (select coalesce(sum(r.quantidade), 0) from public.estoque_reservas r
             where r.item_id = i.id and r.status in ('ativa','parcialmente_utilizada') and r.tecnico_id = auth.uid()) as minha_reserva,
           (select r.os from public.estoque_reservas r
             where r.item_id = i.id and r.status in ('ativa','parcialmente_utilizada') and r.tecnico_id = auth.uid()
             order by r.created_at desc limit 1) as minha_reserva_os
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo
       and (p_tipo is null or i.tipo = p_tipo)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_polegada is null or i.polegada = p_polegada)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_disponibilidade is null
            or (p_disponibilidade = 'com_estoque' and (i.quantidade - i.quantidade_reservada) > 0)
            or (p_disponibilidade = 'sem_estoque' and (i.quantidade - i.quantidade_reservada) <= 0)
            or (p_disponibilidade = 'baixo' and (i.quantidade - i.quantidade_reservada) > 0
                and (i.quantidade - i.quantidade_reservada) <= i.estoque_minimo))
       and (v_q is null
            or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%'
            or public.estoque_norm(l.codigo) like '%' || v_q || '%'
            or public.estoque_norm(l.grupo || ' Gaveta ' || lpad(l.numero::text, 2, '0')) like '%' || v_q || '%'
            or exists (select 1 from public.estoque_compatibilidades c
                        where c.item_id = i.id
                          and public.estoque_norm(c.modelo) like '%' || v_q || '%'))
     order by m.nome, i.modelo
     limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'marca_id', b.marca_id, 'marca_nome', b.marca_nome,
           'polegada', b.polegada, 'modelo', b.modelo, 'codigo_placa', b.codigo_placa,
           'localizacao_id', b.localizacao_id, 'gaveta_codigo', b.gaveta_codigo,
           'gaveta_grupo', b.grupo, 'gaveta_numero', b.numero,
           'gaveta_label', b.grupo || ' — Gaveta ' || lpad(b.numero::text, 2, '0'),
           'quantidade', b.quantidade, 'quantidade_reservada', b.quantidade_reservada,
           'quantidade_disponivel', greatest(b.quantidade - b.quantidade_reservada, 0),
           'minha_reserva', b.minha_reserva, 'minha_reserva_os', b.minha_reserva_os,
           'estoque_minimo', b.estoque_minimo, 'observacao', b.observacao,
           'custo_unitario', case when v_ver_custo then b.custo_unitario else null end,
           'compatibilidades', b.compatibilidades,
           'status', case when greatest(b.quantidade - b.quantidade_reservada, 0) = 0 then 'sem_estoque'
                          when (b.quantidade - b.quantidade_reservada) <= b.estoque_minimo then 'baixo'
                          else 'em_estoque' end
         )), '[]'::jsonb) into v_itens from base b;

  return jsonb_build_object('ok', true, 'total', v_total, 'itens', v_itens);
end;
$function$;

CREATE OR REPLACE FUNCTION public.estoque_reservar(p_item_id uuid, p_quantidade integer, p_os text DEFAULT NULL::text, p_observacao text DEFAULT NULL::text, p_tecnico_id uuid DEFAULT NULL::uuid, p_solicitacao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item record; v_disp int; v_id uuid; v_tec uuid; v_s record; v_status text;
  v_sol_os text; v_sol_qtd int; v_os text;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'reservar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;

  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id for update of i;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  v_tec := coalesce(p_tecnico_id, auth.uid());

  if p_solicitacao_id is not null then
    select * into v_s from public.estoque_solicitacoes where id = p_solicitacao_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
    if v_s.status <> 'aguardando' then
      return jsonb_build_object('ok', false, 'code', 'SOLICITACAO_NAO_PENDENTE');
    end if;
    if p_quantidade > v_s.quantidade then
      return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_ACIMA_SOLICITADA');
    end if;
    v_tec := v_s.tecnico_id;
    v_sol_os := v_s.os;
    v_sol_qtd := v_s.quantidade;
  end if;

  v_os := coalesce(nullif(btrim(coalesce(p_os, '')), ''), v_sol_os);

  v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);
  if p_quantidade > v_disp then
    return jsonb_build_object('ok', false, 'code', 'SEM_DISPONIBILIDADE',
      'disponivel', v_disp, 'reservado', v_item.quantidade_reservada);
  end if;

  insert into public.estoque_reservas (item_id, quantidade, quantidade_original, os, tecnico_id,
    observacao, solicitacao_id, created_by, updated_by)
  values (p_item_id, p_quantidade, p_quantidade, v_os, v_tec,
    nullif(btrim(coalesce(p_observacao,'')), ''), p_solicitacao_id, auth.uid(), auth.uid())
  returning id into v_id;

  update public.estoque_itens
     set quantidade_reservada = quantidade_reservada + p_quantidade, updated_by = auth.uid()
   where id = p_item_id;

  if p_solicitacao_id is not null then
    v_status := case when p_quantidade < v_sol_qtd then 'parcialmente_atendida' else 'reservada' end;
    update public.estoque_solicitacoes
       set status = v_status, quantidade_reservada = p_quantidade,
           analisado_por = auth.uid(), analisado_em = now(), updated_by = auth.uid()
     where id = p_solicitacao_id;
  end if;

  perform public.registrar_auditoria('estoque', 'reserva_criar', null,
    jsonb_build_object('reserva_id', v_id, 'item_id', p_item_id, 'quantidade', p_quantidade,
      'os', v_os, 'tecnico_id', v_tec, 'solicitacao_id', p_solicitacao_id));

  return jsonb_build_object('ok', true, 'id', v_id,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'gaveta', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'quantidade', p_quantidade,
    'os', v_os,
    'tecnico', (select full_name from public.profiles where id = v_tec),
    'fisico', v_item.quantidade,
    'reservado', v_item.quantidade_reservada + p_quantidade,
    'disponivel_antes', v_disp,
    'disponivel', v_disp - p_quantidade,
    'solicitacao_status', v_status);
end;
$function$;

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