CREATE OR REPLACE FUNCTION public.estoque_inventario_inicial(p_lote text, p_itens jsonb, p_esperado jsonb, p_confirmar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pos jsonb; v_marca_id uuid; v_loc_id uuid; v_item public.estoque_itens%rowtype;
  v_item_id uuid; v_total int := 0; v_posicoes int := 0; v_gavetas int;
  v_marcas jsonb := '{}'::jsonb; v_marca text; v_qtd int; v_bloqueios jsonb := '[]'::jsonb;
  v_lote text; v_existente int; v_saldo int; v_obs text;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_lote := nullif(btrim(coalesce(p_lote, '')), '');
  if v_lote is null then return jsonb_build_object('ok', false, 'code', 'LOTE_OBRIGATORIO'); end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'code', 'SEM_ITENS');
  end if;

  select count(*) into v_existente from public.estoque_movimentos where lote = v_lote;
  if v_existente > 0 then
    return jsonb_build_object('ok', false, 'code', 'LOTE_JA_IMPORTADO', 'lote', v_lote,
      'movimentos', v_existente,
      'total', (select coalesce(sum(quantidade),0) from public.estoque_movimentos where lote = v_lote));
  end if;

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

  select count(distinct (el.value ->> 'gaveta')) into v_gavetas
    from jsonb_array_elements(p_itens) as el;

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
    select quantidade into v_saldo from public.estoque_itens
     where tipo = 'kit_led' and marca_id = v_marca_id
       and estoque_norm(modelo) = estoque_norm(v_pos ->> 'modelo')
       and localizacao_id = v_loc_id limit 1;
    if v_saldo is not null and v_saldo <> 0 then
      v_bloqueios := v_bloqueios || jsonb_build_object(
        'modelo', v_pos ->> 'modelo', 'gaveta', v_pos ->> 'gaveta',
        'saldo_atual', v_saldo, 'quantidade_carga', (v_pos ->> 'quantidade')::int);
    end if;
    v_saldo := null;
  end loop;

  if jsonb_array_length(v_bloqueios) > 0 then
    return jsonb_build_object('ok', false, 'code', 'SALDO_EXISTENTE', 'bloqueios', v_bloqueios);
  end if;

  if not p_confirmar then
    return jsonb_build_object('ok', true, 'previa', true, 'lote', v_lote,
      'posicoes', v_posicoes, 'total', v_total, 'gavetas', v_gavetas, 'marcas', v_marcas);
  end if;

  for v_pos in select * from jsonb_array_elements(p_itens) loop
    select id into v_marca_id from public.estoque_marcas
     where lower(btrim(nome)) = lower(btrim(v_pos ->> 'marca')) limit 1;
    select id into v_loc_id from public.estoque_localizacoes
     where grupo = 'LED' and numero = (v_pos ->> 'gaveta')::int limit 1;
    v_qtd := (v_pos ->> 'quantidade')::int;
    v_obs := nullif(btrim(coalesce(v_pos ->> 'observacao', '')), '');

    select id into v_item_id from public.estoque_itens
     where tipo = 'kit_led' and marca_id = v_marca_id
       and estoque_norm(modelo) = estoque_norm(v_pos ->> 'modelo')
       and localizacao_id = v_loc_id limit 1;

    if v_item_id is null then
      insert into public.estoque_itens (tipo, marca_id, polegada, modelo, localizacao_id,
        quantidade, custo_unitario, observacao, created_by, updated_by)
      values ('kit_led', v_marca_id, v_pos ->> 'polegada', btrim(v_pos ->> 'modelo'), v_loc_id,
        0, null, v_obs, auth.uid(), auth.uid())
      returning id into v_item_id;
    elsif v_obs is not null then
      update public.estoque_itens set observacao = v_obs, updated_by = auth.uid() where id = v_item_id;
    end if;

    insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, saldo_anterior,
      saldo_posterior, origem, lote, custo_unitario, created_by)
    values (v_item_id, 'entrada', 'saldo_abertura', v_qtd, 0, v_qtd,
      'Inventário Inicial ITV', v_lote, null, auth.uid());

    update public.estoque_itens set quantidade = v_qtd, updated_by = auth.uid() where id = v_item_id;
    v_item_id := null;
  end loop;

  return jsonb_build_object('ok', true, 'lote', v_lote, 'posicoes', v_posicoes,
    'total', v_total, 'gavetas', v_gavetas, 'marcas', v_marcas);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.estoque_inventario_inicial(text, jsonb, jsonb, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.estoque_inventario_inicial(text, jsonb, jsonb, boolean) TO authenticated, service_role;