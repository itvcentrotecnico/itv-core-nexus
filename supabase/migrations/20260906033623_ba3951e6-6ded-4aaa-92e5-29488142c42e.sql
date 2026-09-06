CREATE TABLE public.eventos_seguranca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  email text,
  user_id uuid,
  modulo text,
  rota text,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.eventos_seguranca TO authenticated;
GRANT ALL ON public.eventos_seguranca TO service_role;

ALTER TABLE public.eventos_seguranca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Administradores leem eventos de seguranca"
  ON public.eventos_seguranca FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

CREATE INDEX idx_eventos_seguranca_created_at ON public.eventos_seguranca (created_at DESC);
CREATE INDEX idx_eventos_seguranca_tipo ON public.eventos_seguranca (tipo, created_at DESC);

CREATE OR REPLACE FUNCTION public.seguranca_registrar_evento(
  p_tipo text,
  p_email text DEFAULT NULL,
  p_modulo text DEFAULT NULL,
  p_rota text DEFAULT NULL,
  p_detalhes jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
BEGIN
  IF v_tipo NOT IN ('login_falho', 'acesso_negado', 'conta_bloqueada', 'sem_perfil', 'reset_senha_solicitado') THEN
    RETURN;
  END IF;

  -- Freio anti-flood: no maximo 60 eventos do mesmo tipo por minuto por origem.
  IF (
    SELECT count(*) FROM public.eventos_seguranca e
    WHERE e.tipo = v_tipo
      AND e.created_at > now() - interval '1 minute'
      AND coalesce(e.email, '') = coalesce(left(trim(p_email), 200), '')
      AND e.user_id IS NOT DISTINCT FROM auth.uid()
  ) >= 60 THEN
    RETURN;
  END IF;

  INSERT INTO public.eventos_seguranca (tipo, email, user_id, modulo, rota, detalhes)
  VALUES (
    v_tipo,
    left(trim(p_email), 200),
    auth.uid(),
    left(trim(p_modulo), 100),
    left(trim(p_rota), 300),
    coalesce(p_detalhes, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seguranca_registrar_evento(text, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.seguranca_registrar_evento(text, text, text, text, jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.seguranca_eventos_listar(
  p_tipo text DEFAULT NULL,
  p_dias integer DEFAULT 7,
  p_limite integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  tipo text,
  email text,
  user_id uuid,
  modulo text,
  rota text,
  detalhes jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT e.id, e.tipo, e.email, e.user_id, e.modulo, e.rota, e.detalhes, e.created_at
  FROM public.eventos_seguranca e
  WHERE (p_tipo IS NULL OR e.tipo = p_tipo)
    AND e.created_at > now() - make_interval(days => greatest(coalesce(p_dias, 7), 1))
  ORDER BY e.created_at DESC
  LIMIT least(greatest(coalesce(p_limite, 200), 1), 1000);
END;
$$;

REVOKE ALL ON FUNCTION public.seguranca_eventos_listar(text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.seguranca_eventos_listar(text, integer, integer) TO authenticated;