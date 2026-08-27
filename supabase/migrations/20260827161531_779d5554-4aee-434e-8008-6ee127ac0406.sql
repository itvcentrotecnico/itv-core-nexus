CREATE OR REPLACE FUNCTION public.coletas_relatorio_periodo(p_ini date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_ini timestamptz; v_fim timestamptz; v_por_dia jsonb; v_por_status jsonb; v_totais jsonb;
BEGIN
  IF NOT public.coletas_pode('relatorios') THEN RAISE EXCEPTION 'Sem permissão para relatórios de coletas.'; END IF;
  IF p_fim < p_ini THEN RAISE EXCEPTION 'Período inválido.'; END IF;
  IF p_fim - p_ini > 366 THEN RAISE EXCEPTION 'Período máximo de 366 dias.'; END IF;

  v_ini := (p_ini::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';
  v_fim := ((p_fim + 1)::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';

  WITH dias AS (
    SELECT generate_series(p_ini, p_fim, interval '1 day')::date AS dia
  ), mov AS (
    SELECT s.tipo, s.status,
           (s.created_at AT TIME ZONE 'America/Manaus')::date AS d_criada,
           (s.preenchido_em AT TIME ZONE 'America/Manaus')::date AS d_preenchida,
           (s.concluido_em AT TIME ZONE 'America/Manaus')::date AS d_concluida,
           (s.cancelado_em AT TIME ZONE 'America/Manaus')::date AS d_cancelada
      FROM public.coletas_solicitacoes s
     WHERE s.created_at < v_fim
       AND (s.created_at >= v_ini OR s.preenchido_em >= v_ini OR s.concluido_em >= v_ini OR s.cancelado_em >= v_ini)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.dia), '[]'::jsonb) INTO v_por_dia FROM (
    SELECT d.dia::text AS dia,
           count(m.*) FILTER (WHERE m.d_criada = d.dia) AS geradas,
           count(m.*) FILTER (WHERE m.d_preenchida = d.dia) AS preenchidas,
           count(m.*) FILTER (WHERE m.tipo = 'coleta' AND m.d_concluida = d.dia) AS coletas,
           count(m.*) FILTER (WHERE m.tipo = 'entrega' AND m.d_concluida = d.dia) AS entregas,
           count(m.*) FILTER (WHERE m.d_cancelada = d.dia) AS canceladas,
           count(m.*) FILTER (WHERE m.d_concluida = d.dia) AS concluidas
      FROM dias d
      LEFT JOIN mov m ON d.dia IN (m.d_criada, m.d_preenchida, m.d_concluida, m.d_cancelada)
     GROUP BY d.dia
  ) z;

  SELECT coalesce(jsonb_agg(to_jsonb(w) ORDER BY w.total DESC), '[]'::jsonb) INTO v_por_status FROM (
    SELECT s.status::text AS status, count(*) AS total,
           count(*) FILTER (WHERE s.tipo = 'coleta') AS coletas,
           count(*) FILTER (WHERE s.tipo = 'entrega') AS entregas
      FROM public.coletas_solicitacoes s
     WHERE s.created_at >= v_ini AND s.created_at < v_fim
     GROUP BY s.status
  ) w;

  SELECT jsonb_build_object(
    'geradas', count(*) FILTER (WHERE s.created_at >= v_ini AND s.created_at < v_fim),
    'preenchidas', count(*) FILTER (WHERE s.preenchido_em >= v_ini AND s.preenchido_em < v_fim),
    'coletas', count(*) FILTER (WHERE s.tipo = 'coleta' AND s.concluido_em >= v_ini AND s.concluido_em < v_fim),
    'entregas', count(*) FILTER (WHERE s.tipo = 'entrega' AND s.concluido_em >= v_ini AND s.concluido_em < v_fim),
    'canceladas', count(*) FILTER (WHERE s.cancelado_em >= v_ini AND s.cancelado_em < v_fim),
    'concluidas', count(*) FILTER (WHERE s.concluido_em >= v_ini AND s.concluido_em < v_fim)
  ) INTO v_totais FROM public.coletas_solicitacoes s;

  RETURN jsonb_build_object('inicio', p_ini, 'fim', p_fim, 'totais', v_totais,
                            'por_dia', v_por_dia, 'por_status', v_por_status);
END $function$;

REVOKE ALL ON FUNCTION public.coletas_relatorio_periodo(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_relatorio_periodo(date, date) TO authenticated;