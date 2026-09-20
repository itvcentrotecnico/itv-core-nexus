-- custo só quando informado
CREATE OR REPLACE FUNCTION public.estoque_item_salvar(p_dados jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_id uuid; v_qtd int; v_custo numeric(12,2);
begin
  v_id := nullif(p_dados ->> 'id', '')::uuid;
  v_custo := nullif(p_dados ->> 'custo_unitario', '')::numeric;
  if v_custo is not null and v_custo < 0 then v_custo := 0; end if;

  if v_id is null then
    if not public.has_permission(auth.uid(), 'estoque', 'criar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
    end if;
    v_qtd := greatest(coalesce((p_dados ->> 'quantidade')::int, 0), 0);
    insert into public.estoque_itens (
      tipo, marca_id, polegada, modelo, codigo_placa, localizacao_id,
      quantidade, estoque_minimo, custo_unitario, observacao, teste, created_by, updated_by)
    values (
      p_dados ->> 'tipo', (p_dados ->> 'marca_id')::uuid,
      nullif(p_dados ->> 'polegada', ''), btrim(p_dados ->> 'modelo'),
      nullif(btrim(coalesce(p_dados ->> 'codigo_placa','')), ''),
      (p_dados ->> 'localizacao_id')::uuid,
      v_qtd, greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      v_custo, nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      coalesce((p_dados ->> 'teste')::boolean, false), auth.uid(), auth.uid())
    returning id into v_id;

    if v_qtd > 0 then
      insert into public.estoque_movimentos (
        item_id, tipo, motivo, quantidade, observacao,
        saldo_anterior, saldo_posterior, custo_unitario, created_by)
      values (v_id, 'entrada', 'entrada_inicial', v_qtd, 'Cadastro inicial da peça',
        0, v_qtd, v_custo, auth.uid());
    end if;
  else
    if not public.has_permission(auth.uid(), 'estoque', 'editar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
    end if;
    update public.estoque_itens set
      marca_id = coalesce((p_dados ->> 'marca_id')::uuid, marca_id),
      polegada = coalesce(nullif(p_dados ->> 'polegada',''), polegada),
      modelo = coalesce(nullif(btrim(coalesce(p_dados ->> 'modelo','')),''), modelo),
      codigo_placa = nullif(btrim(coalesce(p_dados ->> 'codigo_placa','')), ''),
      localizacao_id = coalesce((p_dados ->> 'localizacao_id')::uuid, localizacao_id),
      estoque_minimo = greatest(coalesce((p_dados ->> 'estoque_minimo')::int, estoque_minimo), 0),
      custo_unitario = case when p_dados ? 'custo_unitario' then v_custo else custo_unitario end,
      observacao = nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
      updated_by = auth.uid()
    where id = v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$function$;

-- carga oficial: prévia e confirmação
CREATE OR REPLACE FUNCTION public.estoque_inventario_inicial(
  p_lote text,
  p_itens jsonb,
  p_esperado jsonb,
  p_confirmar boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_pos jsonb; v_marca_id uuid; v_loc_id uuid; v_item public.estoque_itens%rowtype;
  v_item_id uuid; v_total int := 0; v_posicoes int := 0; v_gavetas int;
  v_marcas jsonb := '{}'::jsonb; v_marca text; v_qtd int; v_bloqueios jsonb := '[]'::jsonb;
  v_lote text; v_existente int;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_lote := nullif(btrim(coalesce(p_lote, '')), '');
  if v_lote is null then return jsonb_build_object('ok', false, 'code', 'LOTE_OBRIGATORIO'); end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'code', 'SEM_ITENS');
  end if;

  -- idempotência
  select count(*) into v_existente from public.estoque_movimentos where lote = v_lote;
  if v_existente > 0 then
    return jsonb_build_object('ok', false, 'code', 'LOTE_JA_IMPORTADO', 'lote', v_lote,
      'movimentos', v_existente,
      'total', (select coalesce(sum(quantidade),0) from public.estoque_movimentos where lote = v_lote));
  end if;

  -- totais informados
  for v_pos in select * from jsonb_array_elements(p_itens) loop
    v_marca := btrim(v_pos ->> 'marca');
    v_qtd := (v_pos ->> 'quantidade')::int;
    if v_qtd is null or v_qtd <= 0 then
      return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA', 'modelo', v_pos ->> 'modelo');
    end if;
    v_total := v_total + v_qtd;
    v_posicoes := v_posicoes + 1;
    v_marcas := jsonb_set(v_marcas, array[v_marca],
      to_jsonb(coalesce((v_marcas ->> v_marca)::int, 0) + v_qtd));
  end loop;

  select count(distinct (v_pos ->> 'gaveta')) into v_gavetas
    from jsonb_array_elements(p_itens) v_pos;

  -- conferência contra o esperado
  if p_esperado is not null then
    if (p_esperado ->> 'posicoes')::int is distinct from v_posicoes
       or (p_esperado ->> 'total')::int is distinct from v_total
       or (p_esperado ->> 'gavetas')::int is distinct from v_gavetas
       or coalesce(p_esperado -> 'marcas', '{}'::jsonb) <> v_marcas then
      return jsonb_build_object('ok', false, 'code', 'DIVERGENCIA',
        'posicoes', v_posicoes, 'total', v_total, 'gavetas', v_gavetas,
        'marcas', v_marcas, 'esperado', p_esperado);
    end if;
  end if;

  -- validações por posição (marca, gaveta, saldo existente)
  for v_pos in select * from jsonb_array_elements(p_itens) loop
    select id into v_marca_id from public.estoque_marcas
     where lower(btrim(nome)) = lower(btrim(v_pos ->> 'marca')) limit 1;
    if v_marca_id is null then
      return jsonb_build_object('ok', false, 'code', 'MARCA_NAO_ENCONTRADA', 'marca', v_pos ->> 'marca');
    end if;
    select id into v_loc_id from public.estoque_localizacoes
     where grupo = 'LED' and numero = (v_pos ->> 'gaveta')::int limit 1;
    if v_loc_id is null then
      return jsonb_build_object('ok', false, 'code', 'GAVETA_NAO_ENCONTRADA', 'gaveta', v_pos ->> 'gaveta');
    end if;
    select * into v_item from public.estoque_itens
     where tipo = 'kit_led' and marca_id = v_marca_id
       and estoque_norm(modelo) = estoque_norm(v_pos ->> 'modelo')
       and localizacao_id = v_loc_id limit 1;
    if found and v_item.quantidade <> 0 then
      v_bloqueios := v_bloqueios || jsonb_build_object(
        'modelo', v_pos ->> 'modelo', 'gaveta', v_pos ->> 'gaveta',
        'saldo_atual', v_item.quantidade, 'quantidade_carga', (v_pos ->> 'quantidade')::int);
    end if;
  end loop;

  if jsonb_array_length(v_bloqueios) > 0 then
    return jsonb_build_object('ok', false, 'code', 'SALDO_EXISTENTE', 'bloqueios', v_bloqueios);
  end if;

  if not p_confirmar then
    return jsonb_build_object('ok', true, 'previa', true, 'lote', v_lote,
      'posicoes', v_posicoes, 'total', v_total, 'gavetas', v_gavetas, 'marcas', v_marcas);
  end if;

  -- gravação (transacional: qualquer erro desfaz tudo)
  for v_pos in select * from jsonb_array_elements(p_itens) loop
    select id into v_marca_id from public.estoque_marcas
     where lower(btrim(nome)) = lower(btrim(v_pos ->> 'marca')) limit 1;
    select id into v_loc_id from public.estoque_localizacoes
     where grupo = 'LED' and numero = (v_pos ->> 'gaveta')::int limit 1;
    v_qtd := (v_pos ->> 'quantidade')::int;

    select id into v_item_id from public.estoque_itens
     where tipo = 'kit_led' and marca_id = v_marca_id
       and estoque_norm(modelo) = estoque_norm(v_pos ->> 'modelo')
       and localizacao_id = v_loc_id limit 1;

    if v_item_id is null then
      insert into public.estoque_itens (
        tipo, marca_id, polegada, modelo, localizacao_id, quantidade,
        custo_unitario, observacao, created_by, updated_by)
      values ('kit_led', v_marca_id, nullif(btrim(coalesce(v_pos ->> 'polegada','')), ''),
        btrim(v_pos ->> 'modelo'), v_loc_id, 0, null,
        nullif(btrim(coalesce(v_pos ->> 'observacao','')), ''), auth.uid(), auth.uid())
      returning id into v_item_id;
    else
      update public.estoque_itens
         set observacao = coalesce(nullif(btrim(coalesce(v_pos ->> 'observacao','')), ''), observacao),
             ativo = true, updated_by = auth.uid()
       where id = v_item_id;
    end if;

    insert into public.estoque_movimentos (
      item_id, tipo, motivo, quantidade, observacao, lote,
      saldo_anterior, saldo_posterior, custo_unitario, created_by)
    values (v_item_id, 'entrada', 'saldo_abertura', v_qtd, 'Inventário Inicial ITV', v_lote,
      0, v_qtd, null, auth.uid());

    update public.estoque_itens set quantidade = v_qtd, updated_by = auth.uid() where id = v_item_id;
  end loop;

  return jsonb_build_object('ok', true, 'lote', v_lote, 'posicoes', v_posicoes,
    'total', v_total, 'gavetas', v_gavetas, 'marcas', v_marcas);
end;
$function$;

-- conferência de gaveta
CREATE OR REPLACE FUNCTION public.estoque_inventario_gaveta(p_localizacao_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_itens jsonb; v_loc record;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select l.*, l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0') as label
    into v_loc from public.estoque_localizacoes l where l.id = p_localizacao_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', i.id, 'tipo', i.tipo, 'marca_nome', m.nome, 'modelo', i.modelo,
    'polegada', i.polegada, 'codigo_placa', i.codigo_placa, 'observacao', i.observacao,
    'quantidade_sistema', i.quantidade, 'reservado', i.quantidade_reservada,
    'ultima_conferencia', (select max(c.created_at) from public.estoque_inventarios c where c.item_id = i.id)
  ) order by m.nome, i.modelo), '[]'::jsonb) into v_itens
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
   where i.localizacao_id = p_localizacao_id and i.ativo;

  return jsonb_build_object('ok', true, 'gaveta', v_loc.label, 'localizacao_id', v_loc.id, 'itens', v_itens);
end;
$function$;

CREATE OR REPLACE FUNCTION public.estoque_inventario_registrar(
  p_localizacao_id uuid, p_contagens jsonb, p_observacao text DEFAULT null)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_c jsonb; v_item public.estoque_itens%rowtype; v_res jsonb := '[]'::jsonb;
        v_contada int; v_dif int; v_divergencias int := 0;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if jsonb_typeof(p_contagens) <> 'array' or jsonb_array_length(p_contagens) = 0 then
    return jsonb_build_object('ok', false, 'code', 'SEM_ITENS');
  end if;

  for v_c in select * from jsonb_array_elements(p_contagens) loop
    select * into v_item from public.estoque_itens where id = (v_c ->> 'item_id')::uuid;
    if not found or v_item.localizacao_id <> p_localizacao_id then
      return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
    end if;
    v_contada := (v_c ->> 'quantidade_contada')::int;
    if v_contada is null or v_contada < 0 then
      return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA', 'modelo', v_item.modelo);
    end if;
    v_dif := v_contada - v_item.quantidade;
    if v_dif <> 0 then v_divergencias := v_divergencias + 1; end if;

    insert into public.estoque_inventarios (
      localizacao_id, item_id, quantidade_sistema, quantidade_contada, diferenca,
      observacao, conferido_por)
    values (p_localizacao_id, v_item.id, v_item.quantidade, v_contada, v_dif,
      nullif(btrim(coalesce(p_observacao,'')), ''), auth.uid());

    v_res := v_res || jsonb_build_object('item_id', v_item.id, 'modelo', v_item.modelo,
      'sistema', v_item.quantidade, 'contado', v_contada, 'diferenca', v_dif);
  end loop;

  return jsonb_build_object('ok', true, 'divergencias', v_divergencias, 'itens', v_res);
end;
$function$;

-- relatórios
CREATE OR REPLACE FUNCTION public.estoque_relatorio(p_tipo text DEFAULT 'marca', p_familia text DEFAULT 'kit_led')
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_lista jsonb; v_total int;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(sum(i.quantidade), 0) into v_total
    from public.estoque_itens i where i.tipo = p_familia and i.ativo;

  if p_tipo = 'gaveta' then
    select coalesce(jsonb_agg(x order by x->>'ordem'), '[]'::jsonb) into v_lista from (
      select jsonb_build_object(
        'grupo_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
        'ordem', lpad(l.numero::text, 3, '0'),
        'total', sum(i.quantidade),
        'itens', jsonb_agg(jsonb_build_object('marca', m.nome, 'modelo', i.modelo,
                  'polegada', i.polegada, 'quantidade', i.quantidade,
                  'reservado', i.quantidade_reservada, 'observacao', i.observacao)
                 order by i.modelo)) as x
        from public.estoque_itens i
        join public.estoque_localizacoes l on l.id = i.localizacao_id
        join public.estoque_marcas m on m.id = i.marca_id
       where i.tipo = p_familia and i.ativo
       group by l.grupo, l.numero
    ) q;
  else
    select coalesce(jsonb_agg(x order by (x->>'total')::int desc), '[]'::jsonb) into v_lista from (
      select jsonb_build_object('marca', m.nome, 'total', sum(i.quantidade),
        'posicoes', count(*)) as x
        from public.estoque_itens i
        join public.estoque_marcas m on m.id = i.marca_id
       where i.tipo = p_familia and i.ativo
       group by m.nome
    ) q;
  end if;

  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'total', v_total, 'linhas', v_lista);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.estoque_inventario_inicial(text, jsonb, jsonb, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.estoque_inventario_gaveta(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.estoque_inventario_registrar(uuid, jsonb, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.estoque_relatorio(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_inventario_inicial(text, jsonb, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.estoque_inventario_gaveta(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.estoque_inventario_registrar(uuid, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.estoque_relatorio(text, text) TO authenticated, service_role;