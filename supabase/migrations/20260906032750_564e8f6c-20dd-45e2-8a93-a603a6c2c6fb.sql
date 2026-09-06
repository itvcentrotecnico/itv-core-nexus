CREATE TABLE IF NOT EXISTS public.rate_limit_publico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  acao text NOT NULL,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  tentativas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chave, acao)
);

GRANT ALL ON public.rate_limit_publico TO service_role;

ALTER TABLE public.rate_limit_publico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limit_admin_leitura" ON public.rate_limit_publico;
CREATE POLICY "rate_limit_admin_leitura" ON public.rate_limit_publico
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

CREATE OR REPLACE FUNCTION public.rate_limit_ok(p_chave text, p_acao text, p_max integer, p_janela interval)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rec record;
BEGIN
  DELETE FROM public.rate_limit_publico WHERE janela_inicio < now() - (p_janela * 10);

  INSERT INTO public.rate_limit_publico (chave, acao, janela_inicio, tentativas)
  VALUES (coalesce(p_chave,'-'), p_acao, now(), 1)
  ON CONFLICT (chave, acao) DO UPDATE SET
    janela_inicio = CASE WHEN public.rate_limit_publico.janela_inicio < now() - p_janela THEN now()
                         ELSE public.rate_limit_publico.janela_inicio END,
    tentativas = CASE WHEN public.rate_limit_publico.janela_inicio < now() - p_janela THEN 1
                      ELSE public.rate_limit_publico.tentativas + 1 END,
    updated_at = now()
  RETURNING * INTO v_rec;

  RETURN v_rec.tentativas <= p_max;
END $$;

REVOKE ALL ON FUNCTION public.rate_limit_ok(text, text, integer, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_ok(text, text, integer, interval) TO service_role;

CREATE OR REPLACE FUNCTION public.coletas_publico_abrir(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok record; v_sol record; v_chave text;
BEGIN
  v_chave := encode(sha256(coalesce(p_token,'')::bytea),'hex');
  IF NOT public.rate_limit_ok(v_chave, 'coleta_abrir', 30, interval '10 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  SELECT * INTO v_tok FROM public.coletas_tokens WHERE token_hash = v_chave;
  IF v_tok IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'invalido'); END IF;
  IF v_tok.used_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'usado'); END IF;
  IF v_tok.expires_at < now() THEN RETURN jsonb_build_object('ok', false, 'erro', 'expirado'); END IF;

  SELECT * INTO v_sol FROM public.coletas_solicitacoes WHERE id = v_tok.solicitacao_id;
  IF v_sol.status NOT IN ('aguardando_cadastro') THEN RETURN jsonb_build_object('ok', false, 'erro', 'usado'); END IF;

  RETURN jsonb_build_object('ok', true, 'tipo', v_sol.tipo, 'cliente_nome', v_sol.cliente_nome,
                            'whatsapp', v_sol.whatsapp, 'expira_em', v_tok.expires_at,
                            'pedir_origem', v_sol.origem_id IS NULL,
                            'origens', public.origens_listar());
END $$;

CREATE OR REPLACE FUNCTION public.coletas_publico_enviar(p_token text, p_dados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok record; v_sol record; v_cpf text; v_zap text; v_org record; v_original uuid; v_chave text;
BEGIN
  v_chave := encode(sha256(coalesce(p_token,'')::bytea),'hex');
  IF NOT public.rate_limit_ok(v_chave, 'coleta_enviar', 10, interval '10 minutes') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'muitas_tentativas');
  END IF;

  SELECT * INTO v_tok FROM public.coletas_tokens WHERE token_hash = v_chave;
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

  IF v_sol.origem_id IS NULL THEN
    SELECT * INTO v_org FROM public.origens_cliente
      WHERE id = nullif(p_dados->>'origem_id','')::uuid AND ativo;
    IF v_org IS NULL THEN RETURN jsonb_build_object('ok', false, 'erro', 'origem'); END IF;
    IF v_org.requer_detalhe AND coalesce(trim(p_dados->>'origem_detalhe'),'') = '' THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'origem_detalhe');
    END IF;

    SELECT s.origem_id INTO v_original
    FROM public.coletas_solicitacoes s
    JOIN public.origens_cliente o ON o.id = s.origem_id
    WHERE s.whatsapp = v_zap AND s.id <> v_sol.id AND o.nome <> 'Cliente antigo'
    ORDER BY s.created_at ASC LIMIT 1;
    IF v_original IS NULL AND v_org.nome <> 'Cliente antigo' THEN v_original := v_org.id; END IF;

    UPDATE public.coletas_solicitacoes SET
      origem_id = v_org.id,
      origem_detalhe = nullif(trim(coalesce(p_dados->>'origem_detalhe','')),''),
      origem_original_id = v_original,
      indicado_por_nome = nullif(trim(coalesce(p_dados->>'indicado_por_nome','')),''),
      origem_preenchida_em = now()
    WHERE id = v_sol.id;
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