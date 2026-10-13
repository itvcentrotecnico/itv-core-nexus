
CREATE OR REPLACE FUNCTION public._resumo_calcular(p_inicio timestamptz, p_fim timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  d_ini date := (p_inicio AT TIME ZONE 'America/Manaus')::date;
  d_fim date := (p_fim AT TIME ZONE 'America/Manaus')::date;
  v_dias int; r jsonb := '{}'::jsonb; v jsonb; v_mes_ini date; v_meta record;
BEGIN
  SELECT count(*) INTO v_dias FROM generate_series(d_ini, d_fim - 1, interval '1 day') g WHERE extract(dow from g) <> 0;
  v_dias := greatest(v_dias,1);

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

  SELECT jsonb_build_object(
    'informadas', count(*) FILTER (WHERE f.entradas IS NOT NULL) > 0,
    'total', sum(f.entradas),
    'semanas', count(*),
    'fonte', string_agg(DISTINCT f.entradas_fonte, ', ')
  ) INTO v FROM fechamentos_operacionais_semanais f WHERE f.inicio_periodo >= d_ini AND f.inicio_periodo < d_fim;
  r := r || jsonb_build_object('entradas', v);

  SELECT jsonb_build_object(
    'enviados', count(*) FILTER (WHERE enviado_em >= p_inicio AND enviado_em < p_fim),
    'validados', count(*) FILTER (WHERE validado_em >= p_inicio AND validado_em < p_fim AND status='validado'),
    'rejeitados', count(*) FILTER (WHERE status IN ('rejeitado','correcao_solicitada') AND updated_at >= p_inicio AND updated_at < p_fim),
    'aguardando_validacao_corte', count(*) FILTER (WHERE enviado_em < p_fim AND (validado_em IS NULL OR validado_em >= p_fim) AND status NOT IN ('cancelado','rascunho','rejeitado')),
    'aguardando_mais_48h', count(*) FILTER (WHERE status='enviado_validacao' AND enviado_em < p_fim - interval '48 hours')
  ) INTO v FROM producao_tecnica;
  r := r || jsonb_build_object('laboratorio', v);

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
        SELECT coalesce(p.full_name, 'Não registrado') nome, count(*) t FROM coletas_solicitacoes c2 LEFT JOIN profiles p ON p.id=c2.motorista_id
        WHERE c2.deleted_at IS NULL AND c2.status='concluida' AND c2.concluido_em >= p_inicio AND c2.concluido_em < p_fim GROUP BY 1) x), '[]'::jsonb)
  ) INTO v FROM coletas_solicitacoes WHERE deleted_at IS NULL;
  r := r || jsonb_build_object('logistica', v);

  SELECT jsonb_build_object(
    'abertas', count(*),
    'mais_15_dias', count(*) FILTER (WHERE data_entrada IS NOT NULL AND d_fim - data_entrada > 15),
    'sem_data_entrada', count(*) FILTER (WHERE data_entrada IS NULL),
    'por_motivo', coalesce((SELECT jsonb_agg(jsonb_build_object('motivo', x.nome, 'total', x.t) ORDER BY x.t DESC) FROM (
        SELECT m.nome, count(*) t FROM pendencias_operacionais p2 JOIN motivos_pendencia m ON m.id=p2.motivo_id
        WHERE p2.status='aberta' AND p2.created_at < p_fim GROUP BY 1) x), '[]'::jsonb)
  ) INTO v FROM pendencias_operacionais WHERE status='aberta' AND created_at < p_fim;
  r := r || jsonb_build_object('bloqueios', v);

  SELECT jsonb_build_object('abertas', count(*) FILTER (WHERE status='aberta' AND created_at < p_fim),
    'vencidas', count(*) FILTER (WHERE status='aberta' AND prazo IS NOT NULL AND prazo < d_fim),
    'resolvidas_periodo', count(*) FILTER (WHERE resolvido_em >= p_inicio AND resolvido_em < p_fim))
  INTO v FROM decisoes_pendentes;
  r := r || jsonb_build_object('decisoes', v);

  SELECT jsonb_build_object(
    'faturamento_total', coalesce(sum(valor_final),0),
    'servicos', coalesce(sum(valor_final) FILTER (WHERE grupo_receita='servicos'),0),
    'acessorios', coalesce(sum(valor_final) FILTER (WHERE grupo_receita='acessorios'),0),
    'venda_tv', coalesce(sum(valor_final) FILTER (WHERE grupo_receita='venda_tv'),0),
    'sem_categoria', coalesce(sum(valor_final) FILTER (WHERE grupo_receita IS NULL),0),
    'lancamentos', count(*)
  ) INTO v FROM caixa_lancamentos WHERE status='ativo' AND liquida_conta_receber_id IS NULL AND data_lancamento >= d_ini AND data_lancamento < d_fim;
  r := r || jsonb_build_object('financeiro', v);

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

CREATE OR REPLACE FUNCTION public.resumo_obter(p_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r resumos_executivos;
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','visualizar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO r FROM resumos_executivos WHERE id=p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN to_jsonb(r) || jsonb_build_object('indicadores', _resumo_filtrar(r.indicadores),
    'gerado_por_nome', (SELECT full_name FROM profiles WHERE id=r.gerado_por),
    'revisado_por_nome', (SELECT full_name FROM profiles WHERE id=r.revisado_por));
END $$;

CREATE OR REPLACE FUNCTION public.resumo_revisar(p_id uuid, p_prioridades jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','editar') THEN RAISE EXCEPTION 'Apenas a Gerência pode revisar.'; END IF;
  IF jsonb_typeof(p_prioridades) <> 'array' OR jsonb_array_length(p_prioridades) <> 3 THEN RAISE EXCEPTION 'Informe exatamente 3 prioridades.'; END IF;
  UPDATE resumos_executivos SET prioridades=p_prioridades, revisado=true, revisado_por=auth.uid(), revisado_em=now() WHERE id=p_id;
  INSERT INTO audit_logs(user_id, module_key, action, new_value) VALUES (auth.uid(), 'operacional', 'resumo_revisado', jsonb_build_object('resumo_id', p_id, 'prioridades', p_prioridades));
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
    SELECT jsonb_agg(jsonb_build_object('data', c.data_agendada, 'tipo', c.tipo, 'cliente', c.cliente_nome, 'status', c.status, 'motorista', p.full_name) ORDER BY c.data_agendada)
    INTO r FROM coletas_solicitacoes c LEFT JOIN profiles p ON p.id=c.motorista_id WHERE c.deleted_at IS NULL AND c.data_agendada < d_fim AND c.created_at < p_fim
      AND (c.concluido_em IS NULL OR c.concluido_em >= p_fim) AND (c.cancelado_em IS NULL OR c.cancelado_em >= p_fim);
  ELSIF p_indicador = 'logistica_realizadas' THEN
    SELECT jsonb_agg(jsonb_build_object('data', c.concluido_em, 'tipo', c.tipo, 'cliente', c.cliente_nome, 'motorista', p.full_name) ORDER BY c.concluido_em)
    INTO r FROM coletas_solicitacoes c LEFT JOIN profiles p ON p.id=c.motorista_id WHERE c.deleted_at IS NULL AND c.status='concluida' AND c.concluido_em >= p_inicio AND c.concluido_em < p_fim;
  ELSIF p_indicador = 'laboratorio' THEN
    SELECT jsonb_agg(jsonb_build_object('os', t.os, 'status', t.status, 'enviado', t.enviado_em, 'validado', t.validado_em, 'tecnico', p.full_name) ORDER BY t.enviado_em)
    INTO r FROM producao_tecnica t LEFT JOIN profiles p ON p.id=t.tecnico_id
    WHERE (t.enviado_em >= p_inicio AND t.enviado_em < p_fim) OR (t.validado_em >= p_inicio AND t.validado_em < p_fim)
       OR (t.status='enviado_validacao' AND t.enviado_em < p_fim);
  ELSIF p_indicador = 'bloqueios' THEN
    SELECT jsonb_agg(jsonb_build_object('os', b.os, 'motivo', m.nome, 'entrada', b.data_entrada, 'dias', d_fim - b.data_entrada, 'cliente', b.cliente, 'tecnico', p.full_name, 'obs', b.observacao) ORDER BY b.data_entrada)
    INTO r FROM pendencias_operacionais b JOIN motivos_pendencia m ON m.id=b.motivo_id LEFT JOIN profiles p ON p.id=b.tecnico_id WHERE b.status='aberta' AND b.created_at < p_fim;
  ELSIF p_indicador = 'financeiro' THEN
    IF NOT (has_permission(auth.uid(),'caixa','visualizar') OR has_permission(auth.uid(),'financeiro','visualizar')) THEN RAISE EXCEPTION 'Sem permissão financeira'; END IF;
    SELECT jsonb_agg(jsonb_build_object('data', l.data_lancamento, 'os', l.os, 'cliente', l.cliente, 'categoria', l.grupo_receita, 'valor', l.valor_final) ORDER BY l.data_lancamento)
    INTO r FROM caixa_lancamentos l WHERE l.status='ativo' AND l.liquida_conta_receber_id IS NULL AND l.data_lancamento >= d_ini AND l.data_lancamento < d_fim;
  ELSE RAISE EXCEPTION 'Indicador desconhecido';
  END IF;
  RETURN coalesce(r,'[]'::jsonb);
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
