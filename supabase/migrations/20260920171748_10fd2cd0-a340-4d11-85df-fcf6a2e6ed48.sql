CREATE OR REPLACE FUNCTION public.estoque_movimentos_listar(
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL, p_tipo text DEFAULT NULL,
  p_familia text DEFAULT NULL, p_marca_id uuid DEFAULT NULL, p_busca text DEFAULT NULL,
  p_localizacao_id uuid DEFAULT NULL, p_os text DEFAULT NULL, p_tecnico_id uuid DEFAULT NULL,
  p_responsavel_id uuid DEFAULT NULL, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q text := nullif(public.estoque_norm(p_busca), ''); v_total int; v_linhas jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar')
     and not public.has_permission(auth.uid(), 'estoque', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select count(*)::int into v_total
    from public.estoque_movimentos mv
    join public.estoque_itens i on i.id = mv.item_id
    join public.estoque_marcas m on m.id = i.marca_id
   where (p_inicio is null or (mv.created_at at time zone 'America/Manaus')::date >= p_inicio)
     and (p_fim is null or (mv.created_at at time zone 'America/Manaus')::date <= p_fim)
     and (p_tipo is null or mv.tipo = p_tipo)
     and (p_familia is null or i.tipo = p_familia)
     and (p_marca_id is null or i.marca_id = p_marca_id)
     and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
     and (p_os is null or public.estoque_norm(mv.os) = public.estoque_norm(p_os))
     and (p_tecnico_id is null or mv.tecnico_id = p_tecnico_id)
     and (p_responsavel_id is null or mv.created_by = p_responsavel_id)
     and (v_q is null or public.estoque_norm(i.modelo) like '%' || v_q || '%'
          or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
          or public.estoque_norm(m.nome) like '%' || v_q || '%');

  select coalesce(jsonb_agg(x.linha), '[]'::jsonb) into v_linhas from (
    select jsonb_build_object(
      'id', mv.id, 'data', mv.created_at, 'tipo', mv.tipo, 'motivo', mv.motivo,
      'quantidade', mv.quantidade, 'saldo_anterior', mv.saldo_anterior,
      'saldo_posterior', mv.saldo_posterior, 'os', mv.os, 'observacao', mv.observacao,
      'familia', i.tipo, 'marca_nome', m.nome, 'polegada', i.polegada, 'modelo', i.modelo,
      'codigo_placa', i.codigo_placa,
      'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
      'tecnico_nome', pt.full_name, 'responsavel', pr.full_name,
      'estornado_em', mv.estornado_em, 'estorno_de', mv.estorno_de
    ) as linha
      from public.estoque_movimentos mv
      join public.estoque_itens i on i.id = mv.item_id
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
      left join public.profiles pt on pt.id = mv.tecnico_id
      left join public.profiles pr on pr.id = mv.created_by
     where (p_inicio is null or (mv.created_at at time zone 'America/Manaus')::date >= p_inicio)
       and (p_fim is null or (mv.created_at at time zone 'America/Manaus')::date <= p_fim)
       and (p_tipo is null or mv.tipo = p_tipo)
       and (p_familia is null or i.tipo = p_familia)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_os is null or public.estoque_norm(mv.os) = public.estoque_norm(p_os))
       and (p_tecnico_id is null or mv.tecnico_id = p_tecnico_id)
       and (p_responsavel_id is null or mv.created_by = p_responsavel_id)
       and (v_q is null or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%')
     order by mv.created_at desc
     limit greatest(coalesce(p_limit, 100), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) x;

  return jsonb_build_object('ok', true, 'total', v_total, 'linhas', v_linhas);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.estoque_movimentos_listar(date, date, text, text, uuid, text, uuid, text, uuid, uuid, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_movimentos_listar(date, date, text, text, uuid, text, uuid, text, uuid, uuid, integer, integer) TO authenticated, service_role;