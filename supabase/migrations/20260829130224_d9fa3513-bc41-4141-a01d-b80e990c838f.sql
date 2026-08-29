REVOKE ALL ON FUNCTION public.coletas_criar(text, text, text, text, integer, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coletas_criar(text, text, text, text, integer, uuid, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.coletas_criar(text, text, text, text, integer, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coletas_criar(text, text, text, text, integer, uuid, text, text, text, text) TO service_role;