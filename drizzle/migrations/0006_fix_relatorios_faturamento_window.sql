CREATE OR REPLACE FUNCTION public.relatorios_faturamento(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    WHERE l.status = 'ativo' and l.liquida_conta_receber_id is null AND l.data_lancamento BETWEEN p_from AND p_to
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
    WHERE l.status = 'ativo' and l.liquida_conta_receber_id is null AND l.data_lancamento BETWEEN v_ant_from AND v_ant_to
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
    WHERE l.status = 'ativo' and l.liquida_conta_receber_id is null AND l.data_lancamento BETWEEN p_from AND p_to
    GROUP BY l.data_lancamento
  ) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'semana_inicio', sem, 'faturamento', fat, 'os', os_qtd, 'ticket_medio', ticket,
    'variacao_pct', CASE WHEN fat_ant > 0 THEN round((fat - fat_ant) / fat_ant * 100, 2) END
  ) ORDER BY sem), '[]'::jsonb)
  INTO v_por_semana
  FROM (SELECT x.*, lag(x.fat) OVER (ORDER BY x.sem) AS fat_ant FROM (
    SELECT date_trunc('week', l.data_lancamento)::date AS sem, round(sum(l.valor_final),2) AS fat,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd,
      coalesce(round(sum(l.valor_final) / nullif(count(*),0),2),0) AS ticket
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' and l.liquida_conta_receber_id is null AND l.data_lancamento BETWEEN p_from AND p_to
    GROUP BY 1
  ) x) s;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'mes', mes, 'faturamento', fat, 'receita_liquida', liq, 'os', os_qtd, 'ticket_medio', ticket,
    'variacao_pct', CASE WHEN fat_ant > 0 THEN round((fat - fat_ant) / fat_ant * 100, 2) END
  ) ORDER BY mes), '[]'::jsonb)
  INTO v_por_mes
  FROM (SELECT x.*, lag(x.fat) OVER (ORDER BY x.mes) AS fat_ant FROM (
    SELECT date_trunc('month', l.data_lancamento)::date AS mes, round(sum(l.valor_final),2) AS fat,
      round(sum(l.receita_liquida),2) AS liq,
      count(distinct l.os) FILTER (WHERE l.os IS NOT NULL) AS os_qtd,
      coalesce(round(sum(l.valor_final) / nullif(count(*),0),2),0) AS ticket
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' and l.liquida_conta_receber_id is null
      AND l.data_lancamento >= date_trunc('month', p_to)::date - interval '11 months'
      AND l.data_lancamento <= p_to
    GROUP BY 1
  ) x) s;

  WITH mensal AS (
    SELECT date_trunc('month', l.data_lancamento)::date AS mes, sum(l.valor_final) AS fat
    FROM public.caixa_lancamentos l
    WHERE l.status = 'ativo' and l.liquida_conta_receber_id is null
      AND l.data_lancamento >= date_trunc('month', p_to)::date - interval '11 months'
      AND l.data_lancamento <= p_to
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'm3', coalesce(round((SELECT avg(fat) FROM (SELECT fat FROM mensal ORDER BY mes DESC LIMIT 3) t),2),0),
    'm6', coalesce(round((SELECT avg(fat) FROM (SELECT fat FROM mensal ORDER BY mes DESC LIMIT 6) t),2),0),
    'm12', coalesce(round((SELECT avg(fat) FROM mensal),2),0)
  ) INTO v_medias;

  RETURN jsonb_build_object('ok', true, 'resumo', v_resumo, 'anterior', v_anterior,
    'por_dia', v_por_dia, 'por_semana', v_por_semana, 'por_mes', v_por_mes, 'medias', v_medias);
END;
$function$;