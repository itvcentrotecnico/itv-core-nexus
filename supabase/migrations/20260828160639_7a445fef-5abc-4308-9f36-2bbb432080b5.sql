CREATE OR REPLACE FUNCTION public.norm_nome_cliente(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(lower(trim(regexp_replace(coalesce(_v,''), '\s+', ' ', 'g'))), '')
$$;