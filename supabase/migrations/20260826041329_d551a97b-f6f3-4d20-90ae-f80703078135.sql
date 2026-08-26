-- =====================================================
-- PROMPT 9 (etapa 2) — METAS E INDICADORES GERENCIAIS
-- Metas são camada analítica: nunca alteram Caixa, Produção,
-- Comissões ou Financeiro. Realizado sempre calculado das fontes oficiais.
-- =====================================================

-- 1) Status da meta
CREATE TYPE public.meta_status AS ENUM ('planejada', 'ativa', 'concluida', 'cancelada');

-- 2) Metas da empresa
CREATE TABLE public.metas_empresa (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('faturamento','receita_liquida','margem_contribuicao','resultado_operacional','os_faturadas','ticket_medio')),
  periodo_tipo text not null default 'mensal' check (periodo_tipo in ('semanal','mensal','personalizado')),
  data_inicio date not null,
  data_fim date not null,
  valor_alvo numeric(12,2) not null check (valor_alvo > 0),
  unidade text not null default 'BRL',
  principal boolean not null default false,
  status public.meta_status not null default 'planejada',
  observacao text,
  responsavel_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  check (data_fim >= data_inicio)
);
CREATE UNIQUE INDEX metas_empresa_principal_uniq ON public.metas_empresa (principal) WHERE principal AND status IN ('planejada','ativa');
CREATE INDEX idx_metas_empresa_periodo ON public.metas_empresa (data_inicio, data_fim);
GRANT SELECT ON public.metas_empresa TO authenticated;
GRANT ALL ON public.metas_empresa TO service_role;
ALTER TABLE public.metas_empresa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permissao visualiza metas da empresa" ON public.metas_empresa
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador')
    OR public.has_permission(auth.uid(), 'metas', 'visualizar')
    OR public.has_permission(auth.uid(), 'metas', 'visualizar_ranking')
  );
CREATE TRIGGER update_metas_empresa_updated_at BEFORE UPDATE ON public.metas_empresa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Evolução das metas de técnicos (reutiliza tabela do módulo Produção)
ALTER TABLE public.metas_tecnicos ADD COLUMN IF NOT EXISTS status public.meta_status not null default 'ativa';
ALTER TABLE public.metas_tecnicos ADD COLUMN IF NOT EXISTS updated_at timestamptz not null default now();
ALTER TABLE public.metas_tecnicos ADD COLUMN IF NOT EXISTS updated_by uuid references public.profiles(id);
UPDATE public.metas_tecnicos SET status = CASE WHEN ativo THEN 'ativa'::public.meta_status ELSE 'cancelada'::public.meta_status END WHERE NOT ativo;
CREATE POLICY "Permissao metas visualiza metas de tecnicos" ON public.metas_tecnicos
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'metas', 'visualizar')
    OR public.has_permission(auth.uid(), 'metas', 'visualizar_ranking')
  );

-- 4) Permissões padrão por perfil
INSERT INTO public.role_permissions (role, module_key, action)
SELECT v.r::public.app_role, 'metas', v.a::public.permission_action
FROM (VALUES
  ('gerente', 'visualizar_ranking'),
  ('gerente', 'relatorios'),
  ('tecnico', 'visualizar_propria'),
  ('tecnico', 'relatorios')
) AS v(r, a)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp
  WHERE rp.role = v.r::public.app_role AND rp.module_key = 'metas' AND rp.action = v.a::public.permission_action
);

-- 5) Faixas de projeção configuráveis pelo ADM
INSERT INTO public.settings (key, value)
SELECT 'metas', '{"faixas_projecao":{"acima":105,"no_ritmo":95,"atencao":80}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE key = 'metas');

-- 6) Realizado por tipo de meta, sempre das fontes oficiais
CREATE OR REPLACE FUNCTION public.metas_realizado(p_tipo text, p_inicio date, p_fim date) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fat numeric(12,2); v_rec numeric(12,2); v_qtd integer; v_os integer;
  v_custos numeric(12,2); v_com numeric(12,2); v_desp numeric(12,2); v_folha numeric(12,2);
BEGIN
  SELECT coalesce(sum(l.valor_final), 0), coalesce(sum(l.receita_liquida), 0),
         count(*), count(distinct l.os) FILTER (WHERE l.os IS NOT NULL)
    INTO v_fat, v_rec, v_qtd, v_os
    FROM public.caixa_lancamentos l
   WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_inicio AND p_fim;

  IF p_tipo = 'faturamento' THEN RETURN v_fat; END IF;
  IF p_tipo = 'receita_liquida' THEN RETURN v_rec; END IF;
  IF p_tipo = 'os_faturadas' THEN RETURN v_os; END IF;
  IF p_tipo = 'ticket_medio' THEN RETURN CASE WHEN v_qtd > 0 THEN round(v_fat / v_qtd, 2) ELSE 0 END; END IF;

  SELECT coalesce(sum(c.custo_total - c.devolvido_total), 0) INTO v_custos
    FROM public.custos_os c
   WHERE c.status IN ('registrado','confirmado') AND c.data_lancamento BETWEEN p_inicio AND p_fim;
  SELECT coalesce(sum(c.valor_final), 0) INTO v_com
    FROM public.comissoes c
   WHERE c.status <> 'cancelada' AND c.data_referencia BETWEEN p_inicio AND p_fim;

  IF p_tipo = 'margem_contribuicao' THEN RETURN v_rec - v_custos - v_com; END IF;

  SELECT coalesce(sum(d.valor), 0) INTO v_desp
    FROM public.despesas d
   WHERE d.status <> 'cancelada' AND d.competencia BETWEEN p_inicio AND p_fim;
  SELECT coalesce(sum(CASE WHEN fl.natureza = 'provento' THEN fl.valor ELSE -fl.valor END), 0) INTO v_folha
    FROM public.folha_lancamentos fl
    JOIN public.folha_competencias fc ON fc.id = fl.competencia_id
   WHERE fl.cancelado_em IS NULL AND fc.status IN ('aprovada','paga','fechada')
     AND fc.competencia BETWEEN p_inicio AND p_fim;

  IF p_tipo = 'resultado_operacional' THEN RETURN v_rec - v_custos - v_com - v_desp - v_folha; END IF;
  RETURN NULL;
END $$;

-- 7) Classificação da projeção conforme faixas configuráveis
CREATE OR REPLACE FUNCTION public.metas_classificar_projecao(p_percentual numeric) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg jsonb; v_acima numeric; v_ritmo numeric; v_atencao numeric;
BEGIN
  IF p_percentual IS NULL THEN RETURN NULL; END IF;
  SELECT value INTO v_cfg FROM public.settings WHERE key = 'metas';
  v_acima := coalesce((v_cfg->'faixas_projecao'->>'acima')::numeric, 105);
  v_ritmo := coalesce((v_cfg->'faixas_projecao'->>'no_ritmo')::numeric, 95);
  v_atencao := coalesce((v_cfg->'faixas_projecao'->>'atencao')::numeric, 80);
  IF p_percentual > v_acima THEN RETURN 'acima';
  ELSIF p_percentual >= v_ritmo THEN RETURN 'no_ritmo';
  ELSIF p_percentual >= v_atencao THEN RETURN 'atencao';
  ELSE RETURN 'critico'; END IF;
END $$;

-- 8) Detalhe calculado de uma meta da empresa
CREATE OR REPLACE FUNCTION public.metas_empresa_detalhe(m public.metas_empresa) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Manaus')::date;
  v_realizado numeric(12,2); v_percentual numeric(8,2); v_faltante numeric(12,2);
  v_dias_totais integer; v_dias_decorridos integer; v_dias_restantes integer;
  v_ritmo_atual numeric(12,2); v_ritmo_nec numeric(12,2);
  v_proj numeric(12,2); v_proj_pct numeric(8,2); v_status_proj text; v_nivel text;
BEGIN
  v_realizado := coalesce(public.metas_realizado(m.tipo, m.data_inicio, m.data_fim), 0);
  v_percentual := round(v_realizado / m.valor_alvo * 100, 2);
  v_faltante := m.valor_alvo - v_realizado;
  v_dias_totais := m.data_fim - m.data_inicio + 1;
  v_dias_decorridos := greatest(least(v_hoje, m.data_fim) - m.data_inicio + 1, 0);
  v_dias_restantes := CASE
    WHEN v_hoje > m.data_fim THEN 0
    WHEN v_hoje < m.data_inicio THEN v_dias_totais
    ELSE m.data_fim - v_hoje + 1 END;
  v_ritmo_atual := CASE WHEN v_dias_decorridos > 0 THEN round(v_realizado / v_dias_decorridos, 2) ELSE NULL END;
  v_ritmo_nec := CASE WHEN v_dias_restantes > 0 AND v_faltante > 0 THEN round(v_faltante / v_dias_restantes, 2) ELSE 0 END;
  v_proj := CASE
    WHEN v_hoje > m.data_fim THEN v_realizado
    WHEN v_dias_decorridos > 0 THEN round(v_ritmo_atual * v_dias_totais, 2)
    ELSE NULL END;
  v_proj_pct := CASE WHEN v_proj IS NOT NULL THEN round(v_proj / m.valor_alvo * 100, 2) ELSE NULL END;
  v_status_proj := public.metas_classificar_projecao(v_proj_pct);
  SELECT n.nome INTO v_nivel FROM public.niveis_desempenho n
   WHERE n.ativo AND v_percentual >= n.percentual_minimo
     AND (n.percentual_maximo IS NULL OR v_percentual <= n.percentual_maximo)
   ORDER BY n.ordem LIMIT 1;
  RETURN jsonb_build_object(
    'id', m.id, 'nome', m.nome, 'tipo', m.tipo, 'periodo_tipo', m.periodo_tipo,
    'data_inicio', m.data_inicio, 'data_fim', m.data_fim, 'valor_alvo', m.valor_alvo,
    'unidade', m.unidade, 'principal', m.principal, 'status', m.status,
    'observacao', m.observacao, 'created_at', m.created_at,
    'responsavel', (SELECT p.full_name FROM public.profiles p WHERE p.id = m.responsavel_id),
    'realizado', v_realizado, 'percentual', v_percentual, 'faltante', v_faltante,
    'dias_totais', v_dias_totais, 'dias_decorridos', v_dias_decorridos, 'dias_restantes', v_dias_restantes,
    'ritmo_atual', v_ritmo_atual, 'ritmo_necessario', v_ritmo_nec,
    'projecao', v_proj, 'projecao_percentual', v_proj_pct, 'status_projecao', v_status_proj,
    'nivel', v_nivel
  );
END $$;

-- 9) Indicadores gerenciais de um período (fontes oficiais)
CREATE OR REPLACE FUNCTION public.metas_indicadores_periodo(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fat numeric(12,2); v_rec numeric(12,2); v_qtd integer; v_os integer;
  v_custos numeric(12,2); v_com numeric(12,2); v_desp numeric(12,2); v_folha numeric(12,2);
  v_prod numeric(12,2); v_margem numeric(12,2); v_result numeric(12,2);
BEGIN
  SELECT coalesce(sum(l.valor_final), 0), coalesce(sum(l.receita_liquida), 0), count(*),
         count(distinct l.os) FILTER (WHERE l.os IS NOT NULL)
    INTO v_fat, v_rec, v_qtd, v_os
    FROM public.caixa_lancamentos l
   WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_from AND p_to;
  SELECT coalesce(sum(c.custo_total - c.devolvido_total), 0) INTO v_custos
    FROM public.custos_os c
   WHERE c.status IN ('registrado','confirmado') AND c.data_lancamento BETWEEN p_from AND p_to;
  SELECT coalesce(sum(c.valor_final), 0) INTO v_com
    FROM public.comissoes c
   WHERE c.status <> 'cancelada' AND c.data_referencia BETWEEN p_from AND p_to;
  SELECT coalesce(sum(d.valor), 0) INTO v_desp
    FROM public.despesas d
   WHERE d.status <> 'cancelada' AND d.competencia BETWEEN p_from AND p_to;
  SELECT coalesce(sum(CASE WHEN fl.natureza = 'provento' THEN fl.valor ELSE -fl.valor END), 0) INTO v_folha
    FROM public.folha_lancamentos fl
    JOIN public.folha_competencias fc ON fc.id = fl.competencia_id
   WHERE fl.cancelado_em IS NULL AND fc.status IN ('aprovada','paga','fechada')
     AND fc.competencia BETWEEN p_from AND p_to;
  SELECT coalesce(sum(pr.valor_servico), 0) INTO v_prod
    FROM public.producao_tecnica pr
   WHERE pr.status = 'validado' AND pr.data_execucao BETWEEN p_from AND p_to;
  v_margem := v_rec - v_custos - v_com;
  v_result := v_margem - v_desp - v_folha;
  RETURN jsonb_build_object(
    'faturamento', v_fat, 'receita_liquida', v_rec,
    'ticket_medio', CASE WHEN v_qtd > 0 THEN round(v_fat / v_qtd, 2) ELSE 0 END,
    'os_faturadas', v_os, 'quantidade_lancamentos', v_qtd,
    'custos_diretos', v_custos,
    'custos_receita_pct', CASE WHEN v_rec > 0 THEN round(v_custos / v_rec * 100, 2) ELSE 0 END,
    'comissoes', v_com,
    'comissao_receita_pct', CASE WHEN v_rec > 0 THEN round(v_com / v_rec * 100, 2) ELSE 0 END,
    'margem_contribuicao', v_margem,
    'margem_pct', CASE WHEN v_rec > 0 THEN round(v_margem / v_rec * 100, 2) ELSE 0 END,
    'despesas_operacionais', v_desp, 'folha_gerencial', v_folha,
    'resultado_operacional', v_result,
    'resultado_pct', CASE WHEN v_rec > 0 THEN round(v_result / v_rec * 100, 2) ELSE 0 END,
    'producao_validada', v_prod
  );
END $$;

-- 10) Painel gerencial de metas (visão geral)
CREATE OR REPLACE FUNCTION public.metas_painel(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dias integer; v_prev_fim date; v_prev_ini date;
  v_metas jsonb; v_alertas jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'visualizar')
    OR public.has_permission(v_uid, 'metas', 'visualizar_ranking')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar as metas da empresa.');
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Período inválido.');
  END IF;

  v_dias := p_to - p_from + 1;
  v_prev_fim := p_from - 1;
  v_prev_ini := p_from - v_dias;

  SELECT coalesce(jsonb_agg(public.metas_empresa_detalhe(m) ORDER BY m.principal DESC, m.data_fim), '[]'::jsonb)
    INTO v_metas
    FROM public.metas_empresa m
   WHERE m.status IN ('planejada','ativa')
     AND m.data_inicio <= p_to AND m.data_fim >= p_from;

  SELECT coalesce(jsonb_agg(a.alerta), '[]'::jsonb) INTO v_alertas FROM (
    SELECT jsonb_build_object('tipo',
        CASE WHEN (d->>'percentual')::numeric >= 100 THEN 'meta_superada'
             WHEN d->>'status_projecao' = 'critico' THEN 'meta_em_risco'
             ELSE 'meta_em_atencao' END,
        'meta_id', d->>'id', 'nome', d->>'nome',
        'percentual', (d->>'percentual')::numeric,
        'projecao_percentual', (d->>'projecao_percentual')::numeric) AS alerta
      FROM jsonb_array_elements(v_metas) d
     WHERE (d->>'percentual')::numeric >= 100
        OR d->>'status_projecao' IN ('critico','atencao')
  ) a;

  RETURN jsonb_build_object(
    'ok', true,
    'atual', public.metas_indicadores_periodo(p_from, p_to),
    'anterior', public.metas_indicadores_periodo(v_prev_ini, v_prev_fim),
    'periodo_anterior', jsonb_build_object('inicio', v_prev_ini, 'fim', v_prev_fim),
    'metas', v_metas,
    'alertas', v_alertas,
    'faixas_projecao', (SELECT value->'faixas_projecao' FROM public.settings WHERE key = 'metas')
  );
END $$;

-- 11) Desempenho por técnico (ranking gerencial e metas técnicas)
CREATE OR REPLACE FUNCTION public.metas_tecnicos_desempenho(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Manaus')::date;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'visualizar_ranking')
    OR public.has_permission(v_uid, 'metas', 'visualizar')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar o desempenho dos técnicos.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'tecnicos', coalesce((
    WITH base AS (
      SELECT p.id AS tecnico_id, p.full_name AS tecnico
        FROM public.profiles p
       WHERE EXISTS (SELECT 1 FROM public.producao_tecnica pr WHERE pr.tecnico_id = p.id AND pr.data_execucao BETWEEN p_from AND p_to AND pr.status <> 'cancelado')
          OR EXISTS (SELECT 1 FROM public.metas_tecnicos mt WHERE mt.tecnico_id = p.id AND mt.ativo AND mt.inicio <= p_to AND mt.fim >= p_from)
    ), prod AS (
      SELECT pr.tecnico_id,
        count(*) FILTER (WHERE pr.status <> 'cancelado') AS registrados,
        count(*) FILTER (WHERE pr.enviado_em IS NOT NULL AND pr.status <> 'cancelado') AS enviados,
        count(*) FILTER (WHERE pr.status = 'validado') AS validados,
        count(*) FILTER (WHERE pr.status = 'enviado_validacao') AS pendentes,
        count(*) FILTER (WHERE pr.status = 'correcao_solicitada') AS correcoes,
        count(*) FILTER (WHERE pr.status = 'rejeitado') AS rejeitados,
        coalesce(sum(pr.valor_servico) FILTER (WHERE pr.status = 'validado'), 0) AS producao_validada,
        coalesce(avg(pr.valor_servico) FILTER (WHERE pr.status = 'validado'), 0) AS ticket_medio
        FROM public.producao_tecnica pr
       WHERE pr.data_execucao BETWEEN p_from AND p_to
       GROUP BY pr.tecnico_id
    ), fin AS (
      SELECT l.tecnico_id, coalesce(sum(l.receita_liquida), 0) AS receita
        FROM public.caixa_lancamentos l
       WHERE l.status = 'ativo' AND l.tecnico_id IS NOT NULL AND l.data_lancamento BETWEEN p_from AND p_to
       GROUP BY l.tecnico_id
    ), custo AS (
      SELECT c.tecnico_id, coalesce(sum(c.custo_total - c.devolvido_total), 0) AS custos
        FROM public.custos_os c
       WHERE c.status IN ('registrado','confirmado') AND c.tecnico_id IS NOT NULL AND c.data_lancamento BETWEEN p_from AND p_to
       GROUP BY c.tecnico_id
    ), comi AS (
      SELECT c.tecnico_id, coalesce(sum(c.valor_final), 0) AS comissao
        FROM public.comissoes c
       WHERE c.status <> 'cancelada' AND c.data_referencia BETWEEN p_from AND p_to
       GROUP BY c.tecnico_id
    ), meta AS (
      SELECT DISTINCT ON (mt.tecnico_id) mt.tecnico_id, mt.id AS meta_id, mt.tipo_meta, mt.inicio, mt.fim,
             mt.valor_meta, mt.quantidade_meta
        FROM public.metas_tecnicos mt
       WHERE mt.ativo AND mt.inicio <= p_to AND mt.fim >= p_from
       ORDER BY mt.tecnico_id, mt.inicio DESC
    ), calc AS (
      SELECT b.tecnico_id, b.tecnico,
        coalesce(pr.registrados, 0) AS registrados,
        coalesce(pr.enviados, 0) AS enviados,
        coalesce(pr.validados, 0) AS validados,
        coalesce(pr.pendentes, 0) AS pendentes,
        coalesce(pr.correcoes, 0) AS correcoes,
        coalesce(pr.rejeitados, 0) AS rejeitados,
        coalesce(pr.producao_validada, 0)::numeric(12,2) AS producao_validada,
        round(coalesce(pr.ticket_medio, 0), 2)::numeric(12,2) AS ticket_medio,
        coalesce(f.receita, 0)::numeric(12,2) AS receita_associada,
        coalesce(cu.custos, 0)::numeric(12,2) AS custos_diretos,
        coalesce(co.comissao, 0)::numeric(12,2) AS comissao,
        (coalesce(f.receita, 0) - coalesce(cu.custos, 0) - coalesce(co.comissao, 0))::numeric(12,2) AS margem_contribuicao,
        m.meta_id, m.tipo_meta, m.inicio AS meta_inicio, m.fim AS meta_fim, m.valor_meta, m.quantidade_meta
      FROM base b
      LEFT JOIN prod pr ON pr.tecnico_id = b.tecnico_id
      LEFT JOIN fin f ON f.tecnico_id = b.tecnico_id
      LEFT JOIN custo cu ON cu.tecnico_id = b.tecnico_id
      LEFT JOIN comi co ON co.tecnico_id = b.tecnico_id
      LEFT JOIN meta m ON m.tecnico_id = b.tecnico_id
    ), final AS (
      SELECT c.*,
        CASE WHEN coalesce(c.receita_associada, 0) > 0 THEN round(c.margem_contribuicao / c.receita_associada * 100, 2) ELSE NULL END AS margem_pct,
        CASE WHEN c.enviados > 0 THEN round(c.validados::numeric / c.enviados * 100, 2) ELSE NULL END AS indice_validacao,
        CASE WHEN c.enviados > 0 THEN round(c.correcoes::numeric / c.enviados * 100, 2) ELSE NULL END AS indice_correcao,
        CASE WHEN c.enviados > 0 THEN round(c.rejeitados::numeric / c.enviados * 100, 2) ELSE NULL END AS indice_rejeicao,
        CASE
          WHEN c.meta_id IS NULL THEN NULL
          WHEN c.tipo_meta = 'valor' AND coalesce(c.valor_meta, 0) > 0 THEN round(c.producao_validada / c.valor_meta * 100, 2)
          WHEN c.tipo_meta = 'quantidade' AND coalesce(c.quantidade_meta, 0) > 0 THEN round(c.validados::numeric / c.quantidade_meta * 100, 2)
          WHEN c.tipo_meta = 'combinada' AND coalesce(c.valor_meta, 0) > 0 AND coalesce(c.quantidade_meta, 0) > 0
            THEN round(((c.producao_validada / c.valor_meta) + (c.validados::numeric / c.quantidade_meta)) / 2 * 100, 2)
          ELSE NULL
        END AS meta_percentual,
        CASE
          WHEN c.meta_id IS NULL THEN NULL
          WHEN greatest(least(v_hoje, c.meta_fim) - c.meta_inicio + 1, 0) = 0 THEN NULL
          WHEN c.tipo_meta = 'quantidade'
            THEN round(c.validados::numeric / greatest(least(v_hoje, c.meta_fim) - c.meta_inicio + 1, 1) * (c.meta_fim - c.meta_inicio + 1), 2)
            ELSE round(c.producao_validada / greatest(least(v_hoje, c.meta_fim) - c.meta_inicio + 1, 1) * (c.meta_fim - c.meta_inicio + 1), 2)
        END AS meta_projecao,
        CASE
          WHEN c.meta_id IS NULL OR v_hoje > c.meta_fim THEN NULL
          WHEN greatest(c.meta_fim - v_hoje + 1, 0) = 0 THEN NULL
          WHEN c.tipo_meta = 'quantidade'
            THEN round(greatest(coalesce(c.quantidade_meta, 0) - c.validados, 0)::numeric / greatest(c.meta_fim - v_hoje + 1, 1), 2)
            ELSE round(greatest(coalesce(c.valor_meta, 0) - c.producao_validada, 0) / greatest(c.meta_fim - v_hoje + 1, 1), 2)
        END AS meta_ritmo_necessario
      FROM calc c
    )
    SELECT jsonb_agg(jsonb_build_object(
      'tecnico_id', f.tecnico_id, 'tecnico', f.tecnico,
      'registrados', f.registrados, 'enviados', f.enviados, 'validados', f.validados,
      'pendentes', f.pendentes, 'correcoes', f.correcoes, 'rejeitados', f.rejeitados,
      'producao_validada', f.producao_validada, 'ticket_medio', f.ticket_medio,
      'receita_associada', f.receita_associada, 'custos_diretos', f.custos_diretos,
      'comissao', f.comissao, 'margem_contribuicao', f.margem_contribuicao, 'margem_pct', f.margem_pct,
      'indice_validacao', f.indice_validacao, 'indice_correcao', f.indice_correcao, 'indice_rejeicao', f.indice_rejeicao,
      'meta', CASE WHEN f.meta_id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', f.meta_id, 'tipo', f.tipo_meta, 'inicio', f.meta_inicio, 'fim', f.meta_fim,
        'valor_meta', f.valor_meta, 'quantidade_meta', f.quantidade_meta,
        'percentual', f.meta_percentual, 'projecao', f.meta_projecao,
        'ritmo_necessario', f.meta_ritmo_necessario,
        'nivel', (SELECT n.nome FROM public.niveis_desempenho n WHERE n.ativo AND f.meta_percentual IS NOT NULL
                   AND f.meta_percentual >= n.percentual_minimo
                   AND (n.percentual_maximo IS NULL OR f.meta_percentual <= n.percentual_maximo)
                   ORDER BY n.ordem LIMIT 1)
      ) END
    ) ORDER BY f.producao_validada DESC)
    FROM final f
  ), '[]'::jsonb));
END $$;

-- 12) Painel individual (técnico vê o próprio; gerência vê qualquer um)
CREATE OR REPLACE FUNCTION public.metas_tecnico_painel(p_tecnico_id uuid, p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_geral jsonb;
  v_metas jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF p_tecnico_id IS DISTINCT FROM v_uid AND NOT (
    public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'metas', 'visualizar')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você só pode visualizar o seu próprio desempenho.');
  END IF;

  v_geral := (SELECT t FROM (
    SELECT (jsonb_array_elements(public.metas_tecnicos_desempenho(p_from, p_to)->'tecnicos')) AS t
  ) s WHERE (s.t->>'tecnico_id')::uuid = p_tecnico_id);

  IF v_geral IS NULL AND p_tecnico_id = v_uid THEN
    -- Técnico sem produção no período: monta visão própria mínima sem exigir permissão geral
    SELECT jsonb_build_object(
      'tecnico_id', v_uid, 'tecnico', (SELECT full_name FROM public.profiles WHERE id = v_uid),
      'registrados', count(*) FILTER (WHERE pr.status <> 'cancelado'),
      'enviados', count(*) FILTER (WHERE pr.enviado_em IS NOT NULL AND pr.status <> 'cancelado'),
      'validados', count(*) FILTER (WHERE pr.status = 'validado'),
      'pendentes', count(*) FILTER (WHERE pr.status = 'enviado_validacao'),
      'correcoes', count(*) FILTER (WHERE pr.status = 'correcao_solicitada'),
      'rejeitados', count(*) FILTER (WHERE pr.status = 'rejeitado'),
      'producao_validada', coalesce(sum(pr.valor_servico) FILTER (WHERE pr.status = 'validado'), 0),
      'ticket_medio', coalesce(avg(pr.valor_servico) FILTER (WHERE pr.status = 'validado'), 0),
      'receita_associada', 0, 'custos_diretos', 0, 'comissao', 0,
      'margem_contribuicao', 0, 'margem_pct', NULL,
      'indice_validacao', NULL, 'indice_correcao', NULL, 'indice_rejeicao', NULL,
      'meta', NULL
    ) INTO v_geral
    FROM public.producao_tecnica pr
    WHERE pr.tecnico_id = v_uid AND pr.data_execucao BETWEEN p_from AND p_to;
  ELSIF v_geral IS NULL THEN
    v_geral := jsonb_build_object('tecnico_id', p_tecnico_id, 'tecnico', (SELECT full_name FROM public.profiles WHERE id = p_tecnico_id));
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', mt.id, 'tipo', mt.tipo_meta, 'periodo_tipo', mt.periodo_tipo,
      'inicio', mt.inicio, 'fim', mt.fim, 'valor_meta', mt.valor_meta,
      'quantidade_meta', mt.quantidade_meta, 'status', mt.status, 'ativo', mt.ativo
    ) ORDER BY mt.inicio DESC), '[]'::jsonb)
    INTO v_metas
    FROM public.metas_tecnicos mt
   WHERE mt.tecnico_id = p_tecnico_id;

  RETURN jsonb_build_object('ok', true, 'desempenho', v_geral, 'metas', v_metas);
END $$;

-- 13) Histórico de metas da empresa (nunca apaga; sempre calculado das fontes)
CREATE OR REPLACE FUNCTION public.metas_historico() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'visualizar')
    OR public.has_permission(v_uid, 'metas', 'visualizar_ranking')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar o histórico de metas.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'metas', coalesce((
    SELECT jsonb_agg(public.metas_empresa_detalhe(m) ORDER BY m.data_inicio DESC)
      FROM public.metas_empresa m
  ), '[]'::jsonb));
END $$;

-- 14) Evolução diária: realizado acumulado vs linha ideal da meta principal
CREATE OR REPLACE FUNCTION public.metas_evolucao(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meta public.metas_empresa%ROWTYPE;
  v_tem_meta boolean := false;
  v_dias_totais integer;
  v_series jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'visualizar')
    OR public.has_permission(v_uid, 'metas', 'visualizar_ranking')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar a evolução de metas.');
  END IF;

  SELECT m.* INTO v_meta FROM public.metas_empresa m
   WHERE m.principal AND m.status IN ('planejada','ativa') AND m.tipo = 'faturamento'
   ORDER BY m.data_inicio DESC LIMIT 1;
  v_tem_meta := v_meta.id IS NOT NULL;
  v_dias_totais := CASE WHEN v_tem_meta THEN v_meta.data_fim - v_meta.data_inicio + 1 ELSE 0 END;

  WITH dias AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS dia
  ), fat AS (
    SELECT l.data_lancamento AS dia, sum(l.valor_final) AS total
      FROM public.caixa_lancamentos l
     WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_from AND p_to
     GROUP BY l.data_lancamento
  ), acum AS (
    SELECT d.dia, coalesce(f.total, 0) AS realizado_dia,
           sum(coalesce(f.total, 0)) OVER (ORDER BY d.dia) AS acumulado
      FROM dias d LEFT JOIN fat f ON f.dia = d.dia
  )
  SELECT jsonb_agg(jsonb_build_object(
      'data', a.dia, 'realizado_dia', a.realizado_dia, 'acumulado', a.acumulado,
      'ideal', CASE WHEN v_tem_meta AND a.dia BETWEEN v_meta.data_inicio AND v_meta.data_fim
                    THEN round(v_meta.valor_alvo / v_dias_totais * (a.dia - v_meta.data_inicio + 1), 2)
                    ELSE NULL END
    ) ORDER BY a.dia)
    INTO v_series
    FROM acum a;

  RETURN jsonb_build_object(
    'ok', true,
    'meta_principal', CASE WHEN v_tem_meta THEN public.metas_empresa_detalhe(v_meta) ELSE NULL END,
    'dias', coalesce(v_series, '[]'::jsonb)
  );
END $$;

-- 15) Resumo da meta principal para o Dashboard
CREATE OR REPLACE FUNCTION public.metas_principal_resumo() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_meta public.metas_empresa%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'visualizar')
    OR public.has_permission(v_uid, 'metas', 'visualizar_ranking')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT m.* INTO v_meta FROM public.metas_empresa m
   WHERE m.principal AND m.status IN ('planejada','ativa')
   ORDER BY m.data_inicio DESC LIMIT 1;
  IF v_meta.id IS NULL THEN RETURN jsonb_build_object('ok', true, 'meta', NULL); END IF;
  RETURN jsonb_build_object('ok', true, 'meta', public.metas_empresa_detalhe(v_meta));
END $$;

-- 16) Criar meta da empresa
CREATE OR REPLACE FUNCTION public.metas_empresa_registrar(
  p_nome text, p_tipo text, p_periodo_tipo text, p_data_inicio date, p_data_fim date,
  p_valor_alvo numeric, p_principal boolean DEFAULT false, p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hoje date := (now() AT TIME ZONE 'America/Manaus')::date;
  v_id uuid;
  v_status public.meta_status;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'metas', 'criar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para criar metas.');
  END IF;
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN RETURN jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO', 'message', 'Informe o nome da meta.'); END IF;
  IF p_tipo NOT IN ('faturamento','receita_liquida','margem_contribuicao','resultado_operacional','os_faturadas','ticket_medio') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Tipo de meta inválido.');
  END IF;
  IF p_periodo_tipo NOT IN ('semanal','mensal','personalizado') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERIODO_TIPO_INVALIDO', 'message', 'Tipo de período inválido.');
  END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Período da meta inválido.');
  END IF;
  IF p_valor_alvo IS NULL OR p_valor_alvo <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'O valor alvo deve ser maior que zero.');
  END IF;

  v_status := CASE WHEN v_hoje BETWEEN p_data_inicio AND p_data_fim THEN 'ativa'::public.meta_status ELSE 'planejada'::public.meta_status END;

  IF p_principal THEN
    UPDATE public.metas_empresa SET principal = false, updated_by = v_uid WHERE principal AND status IN ('planejada','ativa');
  END IF;

  INSERT INTO public.metas_empresa (
    nome, tipo, periodo_tipo, data_inicio, data_fim, valor_alvo,
    unidade, principal, status, observacao, responsavel_id, created_by, updated_by
  ) VALUES (
    btrim(p_nome), p_tipo, p_periodo_tipo, p_data_inicio, p_data_fim, p_valor_alvo,
    CASE WHEN p_tipo = 'os_faturadas' THEN 'quantidade' ELSE 'BRL' END,
    coalesce(p_principal, false), v_status, NULLIF(btrim(coalesce(p_observacao, '')), ''), v_uid, v_uid, v_uid
  ) RETURNING id INTO v_id;

  PERFORM public.registrar_auditoria('metas', 'criar_meta', NULL, jsonb_build_object(
    'id', v_id, 'nome', btrim(p_nome), 'tipo', p_tipo, 'inicio', p_data_inicio, 'fim', p_data_fim,
    'valor_alvo', p_valor_alvo, 'principal', coalesce(p_principal, false)));

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- 17) Atualizar meta da empresa
CREATE OR REPLACE FUNCTION public.metas_empresa_atualizar(
  p_id uuid, p_nome text, p_tipo text, p_periodo_tipo text, p_data_inicio date, p_data_fim date,
  p_valor_alvo numeric, p_principal boolean, p_observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.metas_empresa%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'metas', 'editar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar metas.');
  END IF;
  SELECT * INTO v_old FROM public.metas_empresa WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Meta não encontrada.'); END IF;
  IF v_old.status IN ('concluida','cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'META_ENCERRADA', 'message', 'Metas concluídas ou canceladas não podem ser editadas.');
  END IF;
  IF p_nome IS NULL OR btrim(p_nome) = '' THEN RETURN jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO', 'message', 'Informe o nome da meta.'); END IF;
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Período da meta inválido.');
  END IF;
  IF p_valor_alvo IS NULL OR p_valor_alvo <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'O valor alvo deve ser maior que zero.');
  END IF;

  IF p_principal AND NOT v_old.principal THEN
    UPDATE public.metas_empresa SET principal = false, updated_by = v_uid WHERE principal AND status IN ('planejada','ativa') AND id <> p_id;
  END IF;

  UPDATE public.metas_empresa SET
    nome = btrim(p_nome), tipo = p_tipo, periodo_tipo = p_periodo_tipo,
    data_inicio = p_data_inicio, data_fim = p_data_fim, valor_alvo = p_valor_alvo,
    unidade = CASE WHEN p_tipo = 'os_faturadas' THEN 'quantidade' ELSE 'BRL' END,
    principal = coalesce(p_principal, false),
    observacao = NULLIF(btrim(coalesce(p_observacao, '')), ''),
    updated_by = v_uid
  WHERE id = p_id;

  PERFORM public.registrar_auditoria('metas', 'editar_meta',
    jsonb_build_object('nome', v_old.nome, 'tipo', v_old.tipo, 'inicio', v_old.data_inicio, 'fim', v_old.data_fim, 'valor_alvo', v_old.valor_alvo, 'principal', v_old.principal),
    jsonb_build_object('nome', btrim(p_nome), 'tipo', p_tipo, 'inicio', p_data_inicio, 'fim', p_data_fim, 'valor_alvo', p_valor_alvo, 'principal', coalesce(p_principal, false)));

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 18) Alterar status da meta (ativar, concluir, cancelar) — histórico preservado
CREATE OR REPLACE FUNCTION public.metas_empresa_alterar_status(p_id uuid, p_status text, p_motivo text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old public.metas_empresa%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  SELECT * INTO v_old FROM public.metas_empresa WHERE id = p_id FOR UPDATE;
  IF v_old.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Meta não encontrada.'); END IF;
  IF p_status NOT IN ('planejada','ativa','concluida','cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Status inválido.');
  END IF;
  IF p_status IN ('concluida','cancelada') THEN
    IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'metas', 'encerrar')) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para encerrar metas.');
    END IF;
  ELSE
    IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'metas', 'editar')) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para alterar o status da meta.');
    END IF;
  END IF;
  IF p_status = 'cancelada' AND (p_motivo IS NULL OR btrim(p_motivo) = '') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  END IF;

  UPDATE public.metas_empresa SET status = p_status::public.meta_status, updated_by = v_uid WHERE id = p_id;

  PERFORM public.registrar_auditoria('metas', 'alterar_status_meta',
    jsonb_build_object('id', p_id, 'status', v_old.status),
    jsonb_build_object('id', p_id, 'status', p_status, 'motivo', NULLIF(btrim(coalesce(p_motivo, '')), '')));

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 19) Salvar meta de técnico (criar ou atualizar; ativo acompanha o status)
CREATE OR REPLACE FUNCTION public.metas_tecnico_salvar(
  p_id uuid, p_tecnico_id uuid, p_tipo_meta text, p_periodo_tipo text,
  p_inicio date, p_fim date, p_valor_meta numeric DEFAULT NULL, p_quantidade_meta integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'criar')
    OR public.has_permission(v_uid, 'metas', 'editar')
    OR public.has_permission(v_uid, 'producao', 'configurar_metas')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para configurar metas de técnicos.');
  END IF;
  IF p_tecnico_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'TECNICO_OBRIGATORIO', 'message', 'Selecione o técnico.'); END IF;
  IF p_tipo_meta NOT IN ('valor','quantidade','combinada','ticket_medio','margem','indice_validacao') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Tipo de meta inválido.');
  END IF;
  IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Período da meta inválido.');
  END IF;
  IF coalesce(p_valor_meta, 0) <= 0 AND coalesce(p_quantidade_meta, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALVO_OBRIGATORIO', 'message', 'Informe o valor ou a quantidade alvo.');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.metas_tecnicos (tecnico_id, tipo_meta, periodo_tipo, inicio, fim, valor_meta, quantidade_meta, ativo, status, created_by, updated_by)
    VALUES (p_tecnico_id, p_tipo_meta, coalesce(p_periodo_tipo, 'personalizado'), p_inicio, p_fim, p_valor_meta, p_quantidade_meta, true, 'ativa', v_uid, v_uid)
    RETURNING id INTO v_id;
    PERFORM public.registrar_auditoria('metas', 'criar_meta_tecnico', NULL, jsonb_build_object(
      'id', v_id, 'tecnico_id', p_tecnico_id, 'tipo', p_tipo_meta, 'inicio', p_inicio, 'fim', p_fim,
      'valor_meta', p_valor_meta, 'quantidade_meta', p_quantidade_meta));
  ELSE
    UPDATE public.metas_tecnicos SET
      tipo_meta = p_tipo_meta, periodo_tipo = coalesce(p_periodo_tipo, periodo_tipo),
      inicio = p_inicio, fim = p_fim, valor_meta = p_valor_meta, quantidade_meta = p_quantidade_meta,
      updated_by = v_uid
    WHERE id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Meta não encontrada.'); END IF;
    v_id := p_id;
    PERFORM public.registrar_auditoria('metas', 'editar_meta_tecnico', NULL, jsonb_build_object(
      'id', v_id, 'tipo', p_tipo_meta, 'inicio', p_inicio, 'fim', p_fim,
      'valor_meta', p_valor_meta, 'quantidade_meta', p_quantidade_meta));
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- 20) Alterar status de meta de técnico
CREATE OR REPLACE FUNCTION public.metas_tecnico_alterar_status(p_id uuid, p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (
    public.has_role(v_uid, 'administrador')
    OR public.has_permission(v_uid, 'metas', 'editar')
    OR public.has_permission(v_uid, 'metas', 'encerrar')
    OR public.has_permission(v_uid, 'producao', 'configurar_metas')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para alterar metas de técnicos.');
  END IF;
  IF p_status NOT IN ('planejada','ativa','concluida','cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Status inválido.');
  END IF;
  UPDATE public.metas_tecnicos SET status = p_status::public.meta_status, ativo = (p_status = 'ativa'), updated_by = v_uid WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Meta não encontrada.'); END IF;
  PERFORM public.registrar_auditoria('metas', 'alterar_status_meta_tecnico', NULL, jsonb_build_object('id', p_id, 'status', p_status));
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 21) Configurar faixas de projeção (ADM)
CREATE OR REPLACE FUNCTION public.metas_config_atualizar(p_acima numeric, p_no_ritmo numeric, p_atencao numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); END IF;
  IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'metas', 'configurar_indicadores')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para configurar os indicadores.');
  END IF;
  IF p_acima IS NULL OR p_no_ritmo IS NULL OR p_atencao IS NULL
     OR NOT (p_acima >= p_no_ritmo AND p_no_ritmo >= p_atencao AND p_atencao > 0) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FAIXAS_INVALIDAS', 'message', 'As faixas devem obedecer: Acima ≥ No Ritmo ≥ Atenção > 0.');
  END IF;
  SELECT value INTO v_old FROM public.settings WHERE key = 'metas';
  INSERT INTO public.settings (key, value) VALUES ('metas', jsonb_build_object('faixas_projecao', jsonb_build_object('acima', p_acima, 'no_ritmo', p_no_ritmo, 'atencao', p_atencao)))
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  PERFORM public.registrar_auditoria('metas', 'configurar_faixas_projecao', v_old,
    jsonb_build_object('acima', p_acima, 'no_ritmo', p_no_ritmo, 'atencao', p_atencao));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Execução restrita a usuários autenticados (cada função valida permissão internamente)
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'metas_realizado(text,date,date)',
    'metas_classificar_projecao(numeric)',
    'metas_empresa_detalhe(public.metas_empresa)',
    'metas_indicadores_periodo(date,date)',
    'metas_painel(date,date)',
    'metas_tecnicos_desempenho(date,date)',
    'metas_tecnico_painel(uuid,date,date)',
    'metas_historico()',
    'metas_evolucao(date,date)',
    'metas_principal_resumo()',
    'metas_empresa_registrar(text,text,text,date,date,numeric,boolean,text)',
    'metas_empresa_atualizar(uuid,text,text,text,date,date,numeric,boolean,text)',
    'metas_empresa_alterar_status(uuid,text,text)',
    'metas_tecnico_salvar(uuid,uuid,text,text,date,date,numeric,integer)',
    'metas_tecnico_alterar_status(uuid,text)',
    'metas_config_atualizar(numeric,numeric,numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $$;