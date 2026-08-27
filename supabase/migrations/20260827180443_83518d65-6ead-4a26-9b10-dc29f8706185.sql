-- ============ 1. Colunas novas em coletas_solicitacoes ============
ALTER TABLE public.coletas_solicitacoes
  ADD COLUMN IF NOT EXISTS coleta_origem_id uuid REFERENCES public.coletas_solicitacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS precisao numeric(8,2),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS idx_coletas_origem ON public.coletas_solicitacoes(coleta_origem_id);
CREATE INDEX IF NOT EXISTS idx_coletas_deleted ON public.coletas_solicitacoes(deleted_at);

-- Registros excluídos deixam de aparecer nas consultas normais
DROP POLICY IF EXISTS coletas_select_gestao ON public.coletas_solicitacoes;
CREATE POLICY coletas_select_gestao ON public.coletas_solicitacoes FOR SELECT TO authenticated
USING (
  public.coletas_pode('visualizar_todos')
  AND (deleted_at IS NULL OR public.has_role(auth.uid(), 'administrador'))
);

DROP POLICY IF EXISTS coletas_select_motorista ON public.coletas_solicitacoes;
CREATE POLICY coletas_select_motorista ON public.coletas_solicitacoes FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.coletas_pode('assumir')
  AND (motorista_id = auth.uid() OR (status = 'pronto_coleta' AND motorista_id IS NULL))
);

-- ============ 2. Módulos e permissões ============
INSERT INTO public.modules (key, label, sort_order) VALUES
  ('entregas', 'Entregas', 56),
  ('motoristas', 'Equipe Externa', 57)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action) VALUES
  ('adm_operacional','coletas','excluir'),
  ('adm_operacional','coletas','excluir_concluida'),
  ('adm_operacional','entregas','visualizar'),
  ('adm_operacional','entregas','criar'),
  ('adm_operacional','entregas','editar'),
  ('adm_operacional','entregas','excluir'),
  ('adm_operacional','entregas','excluir_concluida'),
  ('adm_operacional','motoristas','localizacao_visualizar'),
  ('adm_operacional','motoristas','localizacao_historico'),
  ('vendedor','coletas','excluir'),
  ('vendedor','entregas','visualizar'),
  ('vendedor','entregas','criar'),
  ('vendedor','entregas','editar'),
  ('vendedor','entregas','excluir'),
  ('motorista','entregas','visualizar'),
  ('motorista','motoristas','localizacao_ativar'),
  ('adm_financeiro','entregas','visualizar')
ON CONFLICT (role, module_key, action) DO NOTHING;

-- ============ 3. Expedientes e localizações ============
CREATE TABLE IF NOT EXISTS public.motorista_expedientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL DEFAULT now(),
  fim timestamptz,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.motorista_expedientes TO authenticated;
GRANT ALL ON public.motorista_expedientes TO service_role;
ALTER TABLE public.motorista_expedientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY expedientes_select_proprio ON public.motorista_expedientes FOR SELECT TO authenticated
USING (motorista_id = auth.uid() OR public.has_permission(auth.uid(),'motoristas','localizacao_visualizar'));

CREATE INDEX IF NOT EXISTS idx_expediente_motorista ON public.motorista_expedientes(motorista_id, status);

CREATE TABLE IF NOT EXISTS public.motorista_localizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  expediente_id uuid NOT NULL REFERENCES public.motorista_expedientes(id) ON DELETE CASCADE,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  precisao numeric(8,2),
  bairro text,
  registrado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.motorista_localizacoes TO authenticated;
GRANT ALL ON public.motorista_localizacoes TO service_role;
ALTER TABLE public.motorista_localizacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY localizacoes_select ON public.motorista_localizacoes FOR SELECT TO authenticated
USING (motorista_id = auth.uid() OR public.has_permission(auth.uid(),'motoristas','localizacao_visualizar'));

CREATE INDEX IF NOT EXISTS idx_localizacoes_motorista ON public.motorista_localizacoes(motorista_id, registrado_em DESC);

CREATE TRIGGER trg_expedientes_updated_at BEFORE UPDATE ON public.motorista_expedientes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4. Exclusão lógica e restauração ============
CREATE OR REPLACE FUNCTION public.coletas_excluir(p_id uuid, p_motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec public.coletas_solicitacoes; v_modulo text; v_vinculada int;
BEGIN
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Informe o motivo da exclusão.'; END IF;
  SELECT * INTO v_rec FROM public.coletas_solicitacoes WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;

  v_modulo := CASE WHEN v_rec.tipo = 'entrega' THEN 'entregas' ELSE 'coletas' END;
  IF NOT public.has_permission(auth.uid(), v_modulo, 'excluir') THEN
    RAISE EXCEPTION 'Sem permissão para excluir este registro.';
  END IF;
  IF v_rec.status = 'concluida' AND NOT public.has_permission(auth.uid(), v_modulo, 'excluir_concluida') THEN
    RAISE EXCEPTION 'Somente a administração pode excluir registros concluídos.';
  END IF;

  SELECT count(*) INTO v_vinculada FROM public.coletas_solicitacoes
   WHERE coleta_origem_id = p_id AND deleted_at IS NULL;

  UPDATE public.coletas_solicitacoes
     SET deleted_at = now(), deleted_by = auth.uid(), delete_reason = trim(p_motivo)
   WHERE id = p_id;

  PERFORM public.registrar_auditoria('coletas','excluida', NULL,
    jsonb_build_object('id', p_id, 'tipo', v_rec.tipo, 'status', v_rec.status,
                       'motivo', trim(p_motivo), 'vinculadas', v_vinculada));
END $$;
REVOKE ALL ON FUNCTION public.coletas_excluir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_excluir(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coletas_restaurar(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'Somente o administrador pode restaurar registros.';
  END IF;
  UPDATE public.coletas_solicitacoes
     SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
   WHERE id = p_id AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado na lixeira.'; END IF;
  PERFORM public.registrar_auditoria('coletas','restaurada', NULL, jsonb_build_object('id', p_id));
END $$;
REVOKE ALL ON FUNCTION public.coletas_restaurar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_restaurar(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.coletas_lixeira()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrador') THEN
    RAISE EXCEPTION 'Sem permissão para consultar a lixeira.';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.deleted_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT s.id, s.tipo, s.cliente_nome, s.bairro, s.status, s.deleted_at, s.delete_reason,
           p.full_name AS excluido_por
      FROM public.coletas_solicitacoes s
      LEFT JOIN public.profiles p ON p.id = s.deleted_by
     WHERE s.deleted_at IS NOT NULL
     ORDER BY s.deleted_at DESC LIMIT 200
  ) x;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.coletas_lixeira() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_lixeira() TO authenticated;

-- ============ 5. Entrega a partir da coleta ============
CREATE OR REPLACE FUNCTION public.coletas_criar_entrega(p_coleta_id uuid, p_dados jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.coletas_solicitacoes; v_id uuid; v_novo boolean;
BEGIN
  IF NOT public.has_permission(auth.uid(),'entregas','criar') THEN
    RAISE EXCEPTION 'Sem permissão para criar entregas.';
  END IF;
  SELECT * INTO c FROM public.coletas_solicitacoes WHERE id = p_coleta_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coleta de origem não encontrada.'; END IF;

  v_novo := coalesce((p_dados->>'endereco_proprio')::boolean, false);

  INSERT INTO public.coletas_solicitacoes (
    tipo, coleta_origem_id, cliente_nome, cpf, whatsapp, telefone_alternativo,
    cep, rua, numero, complemento, condominio, torre_bloco, apartamento, bairro, cidade, referencia,
    latitude, longitude, maps_url, marca_tv, polegadas, observacao,
    status, preenchido_em, created_by
  ) VALUES (
    'entrega', c.id, c.cliente_nome, c.cpf, c.whatsapp, c.telefone_alternativo,
    CASE WHEN v_novo THEN nullif(p_dados->>'cep','') ELSE c.cep END,
    CASE WHEN v_novo THEN nullif(p_dados->>'rua','') ELSE c.rua END,
    CASE WHEN v_novo THEN nullif(p_dados->>'numero','') ELSE c.numero END,
    CASE WHEN v_novo THEN nullif(p_dados->>'complemento','') ELSE c.complemento END,
    CASE WHEN v_novo THEN nullif(p_dados->>'condominio','') ELSE c.condominio END,
    CASE WHEN v_novo THEN nullif(p_dados->>'torre_bloco','') ELSE c.torre_bloco END,
    CASE WHEN v_novo THEN nullif(p_dados->>'apartamento','') ELSE c.apartamento END,
    CASE WHEN v_novo THEN nullif(p_dados->>'bairro','') ELSE c.bairro END,
    CASE WHEN v_novo THEN coalesce(nullif(p_dados->>'cidade',''),'Manaus') ELSE c.cidade END,
    CASE WHEN v_novo THEN nullif(p_dados->>'referencia','') ELSE c.referencia END,
    CASE WHEN v_novo THEN NULL ELSE c.latitude END,
    CASE WHEN v_novo THEN NULL ELSE c.longitude END,
    CASE WHEN v_novo THEN nullif(p_dados->>'maps_url','') ELSE c.maps_url END,
    c.marca_tv, c.polegadas,
    nullif(trim(coalesce(p_dados->>'observacao','')),''),
    'pronto_coleta', now(), auth.uid()
  ) RETURNING id INTO v_id;

  PERFORM public.registrar_auditoria('coletas','entrega_criada', NULL,
    jsonb_build_object('id', v_id, 'coleta_origem_id', c.id, 'endereco_proprio', v_novo));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.coletas_criar_entrega(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_criar_entrega(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.coletas_buscar_cliente(p_termo text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; t text;
BEGIN
  IF NOT public.has_permission(auth.uid(),'entregas','criar')
     AND NOT public.coletas_pode('criar') THEN
    RAISE EXCEPTION 'Sem permissão para consultar clientes.';
  END IF;
  t := trim(coalesce(p_termo,''));
  IF length(t) < 3 THEN RETURN '[]'::jsonb; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT s.id, s.tipo, s.cliente_nome, s.whatsapp, s.bairro, s.rua, s.numero, s.cidade,
           s.marca_tv, s.polegadas, s.status, s.created_at, s.concluido_em
      FROM public.coletas_solicitacoes s
     WHERE s.deleted_at IS NULL
       AND (s.cliente_nome ILIKE '%'||t||'%'
            OR s.whatsapp LIKE '%'||regexp_replace(t,'\D','','g')||'%')
     ORDER BY s.created_at DESC LIMIT 20
  ) x;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.coletas_buscar_cliente(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_buscar_cliente(text) TO authenticated;

-- ============ 6. Modo Expediente ============
CREATE OR REPLACE FUNCTION public.expediente_janela_valida()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (now() AT TIME ZONE 'America/Manaus')::time >= '08:00'::time
     AND (now() AT TIME ZONE 'America/Manaus')::time < '18:00'::time
$$;

CREATE OR REPLACE FUNCTION public.expediente_iniciar()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(),'motoristas','localizacao_ativar') THEN
    RAISE EXCEPTION 'Sem permissão para iniciar expediente.';
  END IF;
  IF NOT public.expediente_janela_valida() THEN
    RAISE EXCEPTION 'O expediente só pode ser iniciado entre 08:00 e 18:00.';
  END IF;
  SELECT id INTO v_id FROM public.motorista_expedientes
   WHERE motorista_id = auth.uid() AND status = 'ativo' ORDER BY inicio DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.motorista_expedientes (motorista_id) VALUES (auth.uid()) RETURNING id INTO v_id;
    PERFORM public.registrar_auditoria('motoristas','expediente_iniciado', NULL, jsonb_build_object('id', v_id));
  END IF;
  RETURN jsonb_build_object('id', v_id, 'status','ativo');
END $$;
REVOKE ALL ON FUNCTION public.expediente_iniciar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expediente_iniciar() TO authenticated;

CREATE OR REPLACE FUNCTION public.expediente_encerrar()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.motorista_expedientes
     SET status = 'encerrado', fim = now()
   WHERE motorista_id = auth.uid() AND status = 'ativo';
  PERFORM public.registrar_auditoria('motoristas','expediente_encerrado', NULL, jsonb_build_object('motorista_id', auth.uid()));
END $$;
REVOKE ALL ON FUNCTION public.expediente_encerrar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expediente_encerrar() TO authenticated;

CREATE OR REPLACE FUNCTION public.expediente_atual()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v record;
BEGIN
  SELECT e.id, e.inicio, e.status,
         (SELECT max(l.registrado_em) FROM public.motorista_localizacoes l WHERE l.expediente_id = e.id) AS ultima
    INTO v
    FROM public.motorista_expedientes e
   WHERE e.motorista_id = auth.uid() AND e.status = 'ativo'
   ORDER BY e.inicio DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ativo', false, 'janela', public.expediente_janela_valida());
  END IF;
  RETURN jsonb_build_object('ativo', true, 'id', v.id, 'inicio', v.inicio,
                            'ultima_atualizacao', v.ultima, 'janela', public.expediente_janela_valida());
END $$;
REVOKE ALL ON FUNCTION public.expediente_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expediente_atual() TO authenticated;

CREATE OR REPLACE FUNCTION public.localizacao_registrar(
  p_lat numeric, p_lng numeric, p_precisao numeric DEFAULT NULL, p_bairro text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_exp uuid;
BEGIN
  IF NOT public.has_permission(auth.uid(),'motoristas','localizacao_ativar') THEN
    RAISE EXCEPTION 'Sem permissão para registrar localização.';
  END IF;
  IF NOT public.expediente_janela_valida() THEN
    UPDATE public.motorista_expedientes SET status='encerrado', fim = now()
     WHERE motorista_id = auth.uid() AND status='ativo';
    RETURN jsonb_build_object('ok', false, 'motivo', 'fora_janela');
  END IF;
  SELECT id INTO v_exp FROM public.motorista_expedientes
   WHERE motorista_id = auth.uid() AND status = 'ativo' ORDER BY inicio DESC LIMIT 1;
  IF v_exp IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sem_expediente'); END IF;

  INSERT INTO public.motorista_localizacoes (motorista_id, expediente_id, latitude, longitude, precisao, bairro)
  VALUES (auth.uid(), v_exp, p_lat, p_lng, p_precisao, nullif(trim(coalesce(p_bairro,'')),''));
  RETURN jsonb_build_object('ok', true, 'registrado_em', now());
END $$;
REVOKE ALL ON FUNCTION public.localizacao_registrar(numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.localizacao_registrar(numeric, numeric, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.equipe_externa_painel()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(),'motoristas','localizacao_visualizar') THEN
    RAISE EXCEPTION 'Sem permissão para acompanhar a equipe externa.';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.motorista), '[]'::jsonb) INTO v FROM (
    SELECT p.id AS motorista_id, p.full_name AS motorista,
           e.id AS expediente_id, e.inicio, e.status AS expediente_status,
           l.latitude, l.longitude, l.precisao, l.bairro, l.registrado_em,
           (SELECT count(*) FROM public.coletas_solicitacoes s
             WHERE s.motorista_id = p.id AND s.tipo='coleta' AND s.deleted_at IS NULL
               AND s.status IN ('assumida','pronto_coleta')) AS coletas_atribuidas,
           (SELECT count(*) FROM public.coletas_solicitacoes s
             WHERE s.motorista_id = p.id AND s.tipo='entrega' AND s.deleted_at IS NULL
               AND s.status IN ('assumida','pronto_coleta')) AS entregas_atribuidas
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role IN ('motorista','adm_operacional')
      LEFT JOIN LATERAL (
        SELECT * FROM public.motorista_expedientes e2
         WHERE e2.motorista_id = p.id ORDER BY e2.inicio DESC LIMIT 1) e ON true
      LEFT JOIN LATERAL (
        SELECT * FROM public.motorista_localizacoes l2
         WHERE l2.motorista_id = p.id ORDER BY l2.registrado_em DESC LIMIT 1) l ON true
     WHERE p.active AND p.status = 'ativo'
  ) x;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.equipe_externa_painel() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_externa_painel() TO authenticated;

CREATE OR REPLACE FUNCTION public.equipe_externa_tv()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_equipe jsonb; v_ind jsonb; v_ini timestamptz;
BEGIN
  v_ini := date_trunc('day', now() AT TIME ZONE 'America/Manaus') AT TIME ZONE 'America/Manaus';
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.motorista), '[]'::jsonb) INTO v_equipe FROM (
    SELECT split_part(p.full_name,' ',1) AS motorista,
           CASE WHEN e.status = 'ativo' THEN 'Em rota' ELSE 'Fora de expediente' END AS situacao,
           l.bairro AS regiao
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'motorista'
      LEFT JOIN LATERAL (SELECT * FROM public.motorista_expedientes e2
         WHERE e2.motorista_id = p.id ORDER BY e2.inicio DESC LIMIT 1) e ON true
      LEFT JOIN LATERAL (SELECT bairro FROM public.motorista_localizacoes l2
         WHERE l2.motorista_id = p.id ORDER BY l2.registrado_em DESC LIMIT 1) l ON true
     WHERE p.active AND p.status = 'ativo'
  ) x;

  SELECT jsonb_build_object(
    'motoristas_operacao', (SELECT count(*) FROM public.motorista_expedientes WHERE status='ativo'),
    'coletas_pendentes', count(*) FILTER (WHERE tipo='coleta' AND status IN ('pronto_coleta','aguardando_cadastro')),
    'entregas_pendentes', count(*) FILTER (WHERE tipo='entrega' AND status = 'pronto_coleta'),
    'em_execucao', count(*) FILTER (WHERE status='assumida'),
    'concluidas_hoje', count(*) FILTER (WHERE concluido_em >= v_ini)
  ) INTO v_ind FROM public.coletas_solicitacoes WHERE deleted_at IS NULL;

  RETURN jsonb_build_object('equipe', v_equipe, 'indicadores', v_ind);
END $$;
REVOKE ALL ON FUNCTION public.equipe_externa_tv() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.equipe_externa_tv() TO authenticated;

CREATE OR REPLACE FUNCTION public.localizacoes_expurgar(p_dias int DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF NOT public.has_role(auth.uid(),'administrador') THEN
    RAISE EXCEPTION 'Sem permissão para expurgar localizações.';
  END IF;
  DELETE FROM public.motorista_localizacoes
   WHERE registrado_em < now() - make_interval(days => greatest(p_dias, 1));
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM public.registrar_auditoria('motoristas','localizacoes_expurgadas', NULL, jsonb_build_object('removidas', n, 'dias', p_dias));
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.localizacoes_expurgar(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.localizacoes_expurgar(int) TO authenticated;