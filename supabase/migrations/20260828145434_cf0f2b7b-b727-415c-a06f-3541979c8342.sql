CREATE OR REPLACE FUNCTION public.comissao_entrega_config()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
declare v jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not (public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar')
          or public.has_permission(auth.uid(), 'caixa', 'visualizar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para consultar a comissão de entrega.');
  end if;
  select s.value into v from public.settings s where s.key = 'comissao_entrega';
  return jsonb_build_object(
    'ok', true,
    'valor_taxa_fixa', round(coalesce((v->>'valor_taxa_fixa')::numeric, 5), 2),
    'valor_taxa_com_avaliacao', case
      when (v->>'valor_taxa_com_avaliacao') is null then null
      else round((v->>'valor_taxa_com_avaliacao')::numeric, 2) end,
    'exige_validacao', coalesce((v->>'exige_validacao')::boolean, true),
    'ativo', coalesce((v->>'ativo')::boolean, true)
  );
end
$$;

CREATE OR REPLACE FUNCTION public.comissao_entrega_entregadores()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'nome', coalesce(c.nome_exibicao, c.nome),
           'cargo', cg.nome,
           'habilitado', true)
           order by coalesce(c.nome_exibicao, c.nome)), '[]'::jsonb)
    from public.colaboradores c
    left join public.cargos cg on cg.id = c.cargo_id
   where c.status = 'ativo'
     and (c.recebe_comissao_entrega or coalesce(cg.funcao_entrega, false))
     and (public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar')
          or public.has_permission(auth.uid(), 'caixa', 'visualizar'));
$$;

CREATE OR REPLACE FUNCTION public.comissao_entrega_colaboradores()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_itens jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador')
     OR public.has_permission(v_uid,'comissao_entrega','configurar')
     OR public.has_permission(v_uid,'admin_parametros','configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'nome', coalesce(c.nome_exibicao, c.nome),
    'cargo', cg.nome,
    'habilitado', (c.recebe_comissao_entrega or coalesce(cg.funcao_entrega, false))
  ) ORDER BY coalesce(c.nome_exibicao, c.nome)), '[]'::jsonb) INTO v_itens
  FROM public.colaboradores c
  LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
  WHERE c.status = 'ativo';
  RETURN jsonb_build_object('ok', true, 'itens', v_itens);
END;
$$;