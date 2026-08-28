-- 1. Tabela de origens configuráveis
CREATE TABLE public.origens_cliente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  requer_detalhe boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.origens_cliente TO authenticated;
GRANT SELECT ON public.origens_cliente TO anon;
GRANT ALL ON public.origens_cliente TO service_role;

ALTER TABLE public.origens_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Origens visiveis para autenticados"
  ON public.origens_cliente FOR SELECT TO authenticated USING (true);

CREATE TRIGGER update_origens_cliente_updated_at
  BEFORE UPDATE ON public.origens_cliente
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.origens_cliente (nome, ordem, requer_detalhe) VALUES
  ('Google', 1, false),
  ('Instagram', 2, false),
  ('Indicação', 3, false),
  ('Cliente antigo', 4, false),
  ('WhatsApp', 5, false),
  ('Outros', 6, true);

-- 2. Campos de origem no atendimento (coleta/entrega)
ALTER TABLE public.coletas_solicitacoes
  ADD COLUMN origem_id uuid REFERENCES public.origens_cliente(id),
  ADD COLUMN origem_detalhe text,
  ADD COLUMN origem_original_id uuid REFERENCES public.origens_cliente(id),
  ADD COLUMN indicado_por_nome text,
  ADD COLUMN indicado_por_telefone text,
  ADD COLUMN canal_contato text,
  ADD COLUMN origem_preenchida_por uuid,
  ADD COLUMN origem_preenchida_em timestamptz;

CREATE INDEX idx_coletas_solicitacoes_origem_cliente ON public.coletas_solicitacoes (origem_id);

-- 3. Normalização de nome (para relacionar atendimento x lançamento do caixa)
CREATE OR REPLACE FUNCTION public.norm_nome_cliente(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(trim(regexp_replace(coalesce(_v,''), '\s+', ' ', 'g'))), '')
$$;

-- 4. Lista de origens ativas (usada também pelo formulário público)
CREATE OR REPLACE FUNCTION public.origens_listar()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'nome', o.nome, 'ordem', o.ordem, 'requer_detalhe', o.requer_detalhe
  ) ORDER BY o.ordem, o.nome), '[]'::jsonb)
  FROM public.origens_cliente o WHERE o.ativo
$$;

REVOKE ALL ON FUNCTION public.origens_listar() FROM public;
GRANT EXECUTE ON FUNCTION public.origens_listar() TO anon, authenticated;

-- 5. Definir/corrigir a origem de um atendimento
CREATE OR REPLACE FUNCTION public.coletas_origem_definir(
  p_id uuid,
  p_origem_id uuid,
  p_detalhe text DEFAULT NULL,
  p_indicado_nome text DEFAULT NULL,
  p_indicado_telefone text DEFAULT NULL,
  p_canal text DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sol record; v_org record; v_ant text; v_original uuid;
BEGIN
  SELECT * INTO v_sol FROM public.coletas_solicitacoes WHERE id = p_id;
  IF v_sol IS NULL THEN RAISE EXCEPTION 'Atendimento não encontrado.'; END IF;

  IF v_sol.origem_id IS NULL THEN
    IF NOT (public.coletas_pode('criar') OR public.coletas_pode('editar')) THEN
      RAISE EXCEPTION 'Sem permissão para informar a origem.';
    END IF;
  ELSIF NOT public.coletas_pode('editar') THEN
    RAISE EXCEPTION 'Sem permissão para corrigir a origem.';
  END IF;

  SELECT * INTO v_org FROM public.origens_cliente WHERE id = p_origem_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Selecione uma origem válida.'; END IF;
  IF v_org.requer_detalhe AND coalesce(trim(p_detalhe),'') = '' THEN
    RAISE EXCEPTION 'Informe qual foi a origem.';
  END IF;

  SELECT nome INTO v_ant FROM public.origens_cliente WHERE id = v_sol.origem_id;

  -- origem original: primeira origem conhecida do mesmo WhatsApp que não seja "Cliente antigo"
  v_original := v_sol.origem_original_id;
  IF v_original IS NULL THEN
    SELECT s.origem_id INTO v_original
    FROM public.coletas_solicitacoes s
    JOIN public.origens_cliente o ON o.id = s.origem_id
    WHERE s.whatsapp = v_sol.whatsapp AND s.id <> v_sol.id AND o.nome <> 'Cliente antigo'
    ORDER BY s.created_at ASC LIMIT 1;
  END IF;
  IF v_original IS NULL AND v_org.nome <> 'Cliente antigo' THEN v_original := v_org.id; END IF;

  UPDATE public.coletas_solicitacoes SET
    origem_id = v_org.id,
    origem_detalhe = nullif(trim(coalesce(p_detalhe,'')),''),
    origem_original_id = v_original,
    indicado_por_nome = nullif(trim(coalesce(p_indicado_nome,'')),''),
    indicado_por_telefone = nullif(regexp_replace(coalesce(p_indicado_telefone,''),'\D','','g'),''),
    canal_contato = coalesce(nullif(trim(coalesce(p_canal,'')),''), canal_contato),
    origem_preenchida_por = auth.uid(),
    origem_preenchida_em = now()
  WHERE id = p_id;

  PERFORM public.registrar_auditoria(
    'coletas',
    CASE WHEN v_ant IS NULL THEN 'origem_definida' ELSE 'origem_alterada' END,
    jsonb_build_object('id', p_id, 'origem', v_ant),
    jsonb_build_object('id', p_id, 'origem', v_org.nome, 'detalhe', p_detalhe, 'motivo', p_motivo)
  );

  RETURN jsonb_build_object('ok', true, 'origem', v_org.nome);
END $$;

REVOKE ALL ON FUNCTION public.coletas_origem_definir(uuid,uuid,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.coletas_origem_definir(uuid,uuid,text,text,text,text,text) TO authenticated;

-- 6. Criação do atendimento passa a exigir a origem
DROP FUNCTION IF EXISTS public.coletas_criar(text, text, text, text, integer);

CREATE OR REPLACE FUNCTION public.coletas_criar(
  p_tipo text,
  p_nome text,
  p_whatsapp text,
  p_observacao text DEFAULT NULL,
  p_horas integer DEFAULT 72,
  p_origem_id uuid DEFAULT NULL,
  p_origem_detalhe text DEFAULT NULL,
  p_indicado_nome text DEFAULT NULL,
  p_indicado_telefone text DEFAULT NULL,
  p_canal_contato text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_link jsonb;
BEGIN
  IF NOT public.coletas_pode('criar') THEN RAISE EXCEPTION 'Sem permissão para criar solicitação.'; END IF;
  IF coalesce(trim(p_nome),'') = '' THEN RAISE EXCEPTION 'Informe o nome do cliente.'; END IF;
  IF coalesce(regexp_replace(p_whatsapp,'\D','','g'),'') = '' THEN RAISE EXCEPTION 'Informe o WhatsApp.'; END IF;
  IF p_tipo NOT IN ('coleta','entrega') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
  IF p_origem_id IS NULL THEN RAISE EXCEPTION 'Informe como o cliente conheceu a ITV.'; END IF;

  INSERT INTO public.coletas_solicitacoes (tipo, cliente_nome, whatsapp, observacao, created_by, canal_contato)
  VALUES (p_tipo, trim(p_nome), regexp_replace(p_whatsapp,'\D','','g'),
          nullif(trim(coalesce(p_observacao,'')),''), auth.uid(),
          nullif(trim(coalesce(p_canal_contato,'')),''))
  RETURNING id INTO v_id;

  PERFORM public.coletas_origem_definir(v_id, p_origem_id, p_origem_detalhe, p_indicado_nome, p_indicado_telefone, p_canal_contato, NULL);

  PERFORM public.registrar_auditoria('coletas', 'solicitacao_criada', NULL, jsonb_build_object('id', v_id, 'tipo', p_tipo));
  v_link := public.coletas_gerar_link(v_id, p_horas);
  RETURN jsonb_build_object('id', v_id, 'token', v_link->>'token', 'expira_em', v_link->>'expira_em');
END $$;

REVOKE ALL ON FUNCTION public.coletas_criar(text,text,text,text,integer,uuid,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.coletas_criar(text,text,text,text,integer,uuid,text,text,text,text) TO authenticated;

-- 7. Formulário público: pergunta a origem apenas quando ainda não informada
CREATE OR REPLACE FUNCTION public.coletas_publico_abrir(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tok record; v_sol record;
BEGIN
  SELECT * INTO v_tok FROM public.coletas_tokens WHERE token_hash = encode(sha256(coalesce(p_token,'')::bytea),'hex');
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
DECLARE v_tok record; v_sol record; v_cpf text; v_zap text; v_org record; v_original uuid;
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

-- 8. Relatório: origem dos clientes
CREATE OR REPLACE FUNCTION public.rel_origens(p_ini date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'relatorios', 'visualizar')
          OR public.has_permission(auth.uid(), 'relatorios_faturamento', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'sem_permissao', 'message', 'Sem permissão para ver este relatório.');
  END IF;

  WITH atend AS (
    SELECT s.id, s.whatsapp, s.created_at,
           coalesce(o.nome, 'Não informado') AS origem,
           public.norm_nome_cliente(s.cliente_nome) AS nome_norm
    FROM public.coletas_solicitacoes s
    LEFT JOIN public.origens_cliente o ON o.id = s.origem_id
    WHERE s.deleted_at IS NULL
      AND (s.created_at AT TIME ZONE 'America/Manaus')::date BETWEEN p_ini AND p_fim
  ),
  -- relacionamento por nome normalizado do cliente (sem duplicar origem no caixa)
  cli_origem AS (
    SELECT DISTINCT ON (public.norm_nome_cliente(s.cliente_nome))
      public.norm_nome_cliente(s.cliente_nome) AS nome_norm,
      coalesce(o.nome, 'Não informado') AS origem
    FROM public.coletas_solicitacoes s
    LEFT JOIN public.origens_cliente o ON o.id = s.origem_id
    WHERE s.deleted_at IS NULL AND s.origem_id IS NOT NULL
    ORDER BY public.norm_nome_cliente(s.cliente_nome), s.created_at ASC
  ),
  fat AS (
    SELECT coalesce(c.origem, 'Não informado') AS origem,
           count(*) AS os_faturadas,
           sum(l.valor_final) AS faturamento
    FROM public.caixa_lancamentos l
    LEFT JOIN cli_origem c ON c.nome_norm = public.norm_nome_cliente(l.cliente)
    WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_ini AND p_fim
    GROUP BY 1
  ),
  base AS (
    SELECT a.origem,
           count(*)::int AS atendimentos,
           count(DISTINCT a.whatsapp)::int AS clientes
    FROM atend a GROUP BY 1
  ),
  merged AS (
    SELECT coalesce(b.origem, f.origem) AS origem,
           coalesce(b.atendimentos, 0) AS atendimentos,
           coalesce(b.clientes, 0) AS clientes,
           coalesce(f.os_faturadas, 0)::int AS os_faturadas,
           coalesce(f.faturamento, 0)::numeric(14,2) AS faturamento
    FROM base b FULL OUTER JOIN fat f ON f.origem = b.origem
  ),
  mensal AS (
    SELECT to_char((a.created_at AT TIME ZONE 'America/Manaus'), 'YYYY-MM') AS mes,
           a.origem, count(*)::int AS atendimentos, count(DISTINCT a.whatsapp)::int AS clientes
    FROM atend a GROUP BY 1, 2
  ),
  fat_mes AS (
    SELECT to_char(l.data_lancamento, 'YYYY-MM') AS mes,
           coalesce(c.origem, 'Não informado') AS origem,
           sum(l.valor_final)::numeric(14,2) AS faturamento
    FROM public.caixa_lancamentos l
    LEFT JOIN cli_origem c ON c.nome_norm = public.norm_nome_cliente(l.cliente)
    WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN p_ini AND p_fim
    GROUP BY 1, 2
  ),
  qualidade AS (
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE origem <> 'Não informado')::int AS com_origem
    FROM atend
  )
  SELECT jsonb_build_object(
    'ok', true,
    'por_origem', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'origem', m.origem,
        'atendimentos', m.atendimentos,
        'clientes', m.clientes,
        'os_faturadas', m.os_faturadas,
        'faturamento', m.faturamento,
        'ticket_medio', CASE WHEN m.os_faturadas > 0 THEN round(m.faturamento / m.os_faturadas, 2) ELSE 0 END,
        'conversao_pct', CASE WHEN m.atendimentos > 0 THEN round(m.os_faturadas::numeric * 100 / m.atendimentos, 1) ELSE NULL END
      ) ORDER BY m.faturamento DESC, m.atendimentos DESC) FROM merged m), '[]'::jsonb),
    'mensal', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'mes', x.mes, 'origem', x.origem, 'atendimentos', x.atendimentos, 'clientes', x.clientes,
        'faturamento', coalesce((SELECT fm.faturamento FROM fat_mes fm WHERE fm.mes = x.mes AND fm.origem = x.origem), 0)
      ) ORDER BY x.mes, x.origem) FROM mensal x), '[]'::jsonb),
    'qualidade', (SELECT jsonb_build_object(
        'atendimentos', q.total, 'com_origem', q.com_origem, 'sem_origem', q.total - q.com_origem,
        'completude_pct', CASE WHEN q.total > 0 THEN round(q.com_origem::numeric * 100 / q.total, 1) ELSE NULL END
      ) FROM qualidade q)
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.rel_origens(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.rel_origens(date, date) TO authenticated;

-- 9. Mapa cliente -> origem para filtrar o Caixa (sem duplicar a origem no lançamento)
CREATE OR REPLACE FUNCTION public.caixa_origem_map()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'caixa', 'visualizar') THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('cliente', x.nome_norm, 'origem', x.origem))
    FROM (
      SELECT DISTINCT ON (public.norm_nome_cliente(s.cliente_nome))
        public.norm_nome_cliente(s.cliente_nome) AS nome_norm, o.nome AS origem
      FROM public.coletas_solicitacoes s
      JOIN public.origens_cliente o ON o.id = s.origem_id
      WHERE s.deleted_at IS NULL AND public.norm_nome_cliente(s.cliente_nome) IS NOT NULL
      ORDER BY public.norm_nome_cliente(s.cliente_nome), s.created_at ASC
    ) x
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.caixa_origem_map() FROM public;
GRANT EXECUTE ON FUNCTION public.caixa_origem_map() TO authenticated;