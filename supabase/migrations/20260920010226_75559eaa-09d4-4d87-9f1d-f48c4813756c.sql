-- 1. Condição da placa
ALTER TABLE public.estoque_itens ADD COLUMN IF NOT EXISTS condicao text;
ALTER TABLE public.estoque_itens DROP CONSTRAINT IF EXISTS estoque_itens_condicao_check;
ALTER TABLE public.estoque_itens ADD CONSTRAINT estoque_itens_condicao_check
  CHECK (condicao IS NULL OR condicao IN ('nova','usada_testada','recuperada_testada','aguardando_teste','defeituosa'));

-- 2. Cadastro de peça (overload único)
DROP FUNCTION IF EXISTS public.estoque_item_salvar(jsonb);

CREATE OR REPLACE FUNCTION public.estoque_item_salvar(p_dados jsonb, p_compatibilidades text[] DEFAULT '{}'::text[], p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_tipo text := p_dados ->> 'tipo';
  v_modelo text := btrim(coalesce(p_dados ->> 'modelo', ''));
  v_codigo text := nullif(btrim(coalesce(p_dados ->> 'codigo_placa', '')), '');
  v_polegada text := nullif(btrim(coalesce(p_dados ->> 'polegada', '')), '');
  v_qtd int := greatest(coalesce((p_dados ->> 'quantidade')::int, 0), 0);
  v_custo numeric(12,2) := nullif(btrim(coalesce(p_dados ->> 'custo_unitario', '')), '')::numeric;
  v_cond text := nullif(btrim(coalesce(p_dados ->> 'condicao', '')), '');
  v_motivo text := coalesce(nullif(p_dados ->> 'motivo_inicial', ''), 'entrada_inicial');
  v_compat text;
begin
  if p_id is null then
    if not public.has_permission(auth.uid(), 'estoque', 'criar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
    end if;
  else
    if not public.has_permission(auth.uid(), 'estoque', 'editar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
    end if;
  end if;

  if v_tipo not in ('kit_led','placa_main') then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO');
  end if;
  if v_modelo = '' then return jsonb_build_object('ok', false, 'code', 'MODELO_OBRIGATORIO'); end if;
  if v_tipo = 'kit_led' and v_polegada is null then
    return jsonb_build_object('ok', false, 'code', 'POLEGADA_OBRIGATORIA');
  end if;
  if v_tipo = 'placa_main' and v_codigo is null then
    return jsonb_build_object('ok', false, 'code', 'CODIGO_PLACA_OBRIGATORIO');
  end if;
  if v_custo is not null and v_custo < 0 then v_custo := null; end if;
  if v_cond is not null and v_cond not in ('nova','usada_testada','recuperada_testada','aguardando_teste','defeituosa') then
    v_cond := null;
  end if;
  if v_motivo not in ('entrada_inicial','saldo_abertura','entrada_compra') then
    v_motivo := 'entrada_inicial';
  end if;

  if p_id is null then
    insert into public.estoque_itens (
      tipo, marca_id, polegada, modelo, codigo_placa, condicao, localizacao_id,
      quantidade, estoque_minimo, custo_unitario, observacao, teste, created_by, updated_by)
    values (
      v_tipo, (p_dados ->> 'marca_id')::uuid, v_polegada, v_modelo, v_codigo, v_cond,
      (p_dados ->> 'localizacao_id')::uuid, v_qtd,
      greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      v_custo, nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      coalesce((p_dados ->> 'teste')::boolean, false),
      auth.uid(), auth.uid())
    returning id into v_id;

    if v_qtd > 0 then
      insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, observacao,
        saldo_anterior, saldo_posterior, custo_unitario, created_by)
      values (v_id, 'entrada', v_motivo, v_qtd,
        case when v_motivo = 'saldo_abertura' then 'Saldo de abertura do cadastro.'
             else 'Quantidade inicial do cadastro.' end,
        0, v_qtd, v_custo, auth.uid());
    end if;
  else
    v_id := p_id;
    update public.estoque_itens set
      marca_id = (p_dados ->> 'marca_id')::uuid,
      polegada = v_polegada,
      modelo = v_modelo,
      codigo_placa = v_codigo,
      condicao = case when p_dados ? 'condicao' then v_cond else condicao end,
      localizacao_id = (p_dados ->> 'localizacao_id')::uuid,
      estoque_minimo = greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      custo_unitario = case when p_dados ? 'custo_unitario' then v_custo else custo_unitario end,
      observacao = nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
      updated_by = auth.uid()
    where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
    delete from public.estoque_compatibilidades where item_id = v_id;
  end if;

  foreach v_compat in array coalesce(p_compatibilidades, '{}') loop
    if btrim(v_compat) <> '' then
      insert into public.estoque_compatibilidades (item_id, modelo, created_by)
      values (v_id, btrim(v_compat), auth.uid())
      on conflict do nothing;
    end if;
  end loop;

  perform public.registrar_auditoria('estoque',
    case when p_id is null then 'item_criar' else 'item_editar' end,
    null, jsonb_build_object('item_id', v_id, 'dados', p_dados, 'compatibilidades', p_compatibilidades));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

-- 3. Busca: expõe condição e compatibilidades confirmadas
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

  create temp table if not exists _x (i int) on commit drop;

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

-- 4. Detalhe da gaveta com reservado e condição
CREATE OR REPLACE FUNCTION public.estoque_gaveta_detalhe(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_loc record; v_itens jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select * into v_loc from public.estoque_localizacoes where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'tipo', i.tipo, 'marca_nome', m.nome, 'polegada', i.polegada,
           'modelo', i.modelo, 'codigo_placa', i.codigo_placa, 'condicao', i.condicao,
           'quantidade', i.quantidade, 'quantidade_reservada', i.quantidade_reservada
         ) order by m.nome, i.modelo), '[]'::jsonb) into v_itens
    from public.estoque_itens i join public.estoque_marcas m on m.id = i.marca_id
   where i.localizacao_id = p_id and i.ativo;

  return jsonb_build_object('ok', true,
    'gaveta', jsonb_build_object('id', v_loc.id, 'grupo', v_loc.grupo, 'numero', v_loc.numero,
      'codigo', v_loc.codigo, 'descricao', v_loc.descricao, 'ativo', v_loc.ativo,
      'label', v_loc.grupo || ' — Gaveta ' || lpad(v_loc.numero::text, 2, '0')),
    'itens', v_itens);
end;
$function$;

-- 5. Resumo gerencial ampliado
CREATE OR REPLACE FUNCTION public.estoque_resumo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hoje date := (now() at time zone 'America/Manaus')::date; v_fam jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(jsonb_object_agg(t.tipo, jsonb_build_object(
           'fisico', t.fisico, 'reservado', t.reservado,
           'disponivel', greatest(t.fisico - t.reservado, 0),
           'modelos', t.modelos, 'gavetas', t.gavetas)), '{}'::jsonb) into v_fam
    from (
      select i.tipo, coalesce(sum(i.quantidade),0)::int fisico,
             coalesce(sum(i.quantidade_reservada),0)::int reservado,
             count(*)::int modelos,
             count(distinct i.localizacao_id) filter (where i.quantidade > 0)::int gavetas
        from public.estoque_itens i where i.ativo group by i.tipo
    ) t;

  return jsonb_build_object('ok', true,
    'familias', v_fam,
    'solicitacoes_pendentes', (select count(*) from public.estoque_solicitacoes where status = 'aguardando'),
    'minhas_solicitacoes_pendentes', (select count(*) from public.estoque_solicitacoes
       where status = 'aguardando' and tecnico_id = auth.uid()),
    'reservas_ativas', (select count(*) from public.estoque_reservas where status in ('ativa','parcialmente_utilizada')),
    'reservas_antigas', (select count(*) from public.estoque_reservas
       where status in ('ativa','parcialmente_utilizada') and created_at < now() - interval '7 days'),
    'entregas_hoje', (select count(*) from public.estoque_movimentos
       where tipo = 'saida' and reserva_id is not null
         and (created_at at time zone 'America/Manaus')::date = v_hoje),
    'baixas_hoje', (select count(*) from public.estoque_movimentos
       where tipo = 'saida' and motivo <> 'estorno'
         and (created_at at time zone 'America/Manaus')::date = v_hoje),
    'itens_sem_disponibilidade', (select count(*) from public.estoque_itens
       where ativo and (quantidade - quantidade_reservada) <= 0),
    'itens_abaixo_minimo', (select count(*) from public.estoque_itens
       where ativo and estoque_minimo > 0 and (quantidade - quantidade_reservada) <= estoque_minimo),
    'divergencias_inventario', (select count(*) from public.estoque_inventarios
       where diferenca <> 0 and created_at > now() - interval '30 days')
  );
end;
$function$;

-- 6. Necessidade de reposição
CREATE OR REPLACE FUNCTION public.estoque_reposicao(p_familia text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_linhas jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select coalesce(jsonb_agg(x order by (x->>'falta')::int desc), '[]'::jsonb) into v_linhas from (
    select jsonb_build_object(
      'id', i.id, 'tipo', i.tipo, 'marca_nome', m.nome, 'polegada', i.polegada,
      'modelo', i.modelo, 'codigo_placa', i.codigo_placa,
      'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
      'fisico', i.quantidade, 'reservado', i.quantidade_reservada,
      'disponivel', greatest(i.quantidade - i.quantidade_reservada, 0),
      'minimo', i.estoque_minimo,
      'falta', greatest(i.estoque_minimo - greatest(i.quantidade - i.quantidade_reservada, 0), 0),
      'status', case when greatest(i.quantidade - i.quantidade_reservada, 0) = 0 then 'sem_estoque' else 'baixo' end
    ) x
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo and i.estoque_minimo > 0
       and (p_familia is null or i.tipo = p_familia)
       and greatest(i.quantidade - i.quantidade_reservada, 0) <= i.estoque_minimo
  ) q;
  return jsonb_build_object('ok', true, 'linhas', v_linhas);
end;
$function$;

-- 7. Movimentações consolidadas com filtros
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
    'tecnico_nome', pt.nome_completo, 'responsavel', pr.nome_completo,
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

-- 8. Painel de gavetas
CREATE OR REPLACE FUNCTION public.estoque_gavetas_painel()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_linhas jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select coalesce(jsonb_agg(x order by x->>'grupo', (x->>'numero')::int), '[]'::jsonb) into v_linhas from (
    select jsonb_build_object(
      'id', l.id, 'grupo', l.grupo, 'numero', l.numero, 'codigo', l.codigo,
      'label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
      'descricao', l.descricao, 'ativo', l.ativo,
      'itens', count(i.id)::int,
      'total', coalesce(sum(i.quantidade), 0)::int,
      'reservado', coalesce(sum(i.quantidade_reservada), 0)::int) x
      from public.estoque_localizacoes l
      left join public.estoque_itens i on i.localizacao_id = l.id and i.ativo
     group by l.id, l.grupo, l.numero, l.codigo, l.descricao, l.ativo
  ) q;
  return jsonb_build_object('ok', true, 'linhas', v_linhas);
end;
$function$;

-- 9. Relatórios operacionais
DROP FUNCTION IF EXISTS public.estoque_relatorio(text, text);

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
      select jsonb_build_object('rotulo', coalesce(p.nome_completo, 'Sem técnico informado'),
        'total', sum(mv.quantidade), 'movimentos', count(*)) x
        from public.estoque_movimentos mv
        join public.estoque_itens i on i.id = mv.item_id
        left join public.profiles p on p.id = mv.tecnico_id
       where mv.tipo = 'saida'
         and (p_familia is null or i.tipo = p_familia)
         and (p_inicio is null or (mv.created_at at time zone 'America/Manaus')::date >= p_inicio)
         and (p_fim is null or (mv.created_at at time zone 'America/Manaus')::date <= p_fim)
       group by p.nome_completo
    ) q;

  elsif p_tipo = 'divergencias' then
    select coalesce(jsonb_agg(x order by x->>'data' desc), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('rotulo', m.nome || ' ' || i.modelo,
        'gaveta', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
        'sistema', inv.quantidade_sistema, 'contado', inv.quantidade_contada,
        'diferenca', inv.diferenca, 'data', inv.created_at,
        'responsavel', p.nome_completo) x
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

REVOKE EXECUTE ON FUNCTION public.estoque_reposicao(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_reposicao(text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.estoque_movimentos_listar(date, date, text, text, uuid, text, uuid, text, uuid, uuid, integer, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_movimentos_listar(date, date, text, text, uuid, text, uuid, text, uuid, uuid, integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.estoque_gavetas_painel() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_gavetas_painel() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.estoque_relatorio(text, text, date, date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_relatorio(text, text, date, date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.estoque_item_salvar(jsonb, text[], uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_item_salvar(jsonb, text[], uuid) TO authenticated, service_role;