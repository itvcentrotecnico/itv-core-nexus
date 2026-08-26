CREATE OR REPLACE FUNCTION public.admin_config_salvar(p_key text, p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF p_key NOT IN ('organization','identidade','financeiro','custos','metas','planejamento','comissao_entrega') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA');
  END IF;
  SELECT value INTO v_old FROM public.settings WHERE key = p_key;
  INSERT INTO public.settings (key, value) VALUES (p_key, coalesce(v_old,'{}'::jsonb) || p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin_parametros', 'configurar', jsonb_build_object('key', p_key, 'value', v_old),
          jsonb_build_object('key', p_key, 'value', coalesce(v_old,'{}'::jsonb) || p_value));
  RETURN jsonb_build_object('ok', true);
END; $$;

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
    'habilitado', c.recebe_comissao_entrega
  ) ORDER BY coalesce(c.nome_exibicao, c.nome)), '[]'::jsonb) INTO v_itens
  FROM public.colaboradores c
  LEFT JOIN public.cargos cg ON cg.id = c.cargo_id
  WHERE c.status = 'ativo';
  RETURN jsonb_build_object('ok', true, 'itens', v_itens);
END; $$;

CREATE OR REPLACE FUNCTION public.comissao_entrega_flag_colaborador(p_colaborador_id uuid, p_habilitado boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_old public.colaboradores%rowtype;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador')
     OR public.has_permission(v_uid,'comissao_entrega','configurar')
     OR public.has_permission(v_uid,'admin_parametros','configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT * INTO v_old FROM public.colaboradores WHERE id = p_colaborador_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  END IF;
  UPDATE public.colaboradores
     SET recebe_comissao_entrega = coalesce(p_habilitado, false), updated_by = v_uid
   WHERE id = p_colaborador_id;
  PERFORM public.registrar_auditoria('comissao_entrega', 'configurar', to_jsonb(v_old),
    (SELECT to_jsonb(c) FROM public.colaboradores c WHERE c.id = p_colaborador_id));
  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE EXECUTE ON FUNCTION public.comissao_entrega_colaboradores() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.comissao_entrega_flag_colaborador(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.comissao_entrega_colaboradores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.comissao_entrega_flag_colaborador(uuid, boolean) TO authenticated;