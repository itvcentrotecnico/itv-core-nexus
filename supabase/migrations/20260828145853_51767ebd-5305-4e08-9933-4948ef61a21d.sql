ALTER TABLE public.coletas_solicitacoes
  DROP CONSTRAINT IF EXISTS coletas_solicitacoes_status_check;
ALTER TABLE public.coletas_solicitacoes
  ADD CONSTRAINT coletas_solicitacoes_status_check CHECK (status = ANY (ARRAY[
    'aguardando_cadastro','pronto_coleta','assumida','em_rota','no_local',
    'concluida','nao_realizada','cancelada']));

ALTER TABLE public.coletas_solicitacoes
  ADD COLUMN IF NOT EXISTS data_agendada date,
  ADD COLUMN IF NOT EXISTS nao_realizada_motivo text,
  ADD COLUMN IF NOT EXISTS nao_realizada_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_coletas_agenda
  ON public.coletas_solicitacoes (data_agendada, motorista_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.coletas_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.coletas_solicitacoes(id) ON DELETE CASCADE,
  status text NOT NULL,
  motivo text,
  autor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coletas_historico TO authenticated;
GRANT ALL ON public.coletas_historico TO service_role;
ALTER TABLE public.coletas_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "historico visivel para coletas" ON public.coletas_historico;
CREATE POLICY "historico visivel para coletas" ON public.coletas_historico
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'coletas', 'visualizar'));
CREATE INDEX IF NOT EXISTS idx_coletas_historico_sol
  ON public.coletas_historico (solicitacao_id, created_at DESC);

-- Agendar / reagendar (vendedor decide)
CREATE OR REPLACE FUNCTION public.coletas_agendar(
  p_id uuid, p_motorista uuid DEFAULT NULL, p_data date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.coletas_pode('atribuir') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para agendar movimentações.');
  END IF;
  UPDATE public.coletas_solicitacoes SET
    motorista_id = p_motorista,
    atribuido_em = CASE WHEN p_motorista IS NULL THEN NULL ELSE now() END,
    data_agendada = COALESCE(p_data, data_agendada),
    updated_at = now()
  WHERE id = p_id AND deleted_at IS NULL
    AND status IN ('aguardando_cadastro','pronto_coleta','assumida','em_rota','no_local','nao_realizada');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Movimentação não encontrada ou já encerrada.');
  END IF;
  INSERT INTO public.coletas_historico (solicitacao_id, status, motivo, autor_id)
  VALUES (p_id, 'agendada', NULL, auth.uid());
  PERFORM public.registrar_auditoria('coletas', 'agendada', NULL,
    jsonb_build_object('id', p_id, 'motorista_id', p_motorista, 'data', p_data));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Avanço de status pelo motorista (ou gestão)
CREATE OR REPLACE FUNCTION public.coletas_status(
  p_id uuid, p_status text, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.coletas_solicitacoes%rowtype; v_gestor boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sua sessão expirou. Entre novamente.');
  END IF;
  IF p_status NOT IN ('em_rota','no_local','nao_realizada') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Situação inválida para esta ação.');
  END IF;
  SELECT * INTO v_row FROM public.coletas_solicitacoes WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Movimentação não encontrada.');
  END IF;
  v_gestor := public.coletas_pode('atribuir');
  IF NOT (v_gestor OR (v_row.motorista_id = v_uid AND public.coletas_pode('assumir'))) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Esta movimentação não está atribuída a você.');
  END IF;
  IF v_row.status IN ('concluida','cancelada') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Esta movimentação já foi encerrada.');
  END IF;
  IF p_status = 'nao_realizada' AND coalesce(btrim(p_motivo), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo de não realização.');
  END IF;

  UPDATE public.coletas_solicitacoes SET
    status = p_status,
    motorista_id = COALESCE(motorista_id, v_uid),
    assumido_em = COALESCE(assumido_em, now()),
    nao_realizada_motivo = CASE WHEN p_status = 'nao_realizada' THEN btrim(p_motivo) ELSE nao_realizada_motivo END,
    nao_realizada_em = CASE WHEN p_status = 'nao_realizada' THEN now() ELSE nao_realizada_em END,
    updated_at = now()
  WHERE id = p_id;

  INSERT INTO public.coletas_historico (solicitacao_id, status, motivo, autor_id)
  VALUES (p_id, p_status, nullif(btrim(coalesce(p_motivo,'')), ''), v_uid);
  PERFORM public.registrar_auditoria('coletas', p_status, NULL, jsonb_build_object('id', p_id));
  RETURN jsonb_build_object('ok', true, 'status', p_status);
END $$;

-- Agenda do dia com sugestão de ordem por bairro
CREATE OR REPLACE FUNCTION public.coletas_agenda(
  p_data date DEFAULT NULL, p_motorista uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_data date; v_gestor boolean; v_alvo uuid; v_itens jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.coletas_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para ver a agenda.');
  END IF;
  v_data := COALESCE(p_data, (now() AT TIME ZONE 'America/Manaus')::date);
  v_gestor := public.coletas_pode('atribuir');
  v_alvo := CASE WHEN v_gestor THEN p_motorista ELSE v_uid END;

  SELECT coalesce(jsonb_agg(x ORDER BY x.ordem_bairro, x.bairro NULLS LAST, x.created_at), '[]'::jsonb)
  INTO v_itens
  FROM (
    SELECT s.id, s.tipo, s.status, s.cliente_nome, s.whatsapp, s.bairro, s.rua, s.numero,
           s.complemento, s.condominio, s.torre_bloco, s.apartamento, s.referencia,
           s.cidade, s.cep, s.latitude, s.longitude, s.maps_url, s.marca_tv, s.polegadas,
           s.observacao, s.data_agendada, s.motorista_id, s.created_at,
           p.full_name AS motorista,
           count(*) OVER (PARTITION BY s.bairro) AS qtd_bairro,
           dense_rank() OVER (ORDER BY count(*) OVER (PARTITION BY s.bairro) DESC, s.bairro) AS ordem_bairro
      FROM public.coletas_solicitacoes s
      LEFT JOIN public.profiles p ON p.id = s.motorista_id
     WHERE s.deleted_at IS NULL
       AND s.status IN ('pronto_coleta','assumida','em_rota','no_local','nao_realizada')
       AND (s.data_agendada = v_data OR (s.data_agendada IS NULL AND v_data = (now() AT TIME ZONE 'America/Manaus')::date))
       AND (v_alvo IS NULL OR s.motorista_id = v_alvo)
  ) x;

  RETURN jsonb_build_object('ok', true, 'data', v_data, 'itens', v_itens);
END $$;

CREATE OR REPLACE FUNCTION public.coletas_historico_listar(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_itens jsonb;
BEGIN
  IF NOT public.coletas_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sem permissão.');
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', h.id, 'status', h.status, 'motivo', h.motivo,
    'autor', p.full_name, 'created_at', h.created_at) ORDER BY h.created_at DESC), '[]'::jsonb)
  INTO v_itens
  FROM public.coletas_historico h
  LEFT JOIN public.profiles p ON p.id = h.autor_id
  WHERE h.solicitacao_id = p_id;
  RETURN jsonb_build_object('ok', true, 'itens', v_itens);
END $$;

REVOKE ALL ON FUNCTION public.coletas_agendar(uuid, uuid, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.coletas_status(uuid, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.coletas_agenda(date, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.coletas_historico_listar(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.coletas_agendar(uuid, uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coletas_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coletas_agenda(date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coletas_historico_listar(uuid) TO authenticated;