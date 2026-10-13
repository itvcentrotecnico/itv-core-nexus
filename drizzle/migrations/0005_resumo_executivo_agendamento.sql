
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public._resumo_montar(timestamptz,timestamptz)'::regprocedure);
  d := replace(d, 'to_char(real,''FM999G999G990D00'')', 'translate(to_char(real,''FM999,999,990.00''),'',.'',''.,'')');
  d := replace(d, 'to_char(meta,''FM999G999G990D00'')', 'translate(to_char(meta,''FM999,999,990.00''),'',.'',''.,'')');
  d := replace(d, '% da meta (''||', '% da meta (R$ ''||');
  d := replace(d, '||'' de ''||', '||'' de R$ ''||');
  EXECUTE d;
END $do$;

CREATE OR REPLACE FUNCTION public.resumo_agendar() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cfg jsonb; v_dia int; v_hora int; h int; dd int;
BEGIN
  SELECT value INTO cfg FROM settings WHERE key='resumo_executivo';
  v_dia := coalesce((cfg->>'dia_semana')::int,6); v_hora := coalesce((cfg->>'hora')::int,13);
  h := v_hora + 4; dd := v_dia;  -- Manaus = UTC-4, sem horário de verão
  IF h >= 24 THEN h := h - 24; dd := (dd + 1) % 7; END IF;
  PERFORM cron.schedule('resumo-executivo-semanal', format('0 %s * * %s', h, dd), 'SELECT public.resumo_gerar_agendado()');
END $$;
REVOKE ALL ON FUNCTION public.resumo_agendar() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resumo_config_salvar(p_dia int, p_hora int, p_destinatarios uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','editar') THEN RAISE EXCEPTION 'Apenas a Gerência pode alterar.'; END IF;
  IF p_dia NOT BETWEEN 0 AND 6 OR p_hora NOT BETWEEN 0 AND 23 THEN RAISE EXCEPTION 'Dia ou horário inválido.'; END IF;
  UPDATE settings SET value = value || jsonb_build_object('dia_semana',p_dia,'hora',p_hora,'destinatarios',to_jsonb(coalesce(p_destinatarios,'{}'))), updated_at=now()
  WHERE key='resumo_executivo';
  PERFORM resumo_agendar();
END $$;

CREATE OR REPLACE FUNCTION public.resumo_agenda_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT has_permission(auth.uid(),'operacional','visualizar') THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN jsonb_build_object(
    'agendado', EXISTS (SELECT 1 FROM cron.job WHERE jobname='resumo-executivo-semanal' AND active),
    'cron', (SELECT schedule FROM cron.job WHERE jobname='resumo-executivo-semanal'),
    'ultima_execucao', (SELECT to_jsonb(e) FROM resumo_execucoes e WHERE origem='agendada' ORDER BY executado_em DESC LIMIT 1),
    'execucoes', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM resumo_execucoes ORDER BY executado_em DESC LIMIT 10) x),'[]'::jsonb));
END $$;
GRANT EXECUTE ON FUNCTION public.resumo_agenda_status() TO authenticated;

SELECT public.resumo_agendar();
