DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['comissao_pagamentos','comissao_pagamento_itens','comissao_ajustes','contas_receber','contas_receber_recebimentos','despesas','folha_colaboradores','folha_lancamentos','folha_pagamentos','folha_competencias']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Explicit deny-write policies (documented intent: writes only via SECURITY DEFINER RPCs)
CREATE POLICY "Escrita somente via RPC" ON public.comissao_pagamentos AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.comissao_pagamento_itens AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.comissao_ajustes AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.contas_receber AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.contas_receber_recebimentos AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.despesas AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.folha_colaboradores AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.folha_lancamentos AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.folha_pagamentos AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);
CREATE POLICY "Escrita somente via RPC" ON public.folha_competencias AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (false);

-- Privileged functions: block anonymous execution
REVOKE ALL ON FUNCTION public.caixa_sync_contas_receber() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.colaboradores_atualizar(uuid, text, text, uuid, uuid, date, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.colaboradores_registrar(text, text, uuid, uuid, date, numeric, text, text, text, text, colaborador_status, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.forma_pagamento_taxa(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.colaboradores_atualizar(uuid, text, text, uuid, uuid, date, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.colaboradores_registrar(text, text, uuid, uuid, date, numeric, text, text, text, text, colaborador_status, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.forma_pagamento_taxa(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.caixa_sync_contas_receber() TO service_role;