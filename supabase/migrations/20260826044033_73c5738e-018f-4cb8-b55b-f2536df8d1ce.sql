
-- ============ MÓDULO RELATÓRIOS GERENCIAIS E INTELIGÊNCIA DE PLANEJAMENTO ============

-- Sub-permissões do módulo (liberação individual pelo ADM; administrador tem acesso total)
INSERT INTO public.modules (key, label, sort_order) VALUES
  ('relatorios_faturamento', 'Relatórios · Faturamento', 51),
  ('relatorios_producao', 'Relatórios · Produção', 52),
  ('relatorios_tecnicos', 'Relatórios · Técnicos', 53),
  ('relatorios_financeiro', 'Relatórios · Financeiro', 54),
  ('relatorios_rentabilidade', 'Relatórios · Rentabilidade', 55),
  ('relatorios_planejamento', 'Relatórios · Planejamento', 56)
ON CONFLICT (key) DO NOTHING;

-- Configuração dos cenários de planejamento (fatores sobre a referência)
INSERT INTO public.settings (key, value) VALUES
  ('planejamento', '{"cenario_conservador": 1.0, "cenario_base": 1.05, "cenario_agressivo": 1.15}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============ SNAPSHOT MENSAL ============
CREATE TABLE IF NOT EXISTS public.relatorios_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competencia date NOT NULL UNIQUE,
  faturamento numeric(12,2) NOT NULL DEFAULT 0,
  receita_liquida numeric(12,2) NOT NULL DEFAULT 0,
  os_faturadas integer NOT NULL DEFAULT 0,
  ticket_medio numeric(12,2) NOT NULL DEFAULT 0,
  custos numeric(12,2) NOT NULL DEFAULT 0,
  comissao numeric(12,2) NOT NULL DEFAULT 0,
  margem numeric(12,2) NOT NULL DEFAULT 0,
  despesas numeric(12,2) NOT NULL DEFAULT 0,
  folha numeric(12,2) NOT NULL DEFAULT 0,
  resultado numeric(12,2) NOT NULL DEFAULT 0,
  producao_validada numeric(12,2) NOT NULL DEFAULT 0,
  servicos_validados integer NOT NULL DEFAULT 0,
  gerado_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.relatorios_snapshots TO authenticated;
GRANT ALL ON public.relatorios_snapshots TO service_role;
ALTER TABLE public.relatorios_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura de snapshots por permissao de relatorios" ON public.relatorios_snapshots
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'relatorios', 'visualizar'));

-- Índices de apoio às agregações
CREATE INDEX IF NOT EXISTS idx_caixa_lanc_data_status ON public.caixa_lancamentos (data_lancamento) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS idx_producao_status_data ON public.producao_tecnica (status, data_execucao);
CREATE INDEX IF NOT EXISTS idx_custos_os_status ON public.custos_os (os) WHERE status IN ('registrado','confirmado');
CREATE INDEX IF NOT EXISTS idx_comissoes_os ON public.comissoes (os) WHERE status <> 'cancelada';

-- ============ HELPERS ============

-- Custos diretos por OS (líquido de devoluções)
CREATE OR REPLACE FUNCTION public.relatorios_custos_por_os(p_from date, p_to date)
RETURNS TABLE(os text, custo numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.os, sum(c.custo_total - c.devolvido_total)::numeric(12,2)
  FROM public.custos_os c
  WHERE c.status IN ('registrado','confirmado')
    AND c.data_lancamento BETWEEN p_from AND p_to
  GROUP BY c.os
$$;
REVOKE ALL ON FUNCTION public.relatorios_custos_por_os(date, date) FROM public, anon;

-- ============ FATURAMENTO ============
CREATE OR REPLACE FUNCTION public.relatorios_faturamento(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dias int := (p_to - p_from) + 1;
  v_ant_from date := p_from - v_dias;
  v_ant_to date := p_from - 1;
  v_resumo jsonb;
  v_anterior jsonb;
  v_por_dia jsonb;
  v_por_semana jsonb;
  v_por_mes jsonb;
  v_medias jsonb;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'relatorios_faturamento', 'visualizar')
       OR public.has_permission(auth.uid(), 'relatorios', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para relatórios de faturamento.');
  END IF;

  WITH base AS (
    SELECT * FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_from AND p_to
  )
  SELECT jsonb_build_object(
    'faturamento_bruto', coalesce(round(sum(valor_bruto),2),0),
    'descontos', coalesce(round(sum(desconto),2),0),
    'faturamento_final', coalesce(round(sum(valor_final),2),0),
    'taxas', coalesce(round(sum(taxas_total),2),0),
    'receita_liquida', coalesce(round(sum(receita_liquida),2),0),
    'lancamentos', count(*),
    'os_faturadas', count(distinct os) FILTER (WHERE os IS NOT NULL),
    'ticket_medio', coalesce(round(sum(valor_final) / nullif(count(*),0),2),0),
    'ticket_medio_os', coalesce(round(sum(valor_final) / nullif(count(distinct os) FILTER (WHERE os IS NOT NULL),0),2),0)
  ) INTO v_resumo FROM base;

  WITH base AS (
    SELECT * FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN v_ant_from AND v_ant_to
  )
  SELECT jsonb_build_object(
    'inicio', v_ant_from, 'fim', v_ant_to,
    'faturamento_final', coalesce(round(sum(valor_final),2),0),
    'receita_liquida', coalesce(round(sum(receita_liquida),2),0),
    'os_faturadas', count(distinct os) FILTER (WHERE os IS NOT NULL),
    'ticket_medio', coalesce(round(sum(valor_final) / nullif(count(*),0),2),0)
  ) INTO v_anterior FROM base;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'data', d, 'faturamento', fat, 'os', os_qtd, 'ticket_medio', ticket) ORDER BY d), '[]'::jsonb)
  INTO v_por_dia
  FROM (
    SELECT l.data_lancamento AS d, round(sum(l.valor_final),2) AS fat,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd,
      coalesce(round(sum(l.valor_final) / nullif(count(*),0),2),0) AS ticket
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_from AND p_to
    GROUP BY l.data_lancamento
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'semana_inicio', sem, 'faturamento', fat, 'os', os_qtd, 'ticket_medio', ticket,
    'variacao_pct', CASE WHEN lag(fat) OVER (ORDER BY sem) > 0
      THEN round((fat - lag(fat) OVER (ORDER BY sem)) / lag(fat) OVER (ORDER BY sem) * 100, 2) END
  ) ORDER BY sem), '[]'::jsonb)
  INTO v_por_semana
  FROM (
    SELECT date_trunc('week', l.data_lancamento)::date AS sem, round(sum(l.valor_final),2) AS fat,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd,
      coalesce(round(sum(l.valor_final) / nullif(count(*),0),2),0) AS ticket
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_from AND p_to
    GROUP BY 1
  ) s;

  -- Últimos 12 meses até o fim do período selecionado
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'mes', mes, 'faturamento', fat, 'receita_liquida', liq, 'os', os_qtd, 'ticket_medio', ticket,
    'variacao_pct', CASE WHEN lag(fat) OVER (ORDER BY mes) > 0
      THEN round((fat - lag(fat) OVER (ORDER BY mes)) / lag(fat) OVER (ORDER BY mes) * 100, 2) END
  ) ORDER BY mes), '[]'::jsonb)
  INTO v_por_mes
  FROM (
    SELECT date_trunc('month', l.data_lancamento)::date AS mes, round(sum(l.valor_final),2) AS fat,
      round(sum(l.receita_liquida),2) AS liq,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd,
      coalesce(round(sum(l.valor_final) / nullif(count(*),0),2),0) AS ticket
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo'
      AND l.data_lancamento >= date_trunc('month', p_to)::date - interval '11 months'
      AND l.data_lancamento <= p_to
    GROUP BY 1
  ) s;

  WITH mensal AS (
    SELECT date_trunc('month', l.data_lancamento)::date AS mes, sum(l.valor_final) AS fat
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo'
      AND l.data_lancamento >= date_trunc('month', p_to)::date - interval '11 months'
      AND l.data_lancamento <= p_to
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'm3', coalesce(round((SELECT avg(fat) FROM (SELECT fat FROM mensal ORDER BY mes DESC LIMIT 3) t),2),0),
    'm6', coalesce(round((SELECT avg(fat) FROM (SELECT fat FROM mensal ORDER BY mes DESC LIMIT 6) t),2),0),
    'm12', coalesce(round((SELECT avg(fat) FROM mensal),2),0)
  ) INTO v_medias;

  RETURN jsonb_build_object(
    'ok', true,
    'resumo', v_resumo,
    'anterior', v_anterior,
    'por_dia', v_por_dia,
    'por_semana', v_por_semana,
    'por_mes', v_por_mes,
    'medias', v_medias
  );
END;
$$;
REVOKE ALL ON FUNCTION public.relatorios_faturamento(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relatorios_faturamento(date, date) TO authenticated;

-- ============ PRODUÇÃO / SERVIÇOS / MARCAS / MODELOS / PEÇAS ============
CREATE OR REPLACE FUNCTION public.relatorios_producao(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_resumo jsonb;
  v_por_dia jsonb;
  v_por_mes jsonb;
  v_por_tipo jsonb;
  v_por_marca jsonb;
  v_marca_servico jsonb;
  v_por_modelo jsonb;
  v_modelo_servico jsonb;
  v_pecas jsonb;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'relatorios_producao', 'visualizar')
       OR public.has_permission(auth.uid(), 'relatorios', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para relatórios de produção.');
  END IF;

  -- Receita associada por OS (Caixa é a fonte financeira oficial)
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_rel_receita_os ON COMMIT DROP AS
    SELECT l.os, sum(l.receita_liquida) AS receita
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' AND l.os IS NOT NULL
    GROUP BY l.os;
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_rel_prod ON COMMIT DROP AS
    SELECT p.*, r.receita AS receita_os
    FROM public.producao_tecnica p
    LEFT JOIN tmp_rel_receita_os r ON r.os = p.os
    WHERE p.status = 'validado' AND p.data_execucao BETWEEN p_from AND p_to;

  SELECT jsonb_build_object(
    'servicos_validados', count(*),
    'valor_producao', coalesce(round(sum(valor_servico),2),0),
    'valor_medio', coalesce(round(sum(valor_servico) / nullif(count(*),0),2),0),
    'tecnicos_participantes', count(distinct tecnico_id)
  ) INTO v_resumo FROM tmp_rel_prod;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'data', d, 'servicos', qtd, 'valor', val, 'media', media) ORDER BY d), '[]'::jsonb)
  INTO v_por_dia FROM (
    SELECT data_execucao AS d, count(*) AS qtd, round(sum(valor_servico),2) AS val,
      round(sum(valor_servico)/count(*),2) AS media
    FROM tmp_rel_prod GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'mes', mes, 'servicos', qtd, 'valor', val, 'media', media) ORDER BY mes), '[]'::jsonb)
  INTO v_por_mes FROM (
    SELECT date_trunc('month', data_execucao)::date AS mes, count(*) AS qtd,
      round(sum(valor_servico),2) AS val, round(sum(valor_servico)/count(*),2) AS media
    FROM tmp_rel_prod GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tipo', tipo, 'quantidade', qtd, 'pct', pct, 'valor', val, 'ticket_medio', ticket,
    'receita_associada', rec) ORDER BY qtd DESC), '[]'::jsonb)
  INTO v_por_tipo FROM (
    SELECT coalesce(t.nome, 'Outros') AS tipo, count(*) AS qtd,
      round(count(*)::numeric / nullif(sum(count(*)) OVER (),0) * 100, 2) AS pct,
      round(sum(p.valor_servico),2) AS val,
      round(sum(p.valor_servico)/count(*),2) AS ticket,
      round(sum(p.receita_os),2) AS rec
    FROM tmp_rel_prod p
    LEFT JOIN public.tipos_servico_tecnico t ON t.id = p.tipo_servico_id
    GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'marca', marca, 'quantidade', qtd, 'pct', pct, 'receita_associada', rec, 'ticket_medio', ticket
  ) ORDER BY qtd DESC), '[]'::jsonb)
  INTO v_por_marca FROM (
    SELECT upper(coalesce(nullif(trim(marca_tv),''), 'Não informada')) AS marca, count(*) AS qtd,
      round(count(*)::numeric / nullif(sum(count(*)) OVER (),0) * 100, 2) AS pct,
      round(sum(receita_os),2) AS rec,
      round(coalesce(sum(receita_os),0) / count(*),2) AS ticket
    FROM tmp_rel_prod GROUP BY 1
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'marca', marca, 'tipo', tipo, 'quantidade', qtd) ORDER BY marca, qtd DESC), '[]'::jsonb)
  INTO v_marca_servico FROM (
    SELECT upper(coalesce(nullif(trim(p.marca_tv),''), 'Não informada')) AS marca,
      coalesce(t.nome, 'Outros') AS tipo, count(*) AS qtd
    FROM tmp_rel_prod p
    LEFT JOIN public.tipos_servico_tecnico t ON t.id = p.tipo_servico_id
    GROUP BY 1, 2
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'marca', marca, 'modelo', modelo, 'polegadas', pol, 'quantidade', qtd,
    'receita_associada', rec, 'ticket_medio', ticket, 'servicos_comuns', comuns
  ) ORDER BY qtd DESC), '[]'::jsonb)
  INTO v_por_modelo FROM (
    SELECT upper(coalesce(nullif(trim(p.marca_tv),''), '?')) AS marca,
      coalesce(nullif(trim(p.modelo_tv),''), 'Não informado') AS modelo,
      max(p.polegadas) AS pol, count(*) AS qtd,
      round(sum(p.receita_os),2) AS rec,
      round(coalesce(sum(p.receita_os),0) / count(*),2) AS ticket,
      (SELECT string_agg(x.tipo || ' (' || x.qtd || ')', ', ' ORDER BY x.qtd DESC)
        FROM (SELECT coalesce(t2.nome,'Outros') AS tipo, count(*) AS qtd
              FROM tmp_rel_prod p2
              LEFT JOIN public.tipos_servico_tecnico t2 ON t2.id = p2.tipo_servico_id
              WHERE upper(coalesce(nullif(trim(p2.marca_tv),''), '?')) = upper(coalesce(nullif(trim(p.marca_tv),''), '?'))
                AND coalesce(nullif(trim(p2.modelo_tv),''), 'Não informado') = coalesce(nullif(trim(p.modelo_tv),''), 'Não informado')
              GROUP BY 1 ORDER BY qtd DESC LIMIT 3) x) AS comuns
    FROM tmp_rel_prod p
    GROUP BY 1, 2
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'modelo', modelo, 'tipo', tipo, 'quantidade', qtd) ORDER BY modelo, qtd DESC), '[]'::jsonb)
  INTO v_modelo_servico FROM (
    SELECT coalesce(nullif(trim(p.modelo_tv),''), 'Não informado') AS modelo,
      coalesce(t.nome, 'Outros') AS tipo, count(*) AS qtd
    FROM tmp_rel_prod p
    LEFT JOIN public.tipos_servico_tecnico t ON t.id = p.tipo_servico_id
    GROUP BY 1, 2
  ) s;

  -- Marca × categoria de peça (custos cruzados com a produção validada da OS)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'marca', marca, 'categoria', categoria, 'quantidade', qtd, 'custo_total', custo
  ) ORDER BY custo DESC), '[]'::jsonb)
  INTO v_pecas FROM (
    SELECT upper(coalesce(nullif(trim(pr.marca_tv),''), nullif(trim(c.marca),''), 'Não informada')) AS marca,
      coalesce(cp.nome, 'Sem categoria') AS categoria,
      sum(c.quantidade) AS qtd,
      round(sum(c.custo_total - c.devolvido_total),2) AS custo
    FROM public.custos_os c
    LEFT JOIN public.producao_tecnica pr ON pr.os = c.os AND pr.status = 'validado'
    LEFT JOIN public.categorias_pecas cp ON cp.id = c.categoria_id
    WHERE c.status IN ('registrado','confirmado')
      AND c.data_lancamento BETWEEN p_from AND p_to
    GROUP BY 1, 2
  ) s;

  DROP TABLE IF EXISTS tmp_rel_prod;
  DROP TABLE IF EXISTS tmp_rel_receita_os;

  RETURN jsonb_build_object(
    'ok', true,
    'resumo', v_resumo,
    'por_dia', v_por_dia,
    'por_mes', v_por_mes,
    'por_tipo', v_por_tipo,
    'por_marca', v_por_marca,
    'marca_x_servico', v_marca_servico,
    'por_modelo', v_por_modelo,
    'modelo_x_servico', v_modelo_servico,
    'marca_x_peca', v_pecas
  );
END;
$$;
REVOKE ALL ON FUNCTION public.relatorios_producao(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relatorios_producao(date, date) TO authenticated;

-- ============ TÉCNICOS ============
CREATE OR REPLACE FUNCTION public.relatorios_tecnicos(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tecnicos jsonb;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'relatorios_tecnicos', 'visualizar')
       OR public.has_permission(auth.uid(), 'relatorios', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para relatórios por técnico.');
  END IF;

  WITH prod AS (
    SELECT p.tecnico_id,
      count(*) FILTER (WHERE p.status <> 'cancelado') AS registrados,
      count(*) FILTER (WHERE p.status = 'validado') AS validados,
      count(*) FILTER (WHERE p.status = 'correcao_solicitada') AS correcoes,
      count(*) FILTER (WHERE p.status = 'rejeitado') AS rejeitados,
      coalesce(sum(p.valor_servico) FILTER (WHERE p.status = 'validado'),0) AS producao_validada
    FROM public.producao_tecnica p
    WHERE p.data_execucao BETWEEN p_from AND p_to
    GROUP BY p.tecnico_id
  ),
  caixa AS (
    SELECT l.tecnico_id,
      round(sum(l.receita_liquida),2) AS receita,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' AND l.tecnico_id IS NOT NULL
      AND l.data_lancamento BETWEEN p_from AND p_to
    GROUP BY l.tecnico_id
  ),
  custos AS (
    SELECT c.tecnico_id, round(sum(c.custo_total - c.devolvido_total),2) AS custo
    FROM public.custos_os c
    WHERE c.status IN ('registrado','confirmado') AND c.tecnico_id IS NOT NULL
      AND c.data_lancamento BETWEEN p_from AND p_to
    GROUP BY c.tecnico_id
  ),
  comis AS (
    SELECT cm.tecnico_id, round(sum(cm.valor_final),2) AS comissao
    FROM public.comissoes cm
    WHERE cm.status <> 'cancelada' AND cm.data_referencia BETWEEN p_from AND p_to
    GROUP BY cm.tecnico_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tecnico_id', pr.id,
    'tecnico', pr.full_name,
    'registrados', coalesce(p.registrados,0),
    'validados', coalesce(p.validados,0),
    'correcoes', coalesce(p.correcoes,0),
    'rejeitados', coalesce(p.rejeitados,0),
    'producao_validada', round(coalesce(p.producao_validada,0),2),
    'receita_associada', coalesce(cx.receita,0),
    'os_faturadas', coalesce(cx.os_qtd,0),
    'ticket_medio', coalesce(round(cx.receita / nullif(cx.os_qtd,0),2),0),
    'custos', coalesce(cu.custo,0),
    'comissao', coalesce(co.comissao,0),
    'margem', round(coalesce(cx.receita,0) - coalesce(cu.custo,0) - coalesce(co.comissao,0),2),
    'indice_validacao', CASE WHEN coalesce(p.validados,0) + coalesce(p.correcoes,0) > 0
      THEN round(p.validados::numeric / (p.validados + p.correcoes) * 100, 2) END
  ) ORDER BY coalesce(p.producao_validada,0) DESC), '[]'::jsonb)
  INTO v_tecnicos
  FROM public.profiles pr
  JOIN prod p ON p.tecnico_id = pr.id
  LEFT JOIN caixa cx ON cx.tecnico_id = pr.id
  LEFT JOIN custos cu ON cu.tecnico_id = pr.id
  LEFT JOIN comis co ON co.tecnico_id = pr.id;

  RETURN jsonb_build_object('ok', true, 'tecnicos', v_tecnicos);
END;
$$;
REVOKE ALL ON FUNCTION public.relatorios_tecnicos(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relatorios_tecnicos(date, date) TO authenticated;

-- ============ RENTABILIDADE ============
CREATE OR REPLACE FUNCTION public.relatorios_rentabilidade(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_por_servico jsonb;
  v_por_marca jsonb;
  v_por_tecnico jsonb;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'relatorios_rentabilidade', 'visualizar')
       OR public.has_permission(auth.uid(), 'relatorios', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para relatórios de rentabilidade.');
  END IF;

  -- Base por OS: receita do caixa, custos, comissões e tipo de serviço dominante da produção validada
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_rel_os ON COMMIT DROP AS
    WITH rec AS (
      SELECT l.os, round(sum(l.receita_liquida),2) AS receita
      FROM public.caixa_lancamentos l
      WHERE l.status = 'ativo' AND l.os IS NOT NULL
        AND l.data_lancamento BETWEEN p_from AND p_to
      GROUP BY l.os
    ),
    cus AS (
      SELECT * FROM public.relatorios_custos_por_os(p_from, p_to)
    ),
    com AS (
      SELECT cm.os, round(sum(cm.valor_final),2) AS comissao
      FROM public.comissoes cm
      WHERE cm.status <> 'cancelada' AND cm.data_referencia BETWEEN p_from AND p_to
      GROUP BY cm.os
    ),
    tipo AS (
      SELECT DISTINCT ON (p.os) p.os, coalesce(t.nome, 'Outros') AS tipo,
        upper(coalesce(nullif(trim(p.marca_tv),''), 'Não informada')) AS marca
      FROM public.producao_tecnica p
      LEFT JOIN public.tipos_servico_tecnico t ON t.id = p.tipo_servico_id
      WHERE p.status = 'validado'
      ORDER BY p.os, p.data_execucao DESC
    )
    SELECT rec.os, rec.receita, coalesce(cus.custo,0) AS custo, coalesce(com.comissao,0) AS comissao,
      coalesce(tipo.tipo, 'Sem produção validada') AS tipo,
      coalesce(tipo.marca, 'Não informada') AS marca
    FROM rec
    LEFT JOIN cus ON cus.os = rec.os
    LEFT JOIN com ON com.os = rec.os
    LEFT JOIN tipo ON tipo.os = rec.os;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'categoria', tipo, 'quantidade', qtd, 'receita', rec, 'custos', cus, 'comissao', com,
    'margem', rec - cus - com,
    'margem_pct', CASE WHEN rec > 0 THEN round((rec - cus - com) / rec * 100, 2) END
  ) ORDER BY (rec - cus - com) DESC), '[]'::jsonb)
  INTO v_por_servico FROM (
    SELECT tipo, count(*) AS qtd, round(sum(receita),2) AS rec, round(sum(custo),2) AS cus, round(sum(comissao),2) AS com
    FROM tmp_rel_os GROUP BY tipo
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'categoria', marca, 'quantidade', qtd, 'receita', rec, 'custos', cus, 'comissao', com,
    'margem', rec - cus - com,
    'margem_pct', CASE WHEN rec > 0 THEN round((rec - cus - com) / rec * 100, 2) END
  ) ORDER BY (rec - cus - com) DESC), '[]'::jsonb)
  INTO v_por_marca FROM (
    SELECT marca, count(*) AS qtd, round(sum(receita),2) AS rec, round(sum(custo),2) AS cus, round(sum(comissao),2) AS com
    FROM tmp_rel_os GROUP BY marca
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'categoria', t.tecnico, 'quantidade', t.validados, 'receita', t.receita_associada,
    'custos', t.custos, 'comissao', t.comissao, 'margem', t.margem,
    'margem_pct', CASE WHEN t.receita_associada > 0 THEN round(t.margem / t.receita_associada * 100, 2) END
  ) ORDER BY t.margem DESC), '[]'::jsonb)
  INTO v_por_tecnico
  FROM (
    SELECT (x->>'tecnico')::text AS tecnico, (x->>'validados')::int AS validados,
      (x->>'receita_associada')::numeric AS receita_associada,
      (x->>'custos')::numeric AS custos, (x->>'comissao')::numeric AS comissao,
      (x->>'margem')::numeric AS margem
    FROM jsonb_array_elements(coalesce(public.relatorios_tecnicos(p_from, p_to)->'tecnicos','[]'::jsonb)) x
  ) t;

  DROP TABLE IF EXISTS tmp_rel_os;

  RETURN jsonb_build_object(
    'ok', true,
    'por_servico', v_por_servico,
    'por_marca', v_por_marca,
    'por_tecnico', v_por_tecnico
  );
END;
$$;
REVOKE ALL ON FUNCTION public.relatorios_rentabilidade(date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relatorios_rentabilidade(date, date) TO authenticated;

-- ============ PLANEJAMENTO E PROJEÇÕES ============
CREATE OR REPLACE FUNCTION public.relatorios_planejamento()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cfg jsonb;
  v_f_cons numeric := 1.0;
  v_f_base numeric := 1.05;
  v_f_agr numeric := 1.15;
  v_medias jsonb;
  v_projecao jsonb;
  v_tecnicos jsonb;
  v_marcas jsonb;
  v_servicos jsonb;
  v_modelos jsonb;
  v_alertas jsonb := '[]'::jsonb;
  v_media3 numeric;
  v_media6 numeric;
  v_media12 numeric;
  v_mes_atual_fat numeric;
  v_cresc numeric;
  v_proj_servicos numeric;
  v_snapshots jsonb;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'relatorios_planejamento', 'visualizar')
       OR public.has_permission(auth.uid(), 'relatorios', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para planejamento.');
  END IF;

  SELECT value INTO v_cfg FROM public.settings WHERE key = 'planejamento';
  v_f_cons := coalesce((v_cfg->>'cenario_conservador')::numeric, 1.0);
  v_f_base := coalesce((v_cfg->>'cenario_base')::numeric, 1.05);
  v_f_agr := coalesce((v_cfg->>'cenario_agressivo')::numeric, 1.15);

  -- Histórico mensal de faturamento (últimos 12 meses fechados + mês corrente parcial)
  CREATE TEMPORARY TABLE IF NOT EXISTS tmp_plan_mensal ON COMMIT DROP AS
    SELECT date_trunc('month', l.data_lancamento)::date AS mes,
      round(sum(l.valor_final),2) AS faturamento,
      round(sum(l.receita_liquida),2) AS receita_liquida,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo'
      AND l.data_lancamento >= date_trunc('month', now())::date - interval '12 months'
    GROUP BY 1;

  SELECT round(coalesce(avg(faturamento) FILTER (WHERE rn <= 3),0),2),
         round(coalesce(avg(faturamento) FILTER (WHERE rn <= 6),0),2),
         round(coalesce(avg(faturamento),0),2)
    INTO v_media3, v_media6, v_media12
  FROM (SELECT faturamento, row_number() OVER (ORDER BY mes DESC) AS rn FROM tmp_plan_mensal) t;

  SELECT coalesce(faturamento,0) INTO v_mes_atual_fat
  FROM tmp_plan_mensal WHERE mes = date_trunc('month', now())::date;
  v_mes_atual_fat := coalesce(v_mes_atual_fat, 0);

  -- Crescimento médio m/m dos últimos 6 meses
  SELECT round(coalesce(avg(var),0),2) INTO v_cresc FROM (
    SELECT CASE WHEN lag(faturamento) OVER (ORDER BY mes) > 0
      THEN (faturamento - lag(faturamento) OVER (ORDER BY mes)) / lag(faturamento) OVER (ORDER BY mes) * 100 END AS var
    FROM tmp_plan_mensal ORDER BY mes DESC LIMIT 6
  ) v WHERE var IS NOT NULL;
  v_cresc := coalesce(v_cresc, 0);

  SELECT jsonb_build_object(
    'media_3m', v_media3, 'media_6m', v_media6, 'media_12m', v_media12,
    'mes_atual_parcial', v_mes_atual_fat,
    'crescimento_medio_pct', v_cresc,
    'melhor_mes', (SELECT jsonb_build_object('mes', mes, 'faturamento', faturamento) FROM tmp_plan_mensal ORDER BY faturamento DESC LIMIT 1),
    'pior_mes', (SELECT jsonb_build_object('mes', mes, 'faturamento', faturamento) FROM tmp_plan_mensal WHERE faturamento > 0 ORDER BY faturamento LIMIT 1)
  ) INTO v_medias;

  -- Projeção de serviços (média 3m × crescimento)
  SELECT round(coalesce(avg(qtd),0) * (1 + greatest(v_cresc,0) / 100))
    INTO v_proj_servicos
  FROM (
    SELECT count(*) AS qtd FROM public.producao_tecnica
    WHERE status = 'validado'
      AND data_execucao >= date_trunc('month', now())::date - interval '3 months'
    GROUP BY date_trunc('month', data_execucao)
  ) s;
  v_proj_servicos := coalesce(v_proj_servicos, 0);

  SELECT jsonb_build_object(
    'projecao_base', round(v_media3 * (1 + v_cresc / 100), 2),
    'cenarios', jsonb_build_object(
      'conservador', round(v_media3 * v_f_cons, 2),
      'base', round(v_media3 * (1 + v_cresc / 100) * v_f_base, 2),
      'agressivo', round(v_media3 * (1 + v_cresc / 100) * v_f_agr, 2),
      'fatores', jsonb_build_object('conservador', v_f_cons, 'base', v_f_base, 'agressivo', v_f_agr)
    ),
    'faixa_sugerida', jsonb_build_object(
      'min', round(v_media3 * v_f_cons, 2),
      'max', round(v_media3 * (1 + v_cresc / 100) * v_f_agr, 2)
    ),
    'projecao_servicos', v_proj_servicos
  ) INTO v_projecao;

  -- Planejamento por técnico
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tecnico', tecnico, 'media_3m', media_3m, 'melhor_mes', melhor, 'atual', atual,
    'ticket_medio', ticket, 'servicos_media', servicos_media
  ) ORDER BY media_3m DESC), '[]'::jsonb)
  INTO v_tecnicos FROM (
    SELECT pr.full_name AS tecnico,
      round(coalesce(avg(m.val) FILTER (WHERE m.rn <= 3),0),2) AS media_3m,
      round(coalesce(max(m.val),0),2) AS melhor,
      round(coalesce(sum(m.val) FILTER (WHERE m.mes = date_trunc('month', now())::date),0),2) AS atual,
      round(coalesce(sum(m.val) / nullif(sum(m.qtd),0),0),2) AS ticket,
      round(coalesce(avg(m.qtd),0),1) AS servicos_media
    FROM (
      SELECT p.tecnico_id, date_trunc('month', p.data_execucao)::date AS mes,
        sum(p.valor_servico) AS val, count(*) AS qtd,
        row_number() OVER (PARTITION BY p.tecnico_id ORDER BY date_trunc('month', p.data_execucao) DESC) AS rn
      FROM public.producao_tecnica p
      WHERE p.status = 'validado'
        AND p.data_execucao >= date_trunc('month', now())::date - interval '12 months'
      GROUP BY p.tecnico_id, 2
    ) m
    JOIN public.profiles pr ON pr.id = m.tecnico_id
    GROUP BY pr.full_name
  ) t;

  -- Participação histórica de marcas (12m) × projeção de serviços
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'marca', marca, 'participacao_pct', pct, 'media_mensal', media_mensal,
    'projecao_servicos', round(pct / 100 * v_proj_servicos)
  ) ORDER BY pct DESC), '[]'::jsonb)
  INTO v_marcas FROM (
    SELECT upper(coalesce(nullif(trim(p.marca_tv),''), 'Não informada')) AS marca,
      round(count(*)::numeric / nullif(sum(count(*)) OVER (),0) * 100, 2) AS pct,
      round(count(*)::numeric / greatest((SELECT count(distinct date_trunc('month', p2.data_execucao))
        FROM public.producao_tecnica p2 WHERE p2.status='validado'
        AND p2.data_execucao >= date_trunc('month', now())::date - interval '3 months'),1), 1) AS media_mensal
    FROM public.producao_tecnica p
    WHERE p.status = 'validado'
      AND p.data_execucao >= date_trunc('month', now())::date - interval '3 months'
    GROUP BY 1
  ) s;

  -- Média mensal por tipo de serviço (referência para estoque/peças)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tipo', tipo, 'media_mensal', media_mensal, 'total_3m', total
  ) ORDER BY media_mensal DESC), '[]'::jsonb)
  INTO v_servicos FROM (
    SELECT coalesce(t.nome,'Outros') AS tipo, count(*) AS total,
      round(count(*)::numeric / greatest((SELECT count(distinct date_trunc('month', p2.data_execucao))
        FROM public.producao_tecnica p2 WHERE p2.status='validado'
        AND p2.data_execucao >= date_trunc('month', now())::date - interval '3 months'),1), 1) AS media_mensal
    FROM public.producao_tecnica p
    LEFT JOIN public.tipos_servico_tecnico t ON t.id = p.tipo_servico_id
    WHERE p.status = 'validado'
      AND p.data_execucao >= date_trunc('month', now())::date - interval '3 months'
    GROUP BY 1
  ) s;

  -- Média mensal por modelo (somente amostra significativa: >= 3 ocorrências)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'modelo', modelo, 'marca', marca, 'media_mensal', media_mensal, 'total_3m', total
  ) ORDER BY media_mensal DESC), '[]'::jsonb)
  INTO v_modelos FROM (
    SELECT coalesce(nullif(trim(p.modelo_tv),''), 'Não informado') AS modelo,
      upper(coalesce(nullif(trim(p.marca_tv),''), '?')) AS marca, count(*) AS total,
      round(count(*)::numeric / greatest((SELECT count(distinct date_trunc('month', p2.data_execucao))
        FROM public.producao_tecnica p2 WHERE p2.status='validado'
        AND p2.data_execucao >= date_trunc('month', now())::date - interval '3 months'),1), 1) AS media_mensal
    FROM public.producao_tecnica p
    WHERE p.status = 'validado'
      AND p.data_execucao >= date_trunc('month', now())::date - interval '3 months'
    GROUP BY 1, 2
    HAVING count(*) >= 3
  ) s;

  -- Alertas de planejamento (interpretação estatística simples)
  IF v_media3 > 0 AND v_mes_atual_fat > 0 AND v_mes_atual_fat < v_media3 * 0.7 THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','faturamento_abaixo_media','texto',
      'Faturamento do mês corrente está abaixo de 70% da média dos últimos 3 meses.');
  END IF;
  IF v_cresc < -5 THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','tendencia_queda','texto',
      'Tendência de queda: crescimento médio de ' || v_cresc || '% nos últimos meses.');
  END IF;
  IF (SELECT count(*) FROM tmp_plan_mensal) < 3 THEN
    v_alertas := v_alertas || jsonb_build_object('tipo','amostra_pequena','texto',
      'Dados insuficientes para análise confiável: menos de 3 meses de histórico.');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'competencia', competencia, 'faturamento', faturamento, 'receita_liquida', receita_liquida,
    'os', os_faturadas, 'ticket_medio', ticket_medio, 'resultado', resultado
  ) ORDER BY competencia DESC), '[]'::jsonb)
  INTO v_snapshots FROM public.relatorios_snapshots;

  DROP TABLE IF EXISTS tmp_plan_mensal;

  RETURN jsonb_build_object(
    'ok', true,
    'medias', v_medias,
    'projecao', v_projecao,
    'tecnicos', v_tecnicos,
    'marcas', v_marcas,
    'servicos', v_servicos,
    'modelos', v_modelos,
    'alertas', v_alertas,
    'snapshots', v_snapshots
  );
END;
$$;
REVOKE ALL ON FUNCTION public.relatorios_planejamento() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relatorios_planejamento() TO authenticated;

-- ============ SNAPSHOT MENSAL (congela período fechado) ============
CREATE OR REPLACE FUNCTION public.relatorios_snapshot_gerar(p_competencia date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date := date_trunc('month', p_competencia)::date;
  v_fim date := (date_trunc('month', p_competencia) + interval '1 month - 1 day')::date;
  v_fat numeric; v_liq numeric; v_os int; v_ticket numeric;
  v_custos numeric; v_comis numeric; v_desp numeric; v_folha numeric;
  v_prod numeric; v_serv int;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador')
       OR public.has_permission(auth.uid(), 'relatorios_planejamento', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Sem permissão para gerar snapshot.');
  END IF;

  SELECT coalesce(round(sum(l.valor_final),2),0), coalesce(round(sum(l.receita_liquida),2),0),
    count(distinct l.os) FILTER (WHERE l.os IS NOT NULL),
    coalesce(round(sum(l.valor_final)/nullif(count(*),0),2),0)
    INTO v_fat, v_liq, v_os, v_ticket
  FROM public.caixa_lancamentos l
  WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN v_ini AND v_fim;

  SELECT coalesce(round(sum(c.custo_total - c.devolvido_total),2),0) INTO v_custos
  FROM public.custos_os c
  WHERE c.status IN ('registrado','confirmado') AND c.data_lancamento BETWEEN v_ini AND v_fim;

  SELECT coalesce(round(sum(cm.valor_final),2),0) INTO v_comis
  FROM public.comissoes cm
  WHERE cm.status <> 'cancelada' AND cm.data_referencia BETWEEN v_ini AND v_fim;

  SELECT coalesce(round(sum(d.valor),2),0) INTO v_desp
  FROM public.despesas d
  WHERE d.status <> 'cancelada' AND d.competencia = v_ini;

  SELECT coalesce(round(sum(CASE WHEN f.natureza='provento' THEN f.valor ELSE -f.valor END),2),0) INTO v_folha
  FROM public.folha_lancamentos f
  JOIN public.folha_competencias fc ON fc.id = f.competencia_id
  WHERE f.cancelado_em IS NULL AND fc.competencia = v_ini;

  SELECT coalesce(round(sum(p.valor_servico),2),0), count(*) INTO v_prod, v_serv
  FROM public.producao_tecnica p
  WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_ini AND v_fim;

  INSERT INTO public.relatorios_snapshots (
    competencia, faturamento, receita_liquida, os_faturadas, ticket_medio,
    custos, comissao, margem, despesas, folha, resultado,
    producao_validada, servicos_validados, gerado_por
  ) VALUES (
    v_ini, v_fat, v_liq, v_os, v_ticket,
    v_custos, v_comis, v_liq - v_custos - v_comis, v_desp, v_folha,
    v_liq - v_custos - v_comis - v_desp - v_folha,
    v_prod, v_serv, auth.uid()
  )
  ON CONFLICT (competencia) DO UPDATE SET
    faturamento = EXCLUDED.faturamento, receita_liquida = EXCLUDED.receita_liquida,
    os_faturadas = EXCLUDED.os_faturadas, ticket_medio = EXCLUDED.ticket_medio,
    custos = EXCLUDED.custos, comissao = EXCLUDED.comissao, margem = EXCLUDED.margem,
    despesas = EXCLUDED.despesas, folha = EXCLUDED.folha, resultado = EXCLUDED.resultado,
    producao_validada = EXCLUDED.producao_validada, servicos_validados = EXCLUDED.servicos_validados,
    gerado_por = EXCLUDED.gerado_por;

  PERFORM public.registrar_auditoria('relatorios', 'snapshot_gerado',
    null, jsonb_build_object('competencia', v_ini, 'faturamento', v_fat, 'resultado', v_liq - v_custos - v_comis - v_desp - v_folha));

  RETURN jsonb_build_object('ok', true, 'competencia', v_ini);
END;
$$;
REVOKE ALL ON FUNCTION public.relatorios_snapshot_gerar(date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.relatorios_snapshot_gerar(date) TO authenticated;
