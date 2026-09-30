CREATE OR REPLACE FUNCTION public.caixa_classificar_receita(p_id uuid, p_grupo grupo_receita)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old public.grupo_receita;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'administrador') OR public.has_permission(auth.uid(),'caixa','administrar')) THEN
    RETURN jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Somente a Gerência pode classificar receitas.');
  END IF;
  IF p_grupo IS NULL THEN RETURN jsonb_build_object('ok',false,'code','GRUPO_OBRIGATORIO','message','Escolha a categoria.'); END IF;
  SELECT grupo_receita INTO v_old FROM public.caixa_lancamentos WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NAO_ENCONTRADO','message','Lançamento não encontrado.'); END IF;
  UPDATE public.caixa_lancamentos SET grupo_receita=p_grupo, grupo_classificado_por=auth.uid(),
    grupo_classificado_em=now(), updated_by=auth.uid() WHERE id=p_id;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (auth.uid(), 'caixa', 'classificar_receita',
    jsonb_build_object('lancamento_id', p_id, 'grupo', v_old),
    jsonb_build_object('lancamento_id', p_id, 'grupo', p_grupo));
  RETURN jsonb_build_object('ok',true);
END $function$;