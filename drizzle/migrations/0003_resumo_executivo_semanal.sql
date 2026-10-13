
CREATE TABLE public.resumos_executivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_inicio timestamptz NOT NULL,
  periodo_fim timestamptz NOT NULL,
  versao int NOT NULL DEFAULT 1,
  tipo text NOT NULL DEFAULT 'fechado' CHECK (tipo IN ('previa','fechado')),
  origem_geracao text NOT NULL DEFAULT 'manual' CHECK (origem_geracao IN ('manual','agendada')),
  narrativa_origem text NOT NULL DEFAULT 'estruturado' CHECK (narrativa_origem IN ('ia','estruturado')),
  indicadores jsonb NOT NULL,
  regras jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrativa jsonb NOT NULL DEFAULT '{}'::jsonb,
  prioridades jsonb NOT NULL DEFAULT '[]'::jsonb,
  revisado boolean NOT NULL DEFAULT false,
  revisado_por uuid,
  revisado_em timestamptz,
  gerado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (periodo_inicio, periodo_fim, versao)
);
GRANT SELECT ON public.resumos_executivos TO authenticated;
GRANT ALL ON public.resumos_executivos TO service_role;
ALTER TABLE public.resumos_executivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resumo ver gerencia" ON public.resumos_executivos FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'operacional','visualizar'));

CREATE TABLE public.resumo_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  origem text NOT NULL,
  status text NOT NULL CHECK (status IN ('sucesso','falha','ignorada')),
  mensagem text,
  resumo_id uuid REFERENCES public.resumos_executivos(id) ON DELETE SET NULL,
  executado_por uuid,
  executado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.resumo_execucoes TO authenticated;
GRANT ALL ON public.resumo_execucoes TO service_role;
ALTER TABLE public.resumo_execucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "execucoes ver gerencia" ON public.resumo_execucoes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'operacional','visualizar'));

CREATE TABLE public.decisoes_pendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao text NOT NULL CHECK (length(trim(descricao)) >= 3),
  contexto text,
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  prazo date,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','resolvida','cancelada')),
  resolucao text,
  resolvido_por uuid,
  resolvido_em timestamptz,
  criado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.decisoes_pendentes TO authenticated;
GRANT ALL ON public.decisoes_pendentes TO service_role;
ALTER TABLE public.decisoes_pendentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "decisoes ver" ON public.decisoes_pendentes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'operacional','visualizar'));
CREATE POLICY "decisoes criar" ON public.decisoes_pendentes FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(),'operacional','editar'));
CREATE POLICY "decisoes editar" ON public.decisoes_pendentes FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(),'operacional','editar'))
  WITH CHECK (public.has_permission(auth.uid(),'operacional','editar'));

INSERT INTO public.settings(key, value) VALUES ('resumo_executivo',
 '{"dia_semana":6,"hora":13,"destinatarios":[],"metas_sugeridas":{"leads_dia":50,"faturamento_mes":150000},"prazo_orcamento_horas":6,"prazo_marco_inicial":"recebimento_tv","prazo_contagem":"pendente"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Corte semanal (horário de Manaus)
CREATE OR REPLACE FUNCTION public.resumo_corte(p_ref timestamptz DEFAULT now())
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb; v_dia int; v_hora int; v_local timestamp; v_cand timestamp;
BEGIN
  SELECT value INTO cfg FROM settings WHERE key='resumo_executivo';
  v_dia := coalesce((cfg->>'dia_semana')::int,6); v_hora := coalesce((cfg->>'hora')::int,13);
  v_local := p_ref AT TIME ZONE 'America/Manaus';
  v_cand := date_trunc('day', v_local) - make_interval(days => ((extract(dow from v_local)::int - v_dia + 7) % 7)) + make_interval(hours => v_hora);
  IF v_cand > v_local THEN v_cand := v_cand - interval '7 days'; END IF;
  RETURN v_cand AT TIME ZONE 'America/Manaus';
END $$;

-- Cálculo determinístico (interno)
CREATE OR REPLACE FUNCTION public._resumo_calcular(p_inicio timestamptz, p_fim timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  d_ini date := (p_inicio AT TIME ZONE 'America/Manaus')::date;
  d_fim date := (p_fim AT TIME ZONE 'America/Manaus')::date;
  v_dias int; r jsonb := '{}'::jsonb; v jsonb; v_mes_ini date; v_meta record;
BEGIN
  SELECT count(*) INTO v_dias FROM generate_series(d_ini, d_fim - 1, interval '1 day') g WHERE extract(dow from g) <> 0;
  v_dias := greatest(v_dias,1);

  -- Leads (solicitações de coleta/entrega recebidas)
  SELECT jsonb_build_object(
    'total', count(*),
    'atendidos', count(*) FILTER (WHERE c.status='concluida'),
    'cancelados', count(*) FILTER (WHERE c.status='cancelada'),
    'pendentes', count(*) FILTER (WHERE c.status NOT IN ('concluida','cancelada')),
    'media_dia', round(count(*)::numeric / v_dias, 1),
    'dias_atendimento', v_dias,
    'sem_origem', count(*) FILTER (WHERE c.origem_id IS NULL),
    'por_origem', coalesce((SELECT jsonb_agg(jsonb_build_object('origem', x.nome, 'total', x.t) ORDER BY x.t DESC) FROM (
        SELECT coalesce(o.nome,'Não informada') nome, count(*) t FROM coletas_solicitacoes c2 LEFT JOIN origens_cliente o ON o.id=c2.origem_id
        WHERE c2.deleted_at IS NULL AND c2.created_at >= p_inicio AND c2.created_at < p_fim GROUP BY 1) x), '[]'::jsonb)
  ) INTO v FROM coletas_solicitacoes c WHERE c.deleted_at IS NULL AND c.created_at >= p_inicio AND c.created_at < p_fim;
  r := r || jsonb_build_object('leads', v);

  -- Entradas (Fechamento Semanal)
  SELECT jsonb_build_object(
    'informadas', count(*) FILTER (WHERE f.entradas IS NOT NULL) > 0,
    'total', sum(f.entradas),
    'semanas', count(*),
    'fonte', string_agg(DISTINCT f.entradas_fonte, ', ')
  ) INTO v FROM fechamentos_operacionais_semanais f WHERE f.inicio_periodo >= d_ini AND f.inicio_periodo < d_fim;
  r := r || jsonb_build_object('entradas', v);

  -- Laboratório (Produção técnica)
  SELECT jsonb_build_object(
    'enviados', count(*) FILTER (WHERE enviado_em >= p_inicio AND enviado_em < p_fim),
    'validados', count(*) FILTER (WHERE validado_em >= p_inicio AND validado_em < p_fim AND status='validado'),
    'rejeitados', count(*) FILTER (WHERE status IN ('rejeitado','correcao_solicitada') AND updated_at >= p_inicio AND updated_at < p_fim),
    'aguardando_validacao_corte', count(*) FILTER (WHERE enviado_em < p_fim AND (validado_em IS NULL OR validado_em >= p_fim) AND status NOT IN ('cancelado','rascunho','rejeitado')),
    'aguardando_mais_48h', count(*) FILTER (WHERE status='enviado_validacao' AND enviado_em < p_fim - interval '48 hours')
  ) INTO v FROM producao_tecnica;
  r := r || jsonb_build_object('laboratorio', v);

  -- Logística
  SELECT jsonb_build_object(
    'coletas_agendadas', count(*) FILTER (WHERE tipo='coleta' AND data_agendada >= d_ini AND data_agendada < d_fim),
    'coletas_realizadas', count(*) FILTER (WHERE tipo='coleta' AND status='concluida' AND concluido_em >= p_inicio AND concluido_em < p_fim),
    'entregas_agendadas', count(*) FILTER (WHERE tipo='entrega' AND data_agendada >= d_ini AND data_agendada < d_fim),
    'entregas_realizadas', count(*) FILTER (WHERE tipo='entrega' AND status='concluida' AND concluido_em >= p_inicio AND concluido_em < p_fim),
    'nao_realizadas', count(*) FILTER (WHERE nao_realizada_em >= p_inicio AND nao_realizada_em < p_fim),
    'vencidas_corte', count(*) FILTER (WHERE data_agendada < d_fim AND created_at < p_fim AND (concluido_em IS NULL OR concluido_em >= p_fim) AND (cancelado_em IS NULL OR cancelado_em >= p_fim)),
    'aguardando_coleta_corte', count(*) FILTER (WHERE tipo='coleta' AND created_at < p_fim AND (concluido_em IS NULL OR concluido_em >= p_fim) AND (cancelado_em IS NULL OR cancelado_em >= p_fim)),
    'aguardando_entrega_corte', count(*) FILTER (WHERE tipo='entrega' AND created_at < p_fim AND (concluido_em IS NULL OR concluido_em >= p_fim) AND (cancelado_em IS NULL OR cancelado_em >= p_fim)),
    'sem_motorista_corte', count(*) FILTER (WHERE motorista_id IS NULL AND created_at < p_fim AND (concluido_em IS NULL OR concluido_em >= p_fim) AND (cancelado_em IS NULL OR cancelado_em >= p_fim)),
    'por_motorista', coalesce((SELECT jsonb_agg(jsonb_build_object('motorista', x.nome, 'realizadas', x.t) ORDER BY x.t DESC) FROM (
        SELECT coalesce(p.nome_completo, 'Não registrado') nome, count(*) t FROM coletas_solicitacoes c2 LEFT JOIN profiles p ON p.id=c2.motorista_id
        WHERE c2.deleted_at IS NULL AND c2.status='concluida' AND c2.concluido_em >= p_inicio AND c2.concluido_em < p_fim GROUP BY 1) x), '[]'::jsonb)
  ) INTO v FROM coletas_solicitacoes WHERE deleted_at IS NULL;
  r := r || jsonb_build_object('logistica', v);

  -- Pendências / bloqueios (estado atual registrado; sem histórico de status)
  SELECT jsonb_build_object(
    'abertas', count(*),
    'mais_15_dias', count(*) FILTER (WHERE data_entrada IS NOT NULL AND d_fim - data_entrada > 15),
    'sem_data_entrada', count(*) FILTER (WHERE data_entrada IS NULL),
    'por_motivo', coalesce((SELECT jsonb_agg(jsonb_build_object('motivo', x.nome, 'total', x.t) ORDER BY x.t DESC) FROM (
        SELECT m.nome, count(*) t FROM pendencias_operacionais p2 JOIN motivos_pendencia m ON m.id=p2.motivo_id
        WHERE p2.status='aberta' AND p2.created_at < p_fim GROUP BY 1) x), '[]'::jsonb)
  ) INTO v FROM pendencias_operacionais WHERE status='aberta' AND created_at < p_fim;
  r := r || jsonb_build_object('bloqueios', v);

  -- Decisões pendentes
  SELECT jsonb_build_object('abertas', count(*) FILTER (WHERE status='aberta' AND created_at < p_fim),
    'vencidas', count(*) FILTER (WHERE status='aberta' AND prazo IS NOT NULL AND prazo < d_fim),
    'resolvidas_periodo', count(*) FILTER (WHERE resolvido_em >= p_inicio AND resolvido_em < p_fim))
  INTO v FROM decisoes_pendentes;
  r := r || jsonb_build_object('decisoes', v);

  -- Financeiro (caixa; liquidações de boleto excluídas)
  SELECT jsonb_build_object(
    'faturamento_total', coalesce(sum(valor_final),0),
    'servicos', coalesce(sum(valor_final) FILTER (WHERE grupo_receita='servicos'),0),
    'acessorios', coalesce(sum(valor_final) FILTER (WHERE grupo_receita='acessorios'),0),
    'venda_tv', coalesce(sum(valor_final) FILTER (WHERE grupo_receita='venda_tv'),0),
    'sem_categoria', coalesce(sum(valor_final) FILTER (WHERE grupo_receita IS NULL),0),
    'lancamentos', count(*)
  ) INTO v FROM caixa_lancamentos WHERE status='ativo' AND liquida_conta_receber_id IS NULL AND data_lancamento >= d_ini AND data_lancamento < d_fim;
  r := r || jsonb_build_object('financeiro', v);

  -- Meta mensal de serviços (acumulado do mês até o fim do período)
  v_mes_ini := date_trunc('month', (d_fim - 1))::date;
  SELECT * INTO v_meta FROM metas_empresa WHERE tipo='faturamento' AND status IN ('ativa','planejada','concluida')
    AND data_inicio <= d_fim - 1 AND data_fim >= d_fim - 1 ORDER BY principal DESC, valor_alvo LIMIT 1;
  r := r || jsonb_build_object('metas', jsonb_build_object(
    'mes_inicio', v_mes_ini,
    'meta_servicos', v_meta.valor_alvo,
    'meta_nome', v_meta.nome,
    'servicos_mes', (SELECT coalesce(sum(valor_final),0) FROM caixa_lancamentos WHERE status='ativo' AND liquida_conta_receber_id IS NULL AND grupo_receita='servicos' AND data_lancamento >= v_mes_ini AND data_lancamento < d_fim),
    'faturamento_mes', (SELECT coalesce(sum(valor_final),0) FROM caixa_lancamentos WHERE status='ativo' AND liquida_conta_receber_id IS NULL AND data_lancamento >= v_mes_ini AND data_lancamento < d_fim)
  ));

  r := r || jsonb_build_object('prazo_orcamento', jsonb_build_object('disponivel', false,
    'motivo', 'Horário de recebimento da TV e de envio do orçamento ao cliente não são registrados neste sistema (ficam no INFOR OS).'));
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public._resumo_calcular(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- Indicadores + comparação + alertas + prioridades sugeridas
CREATE OR REPLACE FUNCTION public._resumo_montar(p_inicio timestamptz, p_fim timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE a jsonb; b jsonb; al jsonb := '[]'::jsonb; pr jsonb := '[]'::jsonb; cfg jsonb; n int; meta numeric; real numeric;
  dur interval := p_fim - p_inicio;
BEGIN
  SELECT value INTO cfg FROM settings WHERE key='resumo_executivo';
  a := _resumo_calcular(p_inicio, p_fim);
  b := _resumo_calcular(p_inicio - dur, p_inicio);

  n := (a->'logistica'->>'vencidas_corte')::int;
  IF n > 0 THEN
    al := al || jsonb_build_object('gravidade','critico','area','Logística','texto', n||' coletas/entregas com data agendada vencida e não concluídas no corte.');
    pr := pr || jsonb_build_object('acao','Zerar coletas/entregas vencidas','evidencia', n||' compromissos vencidos no corte','resultado','Nenhum compromisso com cliente vencido','responsavel','A definir','prazo','Prazo sugerido: até quarta-feira');
  END IF;
  n := (a->'bloqueios'->>'mais_15_dias')::int;
  IF n > 0 THEN
    al := al || jsonb_build_object('gravidade','critico','area','Bloqueios','texto', n||' TVs pendentes há mais de 15 dias na ITV.');
    pr := pr || jsonb_build_object('acao','Destravar TVs paradas há mais de 15 dias','evidencia', n||' TVs com mais de 15 dias em pendência','resultado','Reduzir as TVs críticas pela metade','responsavel','A definir','prazo','Prazo sugerido: fim da semana');
  END IF;
  n := (a->'laboratorio'->>'aguardando_mais_48h')::int;
  IF n > 0 THEN
    al := al || jsonb_build_object('gravidade','atencao','area','Laboratório','texto', n||' serviços aguardando validação há mais de 48h.');
    pr := pr || jsonb_build_object('acao','Validar serviços técnicos pendentes','evidencia', n||' serviços aguardando validação há mais de 48h','resultado','Fila de validação com no máximo 48h','responsavel','A definir','prazo','Prazo sugerido: 2 dias');
  END IF;
  meta := nullif(a->'metas'->>'meta_servicos','')::numeric; real := (a->'metas'->>'servicos_mes')::numeric;
  IF meta IS NOT NULL AND meta > 0 AND real < meta THEN
    al := al || jsonb_build_object('gravidade','informativo','area','Metas','texto','Serviços do mês em '||round(real/meta*100)||'% da meta ('||to_char(real,'FM999G999G990D00')||' de '||to_char(meta,'FM999G999G990D00')||').');
  END IF;
  n := (a->'logistica'->>'sem_motorista_corte')::int;
  IF n > 0 THEN
    al := al || jsonb_build_object('gravidade','atencao','area','Logística','texto', n||' coletas/entregas em aberto sem motorista atribuído.');
  END IF;
  IF (a->'decisoes'->>'vencidas')::int > 0 THEN
    al := al || jsonb_build_object('gravidade','atencao','area','Decisões','texto',(a->'decisoes'->>'vencidas')||' decisões pendentes com prazo vencido.');
  END IF;
  IF (a->'financeiro'->>'sem_categoria')::numeric > 0 THEN
    al := al || jsonb_build_object('gravidade','informativo','area','Financeiro','texto','Há receitas sem categoria no período, aguardando classificação.');
  END IF;
  IF NOT coalesce((a->'entradas'->>'informadas')::boolean,false) THEN
    al := al || jsonb_build_object('gravidade','atencao','area','Entradas','texto','Entradas de TVs não informadas no Fechamento Semanal deste período.');
  END IF;
  -- Completa com lacunas de informação (sem inventar problemas)
  IF jsonb_array_length(pr) < 3 AND NOT coalesce((a->'entradas'->>'informadas')::boolean,false) THEN
    pr := pr || jsonb_build_object('acao','Informar as entradas de TVs no Fechamento Semanal','evidencia','Entradas não informadas no período','resultado','Saldo e taxa de saída calculáveis','responsavel','A definir','prazo','Prazo sugerido: até o próximo corte');
  END IF;
  IF jsonb_array_length(pr) < 3 THEN
    pr := pr || jsonb_build_object('acao','Definir a fonte de horário de recebimento e envio do orçamento','evidencia','Prazo de orçamento de 6h não pode ser medido hoje','resultado','Cumprimento das 6h medido toda semana','responsavel','A definir','prazo','Prazo sugerido: 2 semanas');
  END IF;
  IF jsonb_array_length(pr) < 3 THEN
    pr := pr || jsonb_build_object('acao','Registrar a origem de todos os leads','evidencia',(a->'leads'->>'sem_origem')||' leads sem origem no período','resultado','Distribuição por origem completa','responsavel','A definir','prazo','Prazo sugerido: próxima semana');
  END IF;
  SELECT coalesce(jsonb_agg(e),'[]'::jsonb) INTO pr FROM (SELECT e FROM jsonb_array_elements(pr) WITH ORDINALITY t(e,i) ORDER BY i LIMIT 3) s;

  RETURN jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'anterior_inicio', p_inicio - dur, 'anterior_fim', p_inicio),
    'atual', a, 'anterior', b, 'alertas', al, 'prioridades_sugeridas', pr,
    'metas_sugeridas', cfg->'metas_sugeridas', 'calculado_em', now());
END $$;
REVOKE ALL ON FUNCTION public._resumo_montar(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._resumo_regras() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
SELECT jsonb_build_object(
 'periodo','Registros com data/hora ≥ início e < fim (corte). Campos só com data usam o dia de Manaus: o dia do corte pertence ao período seguinte.',
 'leads','Solicitações de coleta/entrega criadas no período (excluídas as apagadas). Conversão lead→OS não calculada: não há vínculo com a OS.',
 'entradas','Soma das entradas informadas no Fechamento Semanal cuja semana começa no período.',
 'laboratorio','Serviços da Produção Técnica enviados/validados no período. As 8 etapas do laboratório não existem neste sistema.',
 'logistica','Agendadas pela data agendada; realizadas só quando concluídas. Vencidas: data agendada antes do corte e não concluídas/canceladas até o corte.',
 'bloqueios','Pendências operacionais abertas registradas antes do corte (estado atual; sem histórico de status).',
 'financeiro','Caixa Diário ativo, exceto recebimentos de boleto (liquidações).',
 'metas','Meta de faturamento de serviços cadastrada para o mês do fim do período; acumulado do mês até o corte.',
 'comparacao','Período anterior de mesma duração imediatamente antes. Com base zero mostra diferença absoluta.');
$$;

CREATE OR REPLACE FUNCTION public._resumo_narrativa_estruturada(m jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE a jsonb := m->'atual';
BEGIN
  RETURN jsonb_build_object(
   'visao', format('Leads: %s (atendidos %s, pendentes %s). Coletas realizadas: %s; entregas realizadas: %s. Serviços validados no laboratório: %s.',
      a->'leads'->>'total', a->'leads'->>'atendidos', a->'leads'->>'pendentes',
      a->'logistica'->>'coletas_realizadas', a->'logistica'->>'entregas_realizadas', a->'laboratorio'->>'validados'),
   'desvios', coalesce((SELECT jsonb_agg(e->>'texto') FROM jsonb_array_elements(m->'alertas') e WHERE e->>'gravidade' IN ('critico','atencao')),'[]'::jsonb),
   'bloqueios', format('%s pendências abertas; %s decisões pendentes.', a->'bloqueios'->>'abertas', a->'decisoes'->>'abertas'),
   'proximos_passos', coalesce((SELECT jsonb_agg(e->>'acao') FROM jsonb_array_elements(m->'prioridades_sugeridas') e),'[]'::jsonb));
END $$;

-- Gravação de versão (interna)
CREATE OR REPLACE FUNCTION public._resumo_salvar(p_inicio timestamptz, p_fim timestamptz, p_origem text, p_user uuid,
  p_narrativa jsonb DEFAULT NULL, p_prioridades jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m jsonb; v_ver int; v_id uuid; v_tipo text;
BEGIN
  m := _resumo_montar(p_inicio, p_fim);
  v_tipo := CASE WHEN p_fim <= now() THEN 'fechado' ELSE 'previa' END;
  PERFORM pg_advisory_xact_lock(hashtext('resumo:'||p_inicio||p_fim));
  SELECT coalesce(max(versao),0)+1 INTO v_ver FROM resumos_executivos WHERE periodo_inicio=p_inicio AND periodo_fim=p_fim;
  INSERT INTO resumos_executivos(periodo_inicio, periodo_fim, versao, tipo, origem_geracao, narrativa_origem, indicadores, regras, narrativa, prioridades, gerado_por)
  VALUES (p_inicio, p_fim, v_ver, v_tipo, p_origem, CASE WHEN p_narrativa IS NULL THEN 'estruturado' ELSE 'ia' END,
    m, _resumo_regras(), coalesce(p_narrativa, _resumo_narrativa_estruturada(m)), coalesce(p_prioridades, m->'prioridades_sugeridas'), p_user)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public._resumo_salvar(timestamptz, timestamptz, text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ===== RPCs públicas =====
CREATE OR REPLACE FUNCTION public._resumo_filtrar(m jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.has_permission(auth.uid(),'caixa','visualizar') OR public.has_permission(auth.uid(),'financeiro','visualizar') THEN RETURN m; END IF;
  RETURN jsonb_set(jsonb_set(m, '{atual}', (m->'atual') - 'financeiro' - 'metas'), '{anterior}', (m->'anterior') - 'financeiro' - 'metas')
    || jsonb_build_object('financeiro_restrito', true);
END $$;

CREATE OR REPLACE FUNCTION public.resumo_periodos() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c timestamptz := resumo_corte(now());
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','visualizar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN jsonb_build_object('fechado_inicio', c - interval '7 days', 'fechado_fim', c, 'previa_inicio', c, 'previa_fim', c + interval '7 days',
    'config', (SELECT value FROM settings WHERE key='resumo_executivo'));
END $$;

CREATE OR REPLACE FUNCTION public.resumo_previa(p_inicio timestamptz, p_fim timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','visualizar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_fim <= p_inicio OR p_fim - p_inicio > interval '93 days' THEN RAISE EXCEPTION 'Período inválido (máximo 93 dias).'; END IF;
  RETURN _resumo_filtrar(_resumo_montar(p_inicio, p_fim)) || jsonb_build_object('regras', _resumo_regras());
END $$;

CREATE OR REPLACE FUNCTION public.resumo_gerar(p_inicio timestamptz, p_fim timestamptz, p_narrativa jsonb DEFAULT NULL, p_prioridades jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','editar') THEN RAISE EXCEPTION 'Apenas a Gerência pode gerar o resumo.'; END IF;
  IF p_fim <= p_inicio OR p_fim - p_inicio > interval '93 days' THEN RAISE EXCEPTION 'Período inválido (máximo 93 dias).'; END IF;
  IF p_prioridades IS NOT NULL AND jsonb_array_length(p_prioridades) <> 3 THEN RAISE EXCEPTION 'Informe exatamente 3 prioridades.'; END IF;
  v_id := _resumo_salvar(p_inicio, p_fim, 'manual', auth.uid(), p_narrativa, p_prioridades);
  INSERT INTO resumo_execucoes(periodo_inicio, periodo_fim, origem, status, resumo_id, executado_por) VALUES (p_inicio, p_fim, 'manual','sucesso', v_id, auth.uid());
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.resumo_obter(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r resumos_executivos;
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','visualizar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO r FROM resumos_executivos WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(r) || jsonb_build_object('indicadores', _resumo_filtrar(r.indicadores),
    'gerado_por_nome', (SELECT nome_completo FROM profiles WHERE id=r.gerado_por),
    'revisado_por_nome', (SELECT nome_completo FROM profiles WHERE id=r.revisado_por));
END $$;

CREATE OR REPLACE FUNCTION public.resumo_revisar(p_id uuid, p_prioridades jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','editar') THEN RAISE EXCEPTION 'Apenas a Gerência pode revisar.'; END IF;
  IF jsonb_typeof(p_prioridades) <> 'array' OR jsonb_array_length(p_prioridades) <> 3 THEN RAISE EXCEPTION 'Informe exatamente 3 prioridades.'; END IF;
  UPDATE resumos_executivos SET prioridades=p_prioridades, revisado=true, revisado_por=auth.uid(), revisado_em=now() WHERE id=p_id;
  INSERT INTO audit_logs(user_id, action, entity, entity_id, details)
    SELECT auth.uid(), 'resumo_revisado', 'resumos_executivos', p_id::text, jsonb_build_object('prioridades', p_prioridades)
    WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='entity');
END $$;

CREATE OR REPLACE FUNCTION public.resumo_config_salvar(p_dia int, p_hora int, p_destinatarios uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','editar') THEN RAISE EXCEPTION 'Apenas a Gerência pode alterar.'; END IF;
  IF p_dia NOT BETWEEN 0 AND 6 OR p_hora NOT BETWEEN 0 AND 23 THEN RAISE EXCEPTION 'Dia ou horário inválido.'; END IF;
  UPDATE settings SET value = value || jsonb_build_object('dia_semana',p_dia,'hora',p_hora,'destinatarios',to_jsonb(coalesce(p_destinatarios,'{}'))), updated_at=now()
  WHERE key='resumo_executivo';
END $$;

CREATE OR REPLACE FUNCTION public.resumo_detalhe(p_inicio timestamptz, p_fim timestamptz, p_indicador text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE d_ini date := (p_inicio AT TIME ZONE 'America/Manaus')::date; d_fim date := (p_fim AT TIME ZONE 'America/Manaus')::date; r jsonb;
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','visualizar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p_indicador = 'leads' THEN
    SELECT jsonb_agg(jsonb_build_object('data', c.created_at, 'tipo', c.tipo, 'cliente', c.cliente_nome, 'status', c.status, 'origem', o.nome) ORDER BY c.created_at)
    INTO r FROM coletas_solicitacoes c LEFT JOIN origens_cliente o ON o.id=c.origem_id WHERE c.deleted_at IS NULL AND c.created_at >= p_inicio AND c.created_at < p_fim;
  ELSIF p_indicador = 'logistica_vencidas' THEN
    SELECT jsonb_agg(jsonb_build_object('data', c.data_agendada, 'tipo', c.tipo, 'cliente', c.cliente_nome, 'status', c.status, 'motorista', p.nome_completo) ORDER BY c.data_agendada)
    INTO r FROM coletas_solicitacoes c LEFT JOIN profiles p ON p.id=c.motorista_id WHERE c.deleted_at IS NULL AND c.data_agendada < d_fim AND c.created_at < p_fim
      AND (c.concluido_em IS NULL OR c.concluido_em >= p_fim) AND (c.cancelado_em IS NULL OR c.cancelado_em >= p_fim);
  ELSIF p_indicador = 'logistica_realizadas' THEN
    SELECT jsonb_agg(jsonb_build_object('data', c.concluido_em, 'tipo', c.tipo, 'cliente', c.cliente_nome, 'motorista', p.nome_completo) ORDER BY c.concluido_em)
    INTO r FROM coletas_solicitacoes c LEFT JOIN profiles p ON p.id=c.motorista_id WHERE c.deleted_at IS NULL AND c.status='concluida' AND c.concluido_em >= p_inicio AND c.concluido_em < p_fim;
  ELSIF p_indicador = 'laboratorio' THEN
    SELECT jsonb_agg(jsonb_build_object('os', t.os, 'status', t.status, 'enviado', t.enviado_em, 'validado', t.validado_em, 'tecnico', p.nome_completo) ORDER BY t.enviado_em)
    INTO r FROM producao_tecnica t LEFT JOIN profiles p ON p.id=t.tecnico_id
    WHERE (t.enviado_em >= p_inicio AND t.enviado_em < p_fim) OR (t.validado_em >= p_inicio AND t.validado_em < p_fim)
       OR (t.status='enviado_validacao' AND t.enviado_em < p_fim);
  ELSIF p_indicador = 'bloqueios' THEN
    SELECT jsonb_agg(jsonb_build_object('os', b.os, 'motivo', m.nome, 'entrada', b.data_entrada, 'dias', d_fim - b.data_entrada, 'cliente', b.cliente, 'tecnico', p.nome_completo, 'obs', b.observacao) ORDER BY b.data_entrada)
    INTO r FROM pendencias_operacionais b JOIN motivos_pendencia m ON m.id=b.motivo_id LEFT JOIN profiles p ON p.id=b.tecnico_id WHERE b.status='aberta' AND b.created_at < p_fim;
  ELSIF p_indicador = 'financeiro' THEN
    IF NOT (has_permission(auth.uid(),'caixa','visualizar') OR has_permission(auth.uid(),'financeiro','visualizar')) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
    SELECT jsonb_agg(jsonb_build_object('data', l.data_lancamento, 'os', l.os, 'cliente', l.cliente, 'categoria', l.grupo_receita, 'valor', l.valor_final) ORDER BY l.data_lancamento)
    INTO r FROM caixa_lancamentos l WHERE l.status='ativo' AND l.liquida_conta_receber_id IS NULL AND l.data_lancamento >= d_ini AND l.data_lancamento < d_fim;
  ELSE RAISE EXCEPTION 'Indicador desconhecido';
  END IF;
  RETURN coalesce(r,'[]'::jsonb);
END $$;

-- Geração agendada (SQL, sem IA): idempotente por período
CREATE OR REPLACE FUNCTION public.resumo_gerar_agendado() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c timestamptz := resumo_corte(now()); i timestamptz := c - interval '7 days'; v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM resumos_executivos WHERE periodo_inicio=i AND periodo_fim=c AND origem_geracao='agendada') THEN
    INSERT INTO resumo_execucoes(periodo_inicio, periodo_fim, origem, status, mensagem) VALUES (i, c, 'agendada','ignorada','Período já gerado.');
    RETURN;
  END IF;
  BEGIN
    v_id := _resumo_salvar(i, c, 'agendada', NULL);
    INSERT INTO resumo_execucoes(periodo_inicio, periodo_fim, origem, status, resumo_id) VALUES (i, c, 'agendada','sucesso', v_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO resumo_execucoes(periodo_inicio, periodo_fim, origem, status, mensagem) VALUES (i, c, 'agendada','falha', SQLERRM);
  END;
END $$;
REVOKE ALL ON FUNCTION public.resumo_gerar_agendado() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resumo_periodos(), public.resumo_previa(timestamptz,timestamptz), public.resumo_gerar(timestamptz,timestamptz,jsonb,jsonb),
  public.resumo_obter(uuid), public.resumo_revisar(uuid,jsonb), public.resumo_config_salvar(int,int,uuid[]), public.resumo_detalhe(timestamptz,timestamptz,text) TO authenticated;
