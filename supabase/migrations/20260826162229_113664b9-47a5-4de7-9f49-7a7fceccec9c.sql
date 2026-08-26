-- p_ref passa a ter valor padrão (mês atual em America/Manaus)
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'modo_tv_indicadores';

  v_def := replace(v_def, 'p_ref date)', 'p_ref date DEFAULT NULL)');
  v_def := replace(v_def, 'p_ref date DEFAULT NULL DEFAULT NULL)', 'p_ref date DEFAULT NULL)');
  EXECUTE v_def;
END $$;

REVOKE EXECUTE ON FUNCTION public.modo_tv_indicadores(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.modo_tv_indicadores(date) TO authenticated;