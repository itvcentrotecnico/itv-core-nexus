-- =========================================================
-- MÓDULO COLETAS — tabelas
-- =========================================================
CREATE TABLE public.coletas_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('coleta','entrega')),
  cliente_nome text NOT NULL,
  cpf text,
  whatsapp text NOT NULL,
  telefone_alternativo text,
  cep text,
  rua text,
  numero text,
  complemento text,
  condominio text,
  torre_bloco text,
  apartamento text,
  bairro text,
  cidade text,
  referencia text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  maps_url text,
  marca_tv text,
  polegadas integer,
  observacao text,
  observacao_conclusao text,
  status text NOT NULL DEFAULT 'aguardando_cadastro'
    CHECK (status IN ('aguardando_cadastro','pronto_coleta','assumida','concluida','cancelada')),
  motorista_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  concluido_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo_cancelamento text,
  link_gerado_em timestamptz,
  link_expira_em timestamptz,
  preenchido_em timestamptz,
  atribuido_em timestamptz,
  assumido_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coletas_status ON public.coletas_solicitacoes (status);
CREATE INDEX idx_coletas_motorista ON public.coletas_solicitacoes (motorista_id);
CREATE INDEX idx_coletas_created_at ON public.coletas_solicitacoes (created_at DESC);
CREATE INDEX idx_coletas_whatsapp ON public.coletas_solicitacoes (whatsapp);

CREATE TABLE public.coletas_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.coletas_solicitacoes(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coletas_tokens_sol ON public.coletas_tokens (solicitacao_id);

CREATE TABLE public.coletas_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL REFERENCES public.coletas_solicitacoes(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  tipo text NOT NULL DEFAULT 'coleta',
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_coletas_fotos_sol ON public.coletas_fotos (solicitacao_id);

-- Grants (CPF fica fora do SELECT direto: só via RPC com permissão específica)
GRANT SELECT (id, tipo, cliente_nome, whatsapp, telefone_alternativo, cep, rua, numero,
  complemento, condominio, torre_bloco, apartamento, bairro, cidade, referencia,
  latitude, longitude, maps_url, marca_tv, polegadas, observacao, observacao_conclusao,
  status, motorista_id, created_by, concluido_por, cancelado_por, motivo_cancelamento,
  link_gerado_em, link_expira_em, preenchido_em, atribuido_em, assumido_em, concluido_em,
  cancelado_em, created_at, updated_at)
  ON public.coletas_solicitacoes TO authenticated;
GRANT ALL ON public.coletas_solicitacoes TO service_role;

GRANT SELECT ON public.coletas_fotos TO authenticated;
GRANT ALL ON public.coletas_fotos TO service_role;
GRANT ALL ON public.coletas_tokens TO service_role;

ALTER TABLE public.coletas_solicitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coletas_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coletas_fotos ENABLE ROW LEVEL SECURITY;

-- Helper de permissão do módulo
CREATE OR REPLACE FUNCTION public.coletas_pode(_action permission_action)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_permission(auth.uid(), 'coletas', _action) $$;

REVOKE ALL ON FUNCTION public.coletas_pode(permission_action) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_pode(permission_action) TO authenticated, service_role;

-- Leitura: gestão vê tudo; motorista vê fila disponível, suas atribuídas e suas concluídas
CREATE POLICY "coletas_select_gestao" ON public.coletas_solicitacoes
FOR SELECT TO authenticated
USING (public.coletas_pode('visualizar_todos'));

CREATE POLICY "coletas_select_motorista" ON public.coletas_solicitacoes
FOR SELECT TO authenticated
USING (
  public.coletas_pode('assumir')
  AND (
    motorista_id = auth.uid()
    OR (status = 'pronto_coleta' AND motorista_id IS NULL)
  )
);

CREATE POLICY "coletas_fotos_select" ON public.coletas_fotos
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.coletas_solicitacoes s WHERE s.id = solicitacao_id));

-- Escrita somente por RPC (security definer): nenhuma policy de escrita para authenticated.

CREATE TRIGGER trg_coletas_updated_at
BEFORE UPDATE ON public.coletas_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- RPCs — atendimento / gestão
-- =========================================================
CREATE OR REPLACE FUNCTION public.coletas_gerar_link(p_id uuid, p_horas integer DEFAULT 72)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_token text; v_exp timestamptz; v_status text;
BEGIN
  IF NOT public.coletas_pode('criar') THEN RAISE EXCEPTION 'Sem permissão para gerar link de coleta.'; END IF;
  SELECT status INTO v_status FROM public.coletas_solicitacoes WHERE id = p_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;
  IF v_status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Solicitação encerrada.'; END IF;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_exp := now() + make_interval(hours => greatest(1, least(coalesce(p_horas,72), 168)));

  UPDATE public.coletas_tokens SET used_at = coalesce(used_at, now())
   WHERE solicitacao_id = p_id AND used_at IS NULL;

  INSERT INTO public.coletas_tokens (solicitacao_id, token_hash, expires_at, created_by)
  VALUES (p_id, encode(sha256(v_token::bytea), 'hex'), v_exp, auth.uid());

  UPDATE public.coletas_solicitacoes
     SET link_gerado_em = now(), link_expira_em = v_exp
   WHERE id = p_id;

  PERFORM public.registrar_auditoria('coletas', 'link_gerado', NULL, jsonb_build_object('id', p_id, 'expira_em', v_exp));
  RETURN jsonb_build_object('token', v_token, 'expira_em', v_exp);
END $$;

CREATE OR REPLACE FUNCTION public.coletas_criar(
  p_tipo text, p_nome text, p_whatsapp text, p_observacao text DEFAULT NULL, p_horas integer DEFAULT 72)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_link jsonb;
BEGIN
  IF NOT public.coletas_pode('criar') THEN RAISE EXCEPTION 'Sem permissão para criar solicitação.'; END IF;
  IF coalesce(trim(p_nome),'') = '' THEN RAISE EXCEPTION 'Informe o nome do cliente.'; END IF;
  IF coalesce(regexp_replace(p_whatsapp,'\D','','g'),'') = '' THEN RAISE EXCEPTION 'Informe o WhatsApp.'; END IF;
  IF p_tipo NOT IN ('coleta','entrega') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;

  INSERT INTO public.coletas_solicitacoes (tipo, cliente_nome, whatsapp, observacao, created_by)
  VALUES (p_tipo, trim(p_nome), regexp_replace(p_whatsapp,'\D','','g'), nullif(trim(coalesce(p_observacao,'')),''), auth.uid())
  RETURNING id INTO v_id;

  PERFORM public.registrar_auditoria('coletas', 'solicitacao_criada', NULL, jsonb_build_object('id', v_id, 'tipo', p_tipo));
  v_link := public.coletas_gerar_link(v_id, p_horas);
  RETURN jsonb_build_object('id', v_id, 'token', v_link->>'token', 'expira_em', v_link->>'expira_em');
END $$;

CREATE OR REPLACE FUNCTION public.coletas_duplicados(p_whatsapp text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.coletas_pode('criar') THEN RAISE EXCEPTION 'Sem permissão.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v FROM (
    SELECT s.id, s.cliente_nome, s.tipo, s.status, s.bairro, s.rua, s.numero, s.complemento,
           s.condominio, s.torre_bloco, s.apartamento, s.cidade, s.cep, s.referencia,
           s.latitude, s.longitude, s.maps_url, s.marca_tv, s.polegadas, s.created_at
      FROM public.coletas_solicitacoes s
     WHERE s.whatsapp = regexp_replace(p_whatsapp,'\D','','g')
       AND s.created_at > now() - interval '180 days'
     ORDER BY s.created_at DESC LIMIT 3) x;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.coletas_atualizar(p_id uuid, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old jsonb;
BEGIN
  IF NOT public.coletas_pode('editar') THEN RAISE EXCEPTION 'Sem permissão para editar.'; END IF;
  SELECT to_jsonb(s) - 'cpf' INTO v_old FROM public.coletas_solicitacoes s WHERE s.id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;

  UPDATE public.coletas_solicitacoes SET
    cliente_nome = coalesce(nullif(trim(p_dados->>'cliente_nome'),''), cliente_nome),
    cpf = coalesce(nullif(regexp_replace(coalesce(p_dados->>'cpf',''),'\D','','g'),''), cpf),
    whatsapp = coalesce(nullif(regexp_replace(coalesce(p_dados->>'whatsapp',''),'\D','','g'),''), whatsapp),
    telefone_alternativo = coalesce(p_dados->>'telefone_alternativo', telefone_alternativo),
    tipo = coalesce(nullif(p_dados->>'tipo',''), tipo),
    cep = coalesce(p_dados->>'cep', cep),
    rua = coalesce(p_dados->>'rua', rua),
    numero = coalesce(p_dados->>'numero', numero),
    complemento = coalesce(p_dados->>'complemento', complemento),
    condominio = coalesce(p_dados->>'condominio', condominio),
    torre_bloco = coalesce(p_dados->>'torre_bloco', torre_bloco),
    apartamento = coalesce(p_dados->>'apartamento', apartamento),
    bairro = coalesce(p_dados->>'bairro', bairro),
    cidade = coalesce(p_dados->>'cidade', cidade),
    referencia = coalesce(p_dados->>'referencia', referencia),
    latitude = coalesce((p_dados->>'latitude')::numeric, latitude),
    longitude = coalesce((p_dados->>'longitude')::numeric, longitude),
    maps_url = coalesce(p_dados->>'maps_url', maps_url),
    marca_tv = coalesce(p_dados->>'marca_tv', marca_tv),
    polegadas = coalesce((p_dados->>'polegadas')::integer, polegadas),
    observacao = coalesce(p_dados->>'observacao', observacao)
  WHERE id = p_id;

  PERFORM public.registrar_auditoria('coletas', 'solicitacao_editada', v_old, jsonb_build_object('id', p_id));
END $$;

CREATE OR REPLACE FUNCTION public.coletas_atribuir(p_id uuid, p_motorista uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.coletas_pode('atribuir') THEN RAISE EXCEPTION 'Sem permissão para atribuir motorista.'; END IF;
  UPDATE public.coletas_solicitacoes
     SET motorista_id = p_motorista,
         atribuido_em = CASE WHEN p_motorista IS NULL THEN NULL ELSE now() END
   WHERE id = p_id AND status IN ('aguardando_cadastro','pronto_coleta','assumida');
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada ou já encerrada.'; END IF;
  PERFORM public.registrar_auditoria('coletas', 'motorista_atribuido', NULL, jsonb_build_object('id', p_id, 'motorista_id', p_motorista));
END $$;

CREATE OR REPLACE FUNCTION public.coletas_assumir(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.coletas_pode('assumir') THEN RAISE EXCEPTION 'Sem permissão para assumir coletas.'; END IF;
  UPDATE public.coletas_solicitacoes
     SET status = 'assumida', motorista_id = auth.uid(), assumido_em = now()
   WHERE id = p_id
     AND status = 'pronto_coleta'
     AND (motorista_id IS NULL OR motorista_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'Esta movimentação já foi assumida por outra pessoa.'; END IF;
  PERFORM public.registrar_auditoria('coletas', 'assumida', NULL, jsonb_build_object('id', p_id));
END $$;

CREATE OR REPLACE FUNCTION public.coletas_concluir(p_id uuid, p_observacao text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.coletas_pode('concluir') THEN RAISE EXCEPTION 'Sem permissão para concluir.'; END IF;
  UPDATE public.coletas_solicitacoes
     SET status = 'concluida', concluido_em = now(), concluido_por = auth.uid(),
         motorista_id = coalesce(motorista_id, auth.uid()),
         observacao_conclusao = nullif(trim(coalesce(p_observacao,'')),'')
   WHERE id = p_id
     AND status IN ('pronto_coleta','assumida')
     AND (public.coletas_pode('visualizar_todos') OR motorista_id = auth.uid() OR motorista_id IS NULL);
  IF NOT FOUND THEN RAISE EXCEPTION 'Não foi possível concluir esta movimentação.'; END IF;
  PERFORM public.registrar_auditoria('coletas', 'concluida', NULL, jsonb_build_object('id', p_id));
END $$;

CREATE OR REPLACE FUNCTION public.coletas_cancelar(p_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.coletas_pode('cancelar') THEN RAISE EXCEPTION 'Sem permissão para cancelar.'; END IF;
  IF coalesce(trim(p_motivo),'') = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  UPDATE public.coletas_solicitacoes
     SET status = 'cancelada', cancelado_em = now(), cancelado_por = auth.uid(), motivo_cancelamento = trim(p_motivo)
   WHERE id = p_id AND status <> 'concluida';
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada ou já concluída.'; END IF;
  UPDATE public.coletas_tokens SET used_at = coalesce(used_at, now()) WHERE solicitacao_id = p_id AND used_at IS NULL;
  PERFORM public.registrar_auditoria('coletas', 'cancelada', NULL, jsonb_build_object('id', p_id, 'motivo', p_motivo));
END $$;

CREATE OR REPLACE FUNCTION public.coletas_foto_registrar(p_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.coletas_pode('concluir') OR public.coletas_pode('editar')) THEN
    RAISE EXCEPTION 'Sem permissão para anexar fotos.';
  END IF;
  INSERT INTO public.coletas_fotos (solicitacao_id, storage_path, uploaded_by)
  VALUES (p_id, p_path, auth.uid());
  PERFORM public.registrar_auditoria('coletas', 'foto_anexada', NULL, jsonb_build_object('id', p_id));
END $$;

CREATE OR REPLACE FUNCTION public.coletas_cpf(p_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v text;
BEGIN
  IF NOT public.coletas_pode('ver_dados_sensiveis') THEN RAISE EXCEPTION 'Sem permissão para ver dados sensíveis.'; END IF;
  SELECT cpf INTO v FROM public.coletas_solicitacoes WHERE id = p_id;
  RETURN v;
END $$;

-- =========================================================
-- RPCs públicas (cliente, sem login)
-- =========================================================
CREATE OR REPLACE FUNCTION public.coletas_publico_abrir(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tok record; v_sol record;
BEGIN
  SELECT * INTO v_tok FROM public.coletas_tokens WHERE token_hash = encode(sha256(coalesce(p_token,'')::bytea),'hex');
  IF v_tok IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'invalido'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'usado'); END IF;
  IF v_tok.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'erro', 'expirado'); END IF;

  SELECT * INTO v_sol FROM public.coletas_solicitacoes WHERE id = v_tok.solicitacao_id;
  IF v_sol.status NOT IN ('aguardando_cadastro') THEN RETURN jsonb_build_object('ok', false, 'erro', 'usado'); END IF;

  RETURN jsonb_build_object('ok', true, 'tipo', v_sol.tipo, 'cliente_nome', v_sol.cliente_nome,
                            'whatsapp', v_sol.whatsapp, 'expira_em', v_tok.expires_at);
END $$;

CREATE OR REPLACE FUNCTION public.coletas_publico_enviar(p_token text, p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tok record; v_sol record; v_cpf text; v_zap text;
BEGIN
  SELECT * INTO v_tok FROM public.coletas_tokens WHERE token_hash = encode(sha256(coalesce(p_token,'')::bytea),'hex');
  IF v_tok IS NULL OR v_tok.used_at IS NOT NULL OR v_tok.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'expirado');
  END IF;
  SELECT * INTO v_sol FROM public.coletas_solicitacoes WHERE id = v_tok.solicitacao_id;
  IF v_sol.status <> 'aguardando_cadastro' THEN RETURN jsonb_build_object('ok', false, 'erro', 'usado'); END IF;

  v_cpf := regexp_replace(coalesce(p_dados->>'cpf',''), '\D', '', 'g');
  v_zap := regexp_replace(coalesce(p_dados->>'whatsapp',''), '\D', '', 'g');
  IF coalesce(trim(p_dados->>'cliente_nome'),'') = '' THEN RETURN jsonb_build_object('ok', false, 'erro', 'nome'); END IF;
  IF length(v_cpf) <> 11 THEN RETURN jsonb_build_object('ok', false, 'erro', 'cpf'); END IF;
  IF length(v_zap) < 10 THEN RETURN jsonb_build_object('ok', false, 'erro', 'whatsapp'); END IF;
  IF coalesce(trim(p_dados->>'rua'),'') = '' OR coalesce(trim(p_dados->>'numero'),'') = ''
     OR coalesce(trim(p_dados->>'bairro'),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'endereco');
  END IF;

  UPDATE public.coletas_solicitacoes SET
    cliente_nome = trim(p_dados->>'cliente_nome'),
    cpf = v_cpf,
    whatsapp = v_zap,
    telefone_alternativo = nullif(regexp_replace(coalesce(p_dados->>'telefone_alternativo',''),'\D','','g'),''),
    cep = nullif(regexp_replace(coalesce(p_dados->>'cep',''),'\D','','g'),''),
    rua = trim(p_dados->>'rua'),
    numero = trim(p_dados->>'numero'),
    complemento = nullif(trim(coalesce(p_dados->>'complemento','')),''),
    condominio = nullif(trim(coalesce(p_dados->>'condominio','')),''),
    torre_bloco = nullif(trim(coalesce(p_dados->>'torre_bloco','')),''),
    apartamento = nullif(trim(coalesce(p_dados->>'apartamento','')),''),
    bairro = trim(p_dados->>'bairro'),
    cidade = nullif(trim(coalesce(p_dados->>'cidade','')),''),
    referencia = nullif(trim(coalesce(p_dados->>'referencia','')),''),
    latitude = (p_dados->>'latitude')::numeric,
    longitude = (p_dados->>'longitude')::numeric,
    maps_url = nullif(trim(coalesce(p_dados->>'maps_url','')),''),
    marca_tv = nullif(trim(coalesce(p_dados->>'marca_tv','')),''),
    polegadas = nullif(p_dados->>'polegadas','')::integer,
    observacao = coalesce(observacao, '') || CASE WHEN coalesce(trim(p_dados->>'observacao_tv'),'') = '' THEN ''
                    ELSE (CASE WHEN coalesce(observacao,'') = '' THEN '' ELSE ' | ' END) || trim(p_dados->>'observacao_tv') END,
    status = 'pronto_coleta',
    preenchido_em = now()
  WHERE id = v_sol.id;

  UPDATE public.coletas_tokens SET used_at = now() WHERE id = v_tok.id;

  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_sol.created_by, 'coletas', 'formulario_preenchido', NULL, jsonb_build_object('id', v_sol.id));

  RETURN jsonb_build_object('ok', true, 'tipo', v_sol.tipo);
END $$;

REVOKE ALL ON FUNCTION public.coletas_publico_abrir(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coletas_publico_enviar(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coletas_publico_abrir(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_publico_enviar(text, jsonb) TO anon, authenticated, service_role;

-- =========================================================
-- Relatório diário automático
-- =========================================================
CREATE OR REPLACE FUNCTION public.coletas_relatorio_dia(p_data date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_resumo jsonb; v_detalhes jsonb; v_motoristas jsonb; v_ini timestamptz; v_fim timestamptz;
BEGIN
  IF NOT public.coletas_pode('relatorios') THEN RAISE EXCEPTION 'Sem permissão para relatórios de coletas.'; END IF;
  v_ini := (p_data::text || ' 00:00:00')::timestamp AT TIME ZONE 'America/Manaus';
  v_fim := v_ini + interval '1 day';

  SELECT jsonb_build_object(
    'solicitacoes_geradas', count(*) FILTER (WHERE created_at >= v_ini AND created_at < v_fim),
    'cadastros_preenchidos', count(*) FILTER (WHERE preenchido_em >= v_ini AND preenchido_em < v_fim),
    'coletas_realizadas', count(*) FILTER (WHERE tipo = 'coleta' AND concluido_em >= v_ini AND concluido_em < v_fim),
    'entregas_realizadas', count(*) FILTER (WHERE tipo = 'entrega' AND concluido_em >= v_ini AND concluido_em < v_fim),
    'pendentes', count(*) FILTER (WHERE status IN ('aguardando_cadastro','pronto_coleta','assumida')),
    'canceladas', count(*) FILTER (WHERE cancelado_em >= v_ini AND cancelado_em < v_fim),
    'tvs_movimentadas', count(*) FILTER (WHERE concluido_em >= v_ini AND concluido_em < v_fim)
  ) INTO v_resumo FROM public.coletas_solicitacoes;

  v_resumo := v_resumo || jsonb_build_object('total_movimentacoes',
    (v_resumo->>'coletas_realizadas')::int + (v_resumo->>'entregas_realizadas')::int);

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.horario), '[]'::jsonb) INTO v_detalhes FROM (
    SELECT s.id, s.tipo, s.cliente_nome, s.whatsapp, s.marca_tv, s.polegadas, s.bairro, s.cidade,
           s.rua, s.numero, s.complemento, s.condominio, s.torre_bloco, s.apartamento, s.referencia,
           s.latitude, s.longitude, s.maps_url, s.observacao, s.observacao_conclusao, s.status,
           s.assumido_em, s.concluido_em, s.cancelado_em, s.motivo_cancelamento,
           m.full_name AS motorista, a.full_name AS atendimento,
           coalesce(s.concluido_em, s.cancelado_em, s.assumido_em, s.preenchido_em, s.created_at) AS horario
      FROM public.coletas_solicitacoes s
      LEFT JOIN public.profiles m ON m.id = s.motorista_id
      LEFT JOIN public.profiles a ON a.id = s.created_by
     WHERE (s.created_at >= v_ini AND s.created_at < v_fim)
        OR (s.concluido_em >= v_ini AND s.concluido_em < v_fim)
        OR (s.assumido_em >= v_ini AND s.assumido_em < v_fim)
        OR (s.cancelado_em >= v_ini AND s.cancelado_em < v_fim)
        OR (s.status IN ('pronto_coleta','assumida','aguardando_cadastro'))
  ) x;

  SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.total DESC), '[]'::jsonb) INTO v_motoristas FROM (
    SELECT coalesce(m.full_name, 'Sem motorista') AS motorista,
           count(*) FILTER (WHERE s.tipo = 'coleta' AND s.concluido_em >= v_ini AND s.concluido_em < v_fim) AS coletas,
           count(*) FILTER (WHERE s.tipo = 'entrega' AND s.concluido_em >= v_ini AND s.concluido_em < v_fim) AS entregas,
           count(*) FILTER (WHERE s.concluido_em >= v_ini AND s.concluido_em < v_fim) AS concluidas,
           count(*) FILTER (WHERE s.status IN ('pronto_coleta','assumida')) AS pendentes,
           count(*) AS total
      FROM public.coletas_solicitacoes s
      LEFT JOIN public.profiles m ON m.id = s.motorista_id
     WHERE s.motorista_id IS NOT NULL
       AND ((s.concluido_em >= v_ini AND s.concluido_em < v_fim) OR s.status IN ('pronto_coleta','assumida'))
     GROUP BY 1
  ) y;

  RETURN jsonb_build_object('data', p_data, 'resumo', v_resumo, 'detalhes', v_detalhes, 'por_motorista', v_motoristas);
END $$;

-- Execução das RPCs restrita a usuários autenticados
REVOKE ALL ON FUNCTION public.coletas_criar(text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_gerar_link(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_duplicados(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_atualizar(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_atribuir(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_assumir(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_concluir(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_cancelar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_foto_registrar(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_cpf(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.coletas_relatorio_dia(date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.coletas_criar(text, text, text, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_gerar_link(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_duplicados(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_atualizar(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_atribuir(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_assumir(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_concluir(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_cancelar(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_foto_registrar(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_cpf(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.coletas_relatorio_dia(date) TO authenticated, service_role;

-- =========================================================
-- Permissões por perfil
-- =========================================================
INSERT INTO public.role_permissions (role, module_key, action)
SELECT r.role, 'coletas', a.action FROM (VALUES
  ('adm_operacional'::app_role)) r(role),
  (VALUES ('visualizar'::permission_action), ('visualizar_todos'), ('criar'), ('editar'),
          ('atribuir'), ('assumir'), ('concluir'), ('cancelar'), ('relatorios'), ('ver_dados_sensiveis')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action)
SELECT 'vendedor'::app_role, 'coletas', a.action FROM (VALUES
  ('visualizar'::permission_action), ('visualizar_todos'), ('criar'), ('editar'), ('atribuir'), ('cancelar'), ('relatorios')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action)
SELECT 'motorista'::app_role, 'coletas', a.action FROM (VALUES
  ('visualizar'::permission_action), ('assumir'), ('concluir')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action)
SELECT 'adm_financeiro'::app_role, 'coletas', a.action FROM (VALUES
  ('visualizar'::permission_action), ('visualizar_todos'), ('relatorios')) a(action)
ON CONFLICT DO NOTHING;

-- Fotos de coleta ficam no bucket privado (policies de storage em migração dedicada)
CREATE POLICY "coletas_tokens_service" ON public.coletas_tokens
FOR SELECT TO service_role USING (true);