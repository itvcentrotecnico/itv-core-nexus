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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', mv.id, 'data', mv.created_at, 'tipo', mv.tipo, 'motivo', mv.motivo,
    'quantidade', mv.quantidade, 'saldo_anterior', mv.saldo_anterior,
    'saldo_posterior', mv.saldo_posterior, 'os', mv.os, 'observacao', mv.observacao,
    'familia', i.tipo, 'marca_nome', m.nome, 'polegada', i.polegada, 'modelo', i.modelo,
    'codigo_placa', i.codigo_placa,
    'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
    'tecnico_nome', pt.full_name, 'responsavel', pr.full_name,
    'estornado_em', mv.estornado_em, 'estorno_de', mv.estorno_de
  ) order by mv.created_at desc), '[]'::jsonb) into v_linhas
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
   limit greatest(coalesce(p_limit, 100), 1) offset greatest(coalesce(p_offset, 0), 0);

  return jsonb_build_object('ok', true, 'total', v_total, 'linhas', v_linhas);
end;
$function$;

CREATE OR REPLACE FUNCTION public.estoque_relatorio(
  p_tipo text DEFAULT 'marca', p_familia text DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_lista jsonb := '[]'::jsonb; v_total int := 0;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(sum(i.quantidade), 0)::int into v_total
    from public.estoque_itens i where i.ativo and (p_familia is null or i.tipo = p_familia);

  if p_tipo = 'categoria' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', case when i.tipo = 'kit_led' then 'Kits de LED' else 'Placas Main' end,
        'total', sum(i.quantidade), 'reservado', sum(i.quantidade_reservada),
        'disponivel', greatest(sum(i.quantidade) - sum(i.quantidade_reservada), 0),
        'posicoes', count(*)) x
        from public.estoque_itens i where i.ativo group by i.tipo order by i.tipo
    ) q;

  elsif p_tipo = 'gaveta' then
    select coalesce(jsonb_agg(x order by x->>'ordem'), '[]'::jsonb) into v_lista from (
      select jsonb_build_object(
        'grupo_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
        'ordem', l.grupo || lpad(l.numero::text, 3, '0'),
        'total', sum(i.quantidade),
        'itens', jsonb_agg(jsonb_build_object('marca', m.nome, 'modelo', i.modelo,
                  'polegada', i.polegada, 'codigo_placa', i.codigo_placa,
                  'quantidade', i.quantidade, 'reservado', i.quantidade_reservada,
                  'observacao', i.observacao) order by i.modelo)) x
        from public.estoque_itens i
        join public.estoque_localizacoes l on l.id = i.localizacao_id
        join public.estoque_marcas m on m.id = i.marca_id
       where i.ativo and (p_familia is null or i.tipo = p_familia)
       group by l.grupo, l.numero
    ) q;

  elsif p_tipo in ('minimo','sem_estoque') then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', m.nome || ' ' || i.modelo,
        'gaveta', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
        'disponivel', greatest(i.quantidade - i.quantidade_reservada, 0),
        'minimo', i.estoque_minimo, 'total', i.quantidade) x
        from public.estoque_itens i
        join public.estoque_marcas m on m.id = i.marca_id
        join public.estoque_localizacoes l on l.id = i.localizacao_id
       where i.ativo and (p_familia is null or i.tipo = p_familia)
         and ((p_tipo = 'sem_estoque' and greatest(i.quantidade - i.quantidade_reservada, 0) = 0)
           or (p_tipo = 'minimo' and i.estoque_minimo > 0
               and greatest(i.quantidade - i.quantidade_reservada, 0) <= i.estoque_minimo))
       order by m.nome, i.modelo
    ) q;

  elsif p_tipo in ('entradas','saidas') then
    select coalesce(jsonb_agg(x order by x->>'rotulo'), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', m.nome || ' ' || i.modelo,
        'gaveta', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
        'total', sum(mv.quantidade), 'movimentos', count(*)) x
        from public.estoque_movimentos mv
        join public.estoque_itens i on i.id = mv.item_id
        join public.estoque_marcas m on m.id = i.marca_id
        join public.estoque_localizacoes l on l.id = i.localizacao_id
       where mv.tipo = case when p_tipo = 'entradas' then 'entrada' else 'saida' end
         and (p_familia is null or i.tipo = p_familia)
         and (p_inicio is null or (mv.created_at at time zone 'America/Manaus')::date >= p_inicio)
         and (p_fim is null or (mv.created_at at time zone 'America/Manaus')::date <= p_fim)
       group by m.nome, i.modelo, l.grupo, l.numero
    ) q;

  elsif p_tipo = 'os' then
    select coalesce(jsonb_agg(x order by x->>'rotulo'), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', 'OS ' || mv.os, 'total', sum(mv.quantidade),
        'itens', jsonb_agg(jsonb_build_object('marca', m.nome, 'modelo', i.modelo,
                  'quantidade', mv.quantidade, 'data', mv.created_at) order by mv.created_at)) x
        from public.estoque_movimentos mv
        join public.estoque_itens i on i.id = mv.item_id
        join public.estoque_marcas m on m.id = i.marca_id
       where mv.tipo = 'saida' and mv.os is not null
         and (p_familia is null or i.tipo = p_familia)
         and (p_inicio is null or (mv.created_at at time zone 'America/Manaus')::date >= p_inicio)
         and (p_fim is null or (mv.created_at at time zone 'America/Manaus')::date <= p_fim)
       group by mv.os
    ) q;

  elsif p_tipo = 'tecnico' then
    select coalesce(jsonb_agg(x order by (x->>'total')::int desc), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', coalesce(p.full_name, 'Sem técnico informado'),
        'total', sum(mv.quantidade), 'movimentos', count(*)) x
        from public.estoque_movimentos mv
        join public.estoque_itens i on i.id = mv.item_id
        left join public.profiles p on p.id = mv.tecnico_id
       where mv.tipo = 'saida'
         and (p_familia is null or i.tipo = p_familia)
         and (p_inicio is null or (mv.created_at at time zone 'America/Manaus')::date >= p_inicio)
         and (p_fim is null or (mv.created_at at time zone 'America/Manaus')::date <= p_fim)
       group by p.full_name
    ) q;

  elsif p_tipo = 'divergencias' then
    select coalesce(jsonb_agg(x order by x->>'data' desc), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', m.nome || ' ' || i.modelo,
        'gaveta', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
        'sistema', inv.quantidade_sistema, 'contado', inv.quantidade_contada,
        'diferenca', inv.diferenca, 'data', inv.created_at,
        'responsavel', p.full_name) x
        from public.estoque_inventarios inv
        join public.estoque_itens i on i.id = inv.item_id
        join public.estoque_marcas m on m.id = i.marca_id
        join public.estoque_localizacoes l on l.id = inv.localizacao_id
        left join public.profiles p on p.id = inv.conferido_por
       where inv.diferenca <> 0
         and (p_inicio is null or (inv.created_at at time zone 'America/Manaus')::date >= p_inicio)
         and (p_fim is null or (inv.created_at at time zone 'America/Manaus')::date <= p_fim)
    ) q;

  else
    select coalesce(jsonb_agg(x order by (x->>'total')::int desc), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('marca', m.nome, 'rotulo', m.nome,
        'total', sum(i.quantidade), 'posicoes', count(*)) x
        from public.estoque_itens i
        join public.estoque_marcas m on m.id = i.marca_id
       where i.ativo and (p_familia is null or i.tipo = p_familia)
       group by m.nome
    ) q;
  end if;

  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'total', v_total, 'linhas', v_lista);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.estoque_movimentos_listar(date, date, text, text, uuid, text, uuid, text, uuid, uuid, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_movimentos_listar(date, date, text, text, uuid, text, uuid, text, uuid, uuid, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.estoque_relatorio(text, text, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_relatorio(text, text, date, date) TO authenticated, service_role;