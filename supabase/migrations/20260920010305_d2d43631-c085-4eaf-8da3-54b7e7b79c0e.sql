CREATE OR REPLACE FUNCTION public.estoque_buscar(p_busca text DEFAULT NULL::text, p_tipo text DEFAULT NULL::text, p_marca_id uuid DEFAULT NULL::uuid, p_polegada text DEFAULT NULL::text, p_localizacao_id uuid DEFAULT NULL::uuid, p_disponibilidade text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q text := nullif(public.estoque_norm(p_busca), '');
  v_total integer; v_led integer; v_main integer;
  v_itens jsonb;
  v_ver_custo boolean := public.has_permission(auth.uid(), 'estoque', 'movimentar');
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  with base as (
    select i.id, i.tipo
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
            or (p_disponibilidade = 'baixo' and i.estoque_minimo > 0
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
  select count(*)::int,
         count(*) filter (where tipo = 'kit_led')::int,
         count(*) filter (where tipo = 'placa_main')::int
    into v_total, v_led, v_main from base;

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
            or (p_disponibilidade = 'baixo' and i.estoque_minimo > 0
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
     order by i.tipo, m.nome, i.modelo
     limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'marca_id', b.marca_id, 'marca_nome', b.marca_nome,
           'polegada', b.polegada, 'modelo', b.modelo, 'codigo_placa', b.codigo_placa,
           'condicao', b.condicao,
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
                          when b.estoque_minimo > 0 and (b.quantidade - b.quantidade_reservada) <= b.estoque_minimo then 'baixo'
                          else 'em_estoque' end
         )), '[]'::jsonb) into v_itens from base b;

  return jsonb_build_object('ok', true, 'total', v_total, 'total_led', v_led,
    'total_main', v_main, 'itens', v_itens);
end;
$function$;