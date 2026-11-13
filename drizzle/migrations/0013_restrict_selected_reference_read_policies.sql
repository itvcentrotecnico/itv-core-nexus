CREATE FUNCTION public.reference_module_access(p_modules text[]) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND p.active AND p.status='ativo') AND (public.has_role(auth.uid(),'administrador') OR EXISTS(SELECT 1 FROM public.role_permissions rp WHERE rp.module_key=ANY(p_modules) AND public.has_permission(auth.uid(),rp.module_key,rp.action)) OR EXISTS(SELECT 1 FROM public.user_permissions up WHERE up.user_id=auth.uid() AND up.module_key=ANY(p_modules) AND up.allowed AND public.has_permission(auth.uid(),up.module_key,up.action)));
$$;
REVOKE ALL ON FUNCTION public.reference_module_access(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reference_module_access(text[]) TO authenticated,service_role;
ALTER POLICY tipos_receita_select ON public.tipos_receita USING (public.reference_module_access(ARRAY['caixa','configuracoes','admin']));
ALTER POLICY "Origens visiveis para autenticados" ON public.origens_cliente USING (public.reference_module_access(ARRAY['coletas','caixa','relatorios','relatorios_faturamento','dashboard','configuracoes','admin']));
ALTER POLICY tipos_custo_select ON public.tipos_custo USING (public.reference_module_access(ARRAY['pecas','configuracoes','admin']));
ALTER POLICY modules_select_authenticated ON public.modules USING (public.reference_module_access(ARRAY[key,'admin','admin-permissoes']));
ALTER POLICY role_permissions_select_authenticated ON public.role_permissions USING (public.has_role(auth.uid(),role) OR public.reference_module_access(ARRAY['admin','admin-permissoes']));
ALTER POLICY "Autenticados consultam taxas de recebimento" ON public.taxas_recebimento USING (public.reference_module_access(ARRAY['caixa','financeiro','configuracoes','admin']));
ALTER POLICY categorias_pecas_select ON public.categorias_pecas USING (public.reference_module_access(ARRAY['pecas','configuracoes','admin']));
ALTER POLICY "Autenticados leem niveis" ON public.niveis_desempenho USING (public.reference_module_access(ARRAY['producao','metas','tecnicos','modo_tv','configuracoes','admin','admin_parametros']));
ALTER POLICY settings_select_authenticated ON public.settings USING (
 public.reference_module_access(ARRAY['admin','admin_parametros','configuracoes']) OR
 CASE key
 WHEN 'organization' THEN public.reference_module_access(ARRAY['dashboard'])
 WHEN 'identidade' THEN public.reference_module_access(ARRAY['dashboard'])
 WHEN 'coletas_mensagem' THEN public.reference_module_access(ARRAY['coletas'])
 WHEN 'modo_tv' THEN public.reference_module_access(ARRAY['modo_tv'])
 WHEN 'custos' THEN public.reference_module_access(ARRAY['pecas'])
 WHEN 'metas' THEN public.reference_module_access(ARRAY['metas','dashboard','producao'])
 WHEN 'planejamento' THEN public.reference_module_access(ARRAY['metas','relatorios_planejamento'])
 WHEN 'financeiro' THEN public.reference_module_access(ARRAY['financeiro'])
 WHEN 'governanca' THEN public.reference_module_access(ARRAY['financeiro','financeiro_tributos','admin_governanca'])
 WHEN 'operacional_parametros' THEN public.reference_module_access(ARRAY['operacional'])
 WHEN 'comissao_entrega' THEN public.reference_module_access(ARRAY['comissao_entrega'])
 WHEN 'resumo_executivo' THEN public.reference_module_access(ARRAY['operacional'])
 ELSE false END
);
ALTER POLICY fornecedores_select ON public.fornecedores USING (public.reference_module_access(ARRAY['pecas','financeiro','terceirizados','configuracoes','admin']));
ALTER POLICY "Autenticados leem tipos de servico" ON public.tipos_servico_tecnico USING (public.reference_module_access(ARRAY['producao','tecnicos','configuracoes','admin']));
ALTER POLICY formas_taxas_select ON public.formas_pagamento_taxas USING (public.reference_module_access(ARRAY['caixa','financeiro','comissoes','configuracoes','admin']));
ALTER POLICY formas_pagamento_select ON public.formas_pagamento USING (public.reference_module_access(ARRAY['caixa','financeiro','comissoes','comissao_entrega','folha','configuracoes','admin']));