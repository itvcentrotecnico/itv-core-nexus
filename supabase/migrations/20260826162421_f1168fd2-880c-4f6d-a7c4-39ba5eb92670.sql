DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'modo_tv_indicadores';

  v_def := replace(
    v_def,
    'GROUP BY pr.full_name ORDER BY 2 DESC LIMIT 1',
    'GROUP BY pr.full_name ORDER BY coalesce(sum(p.valor_servico), 0) DESC, count(*) DESC LIMIT 1'
  );
  EXECUTE v_def;
END $$;

REVOKE EXECUTE ON FUNCTION public.modo_tv_indicadores(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.modo_tv_indicadores(date) TO authenticated;