CREATE OR REPLACE FUNCTION public.integracao_financeiro_hml_ler(p_recurso text, p_inicio date, p_fim date, p_offset integer DEFAULT 0, p_limite integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $fn$
DECLARE resultado jsonb;
BEGIN
 IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio OR p_fim - p_inicio > 366 OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000 OR p_limite IS NULL OR p_limite < 1 OR p_limite > 500 THEN RAISE EXCEPTION 'Parametros invalidos' USING ERRCODE='22023'; END IF;
 IF p_recurso = 'recebimentos' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO resultado FROM (
   SELECT l.id, l.data_lancamento, l.valor_bruto, l.desconto, l.valor_final, l.taxas_total, l.receita_liquida, l.status, l.grupo_receita, l.condicao_recebimento, l.liquida_conta_receber_id, l.created_at, l.updated_at
   FROM public.caixa_lancamentos l WHERE l.data_lancamento BETWEEN p_inicio AND p_fim AND l.condicao_recebimento = 'imediato' ORDER BY l.data_lancamento,l.id OFFSET p_offset LIMIT p_limite
  ) x;
 ELSIF p_recurso = 'pagamentos' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO resultado FROM (
   SELECT p.id,p.lancamento_id,p.forma_pagamento_id,p.valor,p.parcelas,p.taxa_percentual,p.taxa_valor,p.valor_liquido,p.adquirente,p.canal,p.meio_pagamento,p.modalidade,p.taxa_cliente_percentual,p.taxa_cliente_valor,p.created_at
   FROM public.caixa_pagamentos p JOIN public.caixa_lancamentos l ON l.id=p.lancamento_id WHERE l.data_lancamento BETWEEN p_inicio AND p_fim AND l.condicao_recebimento='imediato' ORDER BY l.data_lancamento,p.id OFFSET p_offset LIMIT p_limite
  ) x;
 ELSIF p_recurso = 'formas_pagamento' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO resultado FROM (
   SELECT id,nome,ativo,ordem,eh_dinheiro,taxa_padrao_percentual,tipo,permite_parcelamento,max_parcelas,liquidacao_imediata,prazo_liquidacao_dias,meio_taxa FROM public.formas_pagamento ORDER BY id OFFSET p_offset LIMIT p_limite
  ) x;
 ELSIF p_recurso = 'taxas' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO resultado FROM (
   SELECT id,forma_pagamento_id,parcelas,taxa_percentual,created_at,updated_at FROM public.formas_pagamento_taxas ORDER BY id OFFSET p_offset LIMIT p_limite
  ) x;
 ELSIF p_recurso = 'titulos' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO resultado FROM (
   SELECT c.id,c.origem,c.competencia,c.data_emissao,c.vencimento,c.valor_original,c.status,c.parcela_atual,c.parcela_total,c.grupo_parcela,c.caixa_lancamento_id,c.cliente_cnpj_id,c.documento,c.nota_fiscal,c.created_at,c.updated_at,
   coalesce((SELECT sum(r.valor) FROM public.contas_receber_recebimentos r WHERE r.conta_receber_id=c.id),0)::numeric(12,2) AS valor_recebido,
   (c.valor_original-coalesce((SELECT sum(r.valor) FROM public.contas_receber_recebimentos r WHERE r.conta_receber_id=c.id),0))::numeric(12,2) AS saldo
   FROM public.contas_receber c WHERE c.data_emissao BETWEEN p_inicio AND p_fim ORDER BY c.data_emissao,c.id OFFSET p_offset LIMIT p_limite
  ) x;
 ELSIF p_recurso = 'recebimentos_titulos' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO resultado FROM (
   SELECT id,conta_receber_id,data_recebimento,valor,forma_pagamento_id,caixa_lancamento_id,estorno_de_id,created_at FROM public.contas_receber_recebimentos WHERE data_recebimento BETWEEN p_inicio AND p_fim ORDER BY data_recebimento,id OFFSET p_offset LIMIT p_limite
  ) x;
 ELSE RAISE EXCEPTION 'Recurso nao autorizado' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('recurso',p_recurso,'inicio',p_inicio,'fim',p_fim,'offset',p_offset,'limite',p_limite,'dados',resultado);
END;
$fn$;
REVOKE ALL ON FUNCTION public.integracao_financeiro_hml_ler(text,date,date,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_financeiro_hml_ler(text,date,date,integer,integer) TO service_role;
COMMENT ON FUNCTION public.integracao_financeiro_hml_ler(text,date,date,integer,integer) IS 'Consulta financeira fixa e sem escrita para endpoint HML autenticado. Nao fornece credencial de banco ao consumidor; nao expõe dados pessoais ou SQL dinamico.';