CREATE OR REPLACE FUNCTION public.estoque_item_historico(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_mov jsonb; v_res jsonb; v_sol jsonb; v_ver_custo boolean; v_gestor boolean;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_ver_custo := public.has_permission(auth.uid(), 'estoque', 'movimentar');
  v_gestor := public.has_permission(auth.uid(), 'estoque', 'reservar');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'tipo', m.tipo, 'motivo', m.motivo, 'quantidade', m.quantidade,
      'os', m.os, 'tecnico_nome', t.full_name, 'observacao', m.observacao,
      'saldo_anterior', m.saldo_anterior, 'saldo_posterior', m.saldo_posterior,
      'custo_unitario', case when v_ver_custo then m.custo_unitario else null end,
      'custo_os_id', m.custo_os_id, 'estornado_em', m.estornado_em, 'estorno_de', m.estorno_de,
      'reserva_id', m.reserva_id,
      'created_at', m.created_at, 'responsavel', r.full_name) order by m.created_at desc), '[]'::jsonb)
    into v_mov
    from public.estoque_movimentos m
    left join public.profiles t on t.id = m.tecnico_id
    left join public.profiles r on r.id = m.created_by
   where m.item_id = p_item_id and (v_gestor or m.tecnico_id = auth.uid() or m.tecnico_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'quantidade', r.quantidade, 'quantidade_entregue', r.quantidade_entregue,
      'quantidade_original', r.quantidade_original,
      'status', r.status, 'os', r.os, 'tecnico_nome', p.full_name,
      'observacao', r.observacao, 'created_at', r.created_at,
      'encerrada_em', r.encerrada_em, 'motivo_cancelamento', r.motivo_cancelamento,
      'dias', greatest(((now() at time zone 'America/Manaus')::date
                        - (r.created_at at time zone 'America/Manaus')::date), 0),
      'reservado_por', rp.full_name) order by r.created_at desc), '[]'::jsonb)
    into v_res
    from public.estoque_reservas r
    left join public.profiles p on p.id = r.tecnico_id
    left join public.profiles rp on rp.id = r.created_by
   where r.item_id = p_item_id
     and (v_gestor or r.tecnico_id = auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'quantidade', s.quantidade, 'os', s.os, 'status', s.status,
      'tecnico_nome', p.full_name, 'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
    into v_sol
    from public.estoque_solicitacoes s
    left join public.profiles p on p.id = s.tecnico_id
   where s.item_id = p_item_id and s.status = 'aguardando'
     and (v_gestor or s.tecnico_id = auth.uid());

  return jsonb_build_object('ok', true, 'movimentos', v_mov, 'reservas', v_res, 'solicitacoes', v_sol);
end;
$function$;

CREATE OR REPLACE FUNCTION public.estoque_reservas_listar(p_status text DEFAULT 'ativa'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_lista jsonb; v_todas boolean;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_todas := public.has_permission(auth.uid(), 'estoque', 'reservar');

  select coalesce(jsonb_agg(x order by x->>'created_at' asc), '[]'::jsonb) into v_lista
  from (
    select jsonb_build_object(
      'id', r.id, 'item_id', r.item_id, 'quantidade', r.quantidade,
      'quantidade_entregue', r.quantidade_entregue, 'status', r.status,
      'os', r.os, 'tecnico_id', r.tecnico_id, 'tecnico_nome', t.full_name,
      'observacao', r.observacao, 'created_at', r.created_at,
      'dias', greatest(((now() at time zone 'America/Manaus')::date
                        - (r.created_at at time zone 'America/Manaus')::date), 0),
      'reservado_por', rp.full_name,
      'tipo', i.tipo, 'marca_nome', m.nome, 'modelo', i.modelo, 'codigo_placa', i.codigo_placa,
      'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
      'fisico', i.quantidade, 'reservado_item', i.quantidade_reservada,
      'disponivel', greatest(i.quantidade - i.quantidade_reservada, 0),
      'solicitacao_id', r.solicitacao_id
    ) as x
      from public.estoque_reservas r
      join public.estoque_itens i on i.id = r.item_id
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
      left join public.profiles t on t.id = r.tecnico_id
      left join public.profiles rp on rp.id = r.created_by
     where (p_status is null or r.status = p_status
            or (p_status = 'ativa' and r.status = 'parcialmente_utilizada'))
       and (v_todas or r.tecnico_id = auth.uid())
     order by r.created_at asc
     limit 300
  ) q;

  return jsonb_build_object('ok', true, 'reservas', v_lista);
end;
$function$;