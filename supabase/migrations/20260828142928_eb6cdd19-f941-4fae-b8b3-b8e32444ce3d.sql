-- ============ CENTRAL OPERACIONAL ============

ALTER TYPE public.comissao_status ADD VALUE IF NOT EXISTS 'devolvida';

ALTER TABLE public.comissoes
  ADD COLUMN IF NOT EXISTS devolvida_em timestamptz,
  ADD COLUMN IF NOT EXISTS devolvida_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_devolucao text,
  ADD COLUMN IF NOT EXISTS liberada_em timestamptz,
  ADD COLUMN IF NOT EXISTS liberada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ---------- Motivos de pendência ----------
CREATE TABLE IF NOT EXISTS public.motivos_pendencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.motivos_pendencia TO authenticated;
GRANT ALL ON public.motivos_pendencia TO service_role;
ALTER TABLE public.motivos_pendencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivos_pendencia_select" ON public.motivos_pendencia
  FOR SELECT TO authenticated USING (public.usuario_ativo(auth.uid()));
CREATE TRIGGER update_motivos_pendencia_updated_at BEFORE UPDATE ON public.motivos_pendencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.motivos_pendencia (nome, ordem) VALUES
  ('Aguardando diagnóstico', 1),
  ('Aguardando aprovação do cliente', 2),
  ('Aguardando peça', 3),
  ('Peça em trânsito', 4),
  ('Em reparo', 5),
  ('Em testes', 6),
  ('Concluída aguardando pagamento', 7),
  ('Aguardando retirada do cliente', 8),
  ('Aguardando entrega', 9),
  ('Sem reparo / devolução', 10),
  ('Garantia / retorno', 11),
  ('Outro', 99)
ON CONFLICT (nome) DO NOTHING;

-- ---------- Fechamento semanal ----------
CREATE TABLE IF NOT EXISTS public.fechamentos_operacionais_semanais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inicio_periodo date NOT NULL UNIQUE,
  fim_periodo date NOT NULL,
  semana integer NOT NULL,
  ano integer NOT NULL,
  entradas integer NOT NULL DEFAULT 0,
  entradas_fonte text NOT NULL DEFAULT 'manual',
  entradas_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entradas_em timestamptz,
  entregas integer NOT NULL DEFAULT 0,
  saldo integer NOT NULL DEFAULT 0,
  taxa_saida numeric(12,2),
  status text NOT NULL DEFAULT 'aberto',
  fechado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  fechado_em timestamptz,
  reaberto_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reaberto_em timestamptz,
  motivo_reabertura text,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fechamentos_operacionais_semanais TO authenticated;
GRANT ALL ON public.fechamentos_operacionais_semanais TO service_role;
ALTER TABLE public.fechamentos_operacionais_semanais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fechamentos_op_select" ON public.fechamentos_operacionais_semanais
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operacional', 'visualizar'));
CREATE TRIGGER update_fechamentos_op_updated_at BEFORE UPDATE ON public.fechamentos_operacionais_semanais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- Pendências ----------
CREATE TABLE IF NOT EXISTS public.pendencias_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid REFERENCES public.fechamentos_operacionais_semanais(id) ON DELETE CASCADE,
  os text NOT NULL,
  motivo_id uuid NOT NULL REFERENCES public.motivos_pendencia(id) ON DELETE RESTRICT,
  observacao text,
  cliente text,
  marca text,
  modelo text,
  polegadas integer,
  tecnico_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  data_entrada date NOT NULL DEFAULT (timezone('America/Manaus', now()))::date,
  ultima_movimentacao timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'aberta',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pend_op_os_fechamento
  ON public.pendencias_operacionais (fechamento_id, lower(os)) WHERE status = 'aberta';
CREATE INDEX IF NOT EXISTS idx_pend_op_fechamento ON public.pendencias_operacionais (fechamento_id);
CREATE INDEX IF NOT EXISTS idx_pend_op_motivo ON public.pendencias_operacionais (motivo_id);
GRANT SELECT ON public.pendencias_operacionais TO authenticated;
GRANT ALL ON public.pendencias_operacionais TO service_role;
ALTER TABLE public.pendencias_operacionais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pendencias_op_select" ON public.pendencias_operacionais
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operacional', 'visualizar'));
CREATE TRIGGER update_pendencias_op_updated_at BEFORE UPDATE ON public.pendencias_operacionais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.pendencias_operacionais_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id uuid NOT NULL REFERENCES public.pendencias_operacionais(id) ON DELETE CASCADE,
  motivo_anterior text,
  motivo_novo text NOT NULL,
  observacao text,
  usuario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pendencias_operacionais_historico TO authenticated;
GRANT ALL ON public.pendencias_operacionais_historico TO service_role;
ALTER TABLE public.pendencias_operacionais_historico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pendencias_op_hist_select" ON public.pendencias_operacionais_historico
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operacional', 'visualizar'));

-- ---------- Alteração de técnico ----------
CREATE TABLE IF NOT EXISTS public.producao_tecnico_alteracoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producao_id uuid NOT NULL REFERENCES public.producao_tecnica(id) ON DELETE CASCADE,
  tecnico_anterior uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tecnico_novo uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  motivo text NOT NULL,
  usuario_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.producao_tecnico_alteracoes TO authenticated;
GRANT ALL ON public.producao_tecnico_alteracoes TO service_role;
ALTER TABLE public.producao_tecnico_alteracoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producao_tec_alt_select" ON public.producao_tecnico_alteracoes
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'operacional', 'visualizar')
         OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos'));

-- ---------- Módulo e permissões ----------
INSERT INTO public.modules (key, label) VALUES ('operacional', 'Central Operacional')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action)
SELECT r.role, 'operacional', a.action
FROM (VALUES ('adm_operacional'::app_role), ('administrador'::app_role)) r(role),
     (VALUES ('visualizar'::permission_action), ('validar'), ('editar'), ('atribuir'),
             ('criar'), ('fechar'), ('reabrir'), ('aprovar'), ('relatorios'), ('exportar')) a(action)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action) VALUES
  ('adm_financeiro', 'operacional', 'visualizar'),
  ('adm_operacional', 'comissoes', 'visualizar'),
  ('adm_operacional', 'comissoes', 'visualizar_todos'),
  ('adm_operacional', 'comissoes', 'aprovar')
ON CONFLICT DO NOTHING;

-- ---------- Configurações ----------
INSERT INTO public.settings (key, value) VALUES
  ('operacional_parametros', jsonb_build_object(
    'dias_parada', 5,
    'faixa_atencao', 4,
    'faixa_critico', 8,
    'faixa_prioridade', 16))
ON CONFLICT (key) DO NOTHING;

-- ============ FUNÇÕES ============

CREATE OR REPLACE FUNCTION public.operacional_pode(_action permission_action)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(auth.uid(), 'operacional', _action)
$$;

-- semana de referência (segunda a domingo, America/Manaus)
CREATE OR REPLACE FUNCTION public.operacional_semana_inicio(p_ref date)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (date_trunc('week', p_ref::timestamp))::date
$$;

CREATE OR REPLACE FUNCTION public.operacional_entregas_periodo(p_ini date, p_fim date)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::int FROM public.coletas_solicitacoes
  WHERE tipo = 'entrega' AND status = 'concluida' AND deleted_at IS NULL
    AND (concluido_em AT TIME ZONE 'America/Manaus')::date BETWEEN p_ini AND p_fim
$$;

-- Painel da semana (fechamento + reconciliação)
CREATE OR REPLACE FUNCTION public.operacional_semana(p_ref date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (timezone('America/Manaus', now()))::date;
  v_ini date; v_fim date;
  v_f public.fechamentos_operacionais_semanais%rowtype;
  v_entregas int; v_entradas int; v_saldo int; v_classificado int;
BEGIN
  IF NOT public.operacional_pode('visualizar') THEN
    RAISE EXCEPTION 'Você não tem acesso à Central Operacional.';
  END IF;
  v_ini := public.operacional_semana_inicio(coalesce(p_ref, v_hoje));
  v_fim := v_ini + 6;
  SELECT * INTO v_f FROM public.fechamentos_operacionais_semanais WHERE inicio_periodo = v_ini;
  v_entregas := public.operacional_entregas_periodo(v_ini, v_fim);
  v_entradas := coalesce(v_f.entradas, 0);
  IF v_f.status = 'fechado' THEN
    v_entregas := v_f.entregas;
  END IF;
  v_saldo := greatest(v_entradas - v_entregas, 0);
  SELECT count(*)::int INTO v_classificado
    FROM public.pendencias_operacionais p
    WHERE p.status = 'aberta' AND p.fechamento_id = v_f.id;

  RETURN jsonb_build_object(
    'inicio', v_ini, 'fim', v_fim,
    'semana', extract(week from v_ini)::int, 'ano', extract(isoyear from v_ini)::int,
    'fechamento_id', v_f.id,
    'status', coalesce(v_f.status, 'aberto'),
    'entradas', v_entradas,
    'entradas_fonte', v_f.entradas_fonte,
    'entradas_em', v_f.entradas_em,
    'entradas_informadas', v_f.entradas_em IS NOT NULL,
    'entregas', v_entregas,
    'saldo', v_saldo,
    'taxa_saida', CASE WHEN v_entradas > 0 THEN round(v_entregas::numeric * 100 / v_entradas, 1) ELSE NULL END,
    'classificadas', v_classificado,
    'faltam', greatest(v_saldo - v_classificado, 0),
    'saidas_maiores', v_entregas > v_entradas AND v_entradas > 0,
    'fechado_em', v_f.fechado_em,
    'reaberto_em', v_f.reaberto_em,
    'motivo_reabertura', v_f.motivo_reabertura,
    'pendentes_por_motivo', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT m.nome AS motivo, count(*)::int AS total
        FROM public.pendencias_operacionais p
        JOIN public.motivos_pendencia m ON m.id = p.motivo_id
        WHERE p.fechamento_id = v_f.id AND p.status = 'aberta'
        GROUP BY m.nome ORDER BY count(*) DESC) x), '[]'::jsonb)
  );
END $$;

-- Registrar entradas da semana
CREATE OR REPLACE FUNCTION public.operacional_entradas_registrar(p_ref date, p_quantidade integer, p_fonte text DEFAULT 'manual')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date; v_fim date; v_id uuid; v_status text;
BEGIN
  IF NOT public.operacional_pode('criar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para registrar entradas.');
  END IF;
  IF p_quantidade IS NULL OR p_quantidade < 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe uma quantidade válida de entradas.');
  END IF;
  v_ini := public.operacional_semana_inicio(coalesce(p_ref, (timezone('America/Manaus', now()))::date));
  v_fim := v_ini + 6;
  SELECT id, status INTO v_id, v_status FROM public.fechamentos_operacionais_semanais WHERE inicio_periodo = v_ini;
  IF v_status = 'fechado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Esta semana já está fechada. Reabra para alterar as entradas.');
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.fechamentos_operacionais_semanais
      (inicio_periodo, fim_periodo, semana, ano, entradas, entradas_fonte, entradas_por, entradas_em)
    VALUES (v_ini, v_fim, extract(week from v_ini)::int, extract(isoyear from v_ini)::int,
            p_quantidade, coalesce(p_fonte, 'manual'), auth.uid(), now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.fechamentos_operacionais_semanais
      SET entradas = p_quantidade, entradas_fonte = coalesce(p_fonte, 'manual'),
          entradas_por = auth.uid(), entradas_em = now()
    WHERE id = v_id;
  END IF;
  PERFORM public.registrar_auditoria('operacional', 'entradas_registrar', NULL,
    jsonb_build_object('inicio', v_ini, 'quantidade', p_quantidade, 'fonte', p_fonte));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- Classificar/atualizar pendência
CREATE OR REPLACE FUNCTION public.operacional_pendencia_salvar(
  p_ref date, p_os text, p_motivo_id uuid, p_observacao text DEFAULT NULL,
  p_tecnico_id uuid DEFAULT NULL, p_data_entrada date DEFAULT NULL,
  p_cliente text DEFAULT NULL, p_marca text DEFAULT NULL, p_modelo text DEFAULT NULL,
  p_polegadas integer DEFAULT NULL, p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ini date; v_fim date; v_fech uuid; v_status text; v_id uuid;
  v_motivo_antigo text; v_motivo_novo text;
BEGIN
  IF NOT public.operacional_pode('criar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para classificar pendências.');
  END IF;
  IF p_os IS NULL OR btrim(p_os) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe a OS.');
  END IF;
  SELECT nome INTO v_motivo_novo FROM public.motivos_pendencia WHERE id = p_motivo_id AND ativo;
  IF v_motivo_novo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Selecione um motivo válido.');
  END IF;

  v_ini := public.operacional_semana_inicio(coalesce(p_ref, (timezone('America/Manaus', now()))::date));
  v_fim := v_ini + 6;
  SELECT id, status INTO v_fech, v_status FROM public.fechamentos_operacionais_semanais WHERE inicio_periodo = v_ini;
  IF v_status = 'fechado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Semana fechada. Reabra o fechamento para alterar pendências.');
  END IF;
  IF v_fech IS NULL THEN
    INSERT INTO public.fechamentos_operacionais_semanais (inicio_periodo, fim_periodo, semana, ano)
    VALUES (v_ini, v_fim, extract(week from v_ini)::int, extract(isoyear from v_ini)::int)
    RETURNING id INTO v_fech;
  END IF;

  IF p_id IS NULL THEN
    SELECT id INTO v_id FROM public.pendencias_operacionais
      WHERE fechamento_id = v_fech AND lower(os) = lower(btrim(p_os)) AND status = 'aberta';
  ELSE
    v_id := p_id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.pendencias_operacionais
      (fechamento_id, os, motivo_id, observacao, cliente, marca, modelo, polegadas,
       tecnico_id, data_entrada, created_by)
    VALUES (v_fech, btrim(p_os), p_motivo_id, p_observacao, p_cliente, p_marca, p_modelo, p_polegadas,
            p_tecnico_id, coalesce(p_data_entrada, v_ini), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    SELECT m.nome INTO v_motivo_antigo
      FROM public.pendencias_operacionais p JOIN public.motivos_pendencia m ON m.id = p.motivo_id
      WHERE p.id = v_id;
    UPDATE public.pendencias_operacionais SET
      motivo_id = p_motivo_id, observacao = coalesce(p_observacao, observacao),
      cliente = coalesce(p_cliente, cliente), marca = coalesce(p_marca, marca),
      modelo = coalesce(p_modelo, modelo), polegadas = coalesce(p_polegadas, polegadas),
      tecnico_id = coalesce(p_tecnico_id, tecnico_id),
      data_entrada = coalesce(p_data_entrada, data_entrada),
      ultima_movimentacao = now()
    WHERE id = v_id;
  END IF;

  INSERT INTO public.pendencias_operacionais_historico
    (pendencia_id, motivo_anterior, motivo_novo, observacao, usuario_id)
  VALUES (v_id, v_motivo_antigo, v_motivo_novo, p_observacao, auth.uid());

  PERFORM public.registrar_auditoria('operacional', 'pendencia_classificar', NULL,
    jsonb_build_object('os', p_os, 'motivo', v_motivo_novo, 'anterior', v_motivo_antigo));
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

CREATE OR REPLACE FUNCTION public.operacional_pendencia_remover(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status text;
BEGIN
  IF NOT public.operacional_pode('criar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para remover pendências.');
  END IF;
  SELECT f.status INTO v_status FROM public.pendencias_operacionais p
    LEFT JOIN public.fechamentos_operacionais_semanais f ON f.id = p.fechamento_id WHERE p.id = p_id;
  IF v_status = 'fechado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Semana fechada. Reabra o fechamento para alterar pendências.');
  END IF;
  UPDATE public.pendencias_operacionais SET status = 'removida', ultima_movimentacao = now() WHERE id = p_id;
  PERFORM public.registrar_auditoria('operacional', 'pendencia_remover', NULL, jsonb_build_object('id', p_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Fechar semana
CREATE OR REPLACE FUNCTION public.operacional_fechar_semana(p_ref date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_id uuid; v_ini date;
BEGIN
  IF NOT public.operacional_pode('fechar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para fechar a semana.');
  END IF;
  v := public.operacional_semana(p_ref);
  v_ini := (v->>'inicio')::date;
  v_id := nullif(v->>'fechamento_id', '')::uuid;
  IF v->>'status' = 'fechado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Esta semana já está fechada.');
  END IF;
  IF NOT (v->>'entradas_informadas')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o total de entradas da semana antes de fechar.');
  END IF;
  IF (v->>'faltam')::int > 0 THEN
    RETURN jsonb_build_object('ok', false, 'message',
      format('Faltam classificar %s TVs do saldo não entregue.', v->>'faltam'));
  END IF;
  UPDATE public.fechamentos_operacionais_semanais SET
    entregas = (v->>'entregas')::int,
    saldo = (v->>'saldo')::int,
    taxa_saida = nullif(v->>'taxa_saida','')::numeric,
    status = 'fechado', fechado_por = auth.uid(), fechado_em = now(),
    snapshot = v
  WHERE id = v_id;
  PERFORM public.registrar_auditoria('operacional', 'fechar_semana', NULL, v);
  RETURN jsonb_build_object('ok', true, 'inicio', v_ini);
END $$;

CREATE OR REPLACE FUNCTION public.operacional_reabrir_semana(p_ref date, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ini date;
BEGIN
  IF NOT public.operacional_pode('reabrir') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para reabrir a semana.');
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo da reabertura.');
  END IF;
  v_ini := public.operacional_semana_inicio(coalesce(p_ref, (timezone('America/Manaus', now()))::date));
  UPDATE public.fechamentos_operacionais_semanais SET
    status = 'reaberto', reaberto_por = auth.uid(), reaberto_em = now(), motivo_reabertura = p_motivo
  WHERE inicio_periodo = v_ini AND status = 'fechado';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Não há fechamento fechado para esta semana.');
  END IF;
  PERFORM public.registrar_auditoria('operacional', 'reabrir_semana', NULL,
    jsonb_build_object('inicio', v_ini, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Histórico de semanas
CREATE OR REPLACE FUNCTION public.operacional_historico(p_semanas integer DEFAULT 8)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (timezone('America/Manaus', now()))::date; v_ini date;
BEGIN
  IF NOT public.operacional_pode('visualizar') THEN
    RAISE EXCEPTION 'Você não tem acesso à Central Operacional.';
  END IF;
  v_ini := public.operacional_semana_inicio(v_hoje) - (7 * greatest(coalesce(p_semanas, 8), 1) - 7);
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x.inicio)
    FROM (
      SELECT s.dia AS inicio, (s.dia + 6) AS fim,
        extract(week from s.dia)::int AS semana,
        coalesce(f.entradas, 0) AS entradas,
        CASE WHEN f.status = 'fechado' THEN f.entregas
             ELSE public.operacional_entregas_periodo(s.dia, s.dia + 6) END AS entregas,
        coalesce(f.status, 'aberto') AS status
      FROM generate_series(v_ini, public.operacional_semana_inicio(v_hoje), interval '7 day') AS s(dia)
      LEFT JOIN public.fechamentos_operacionais_semanais f ON f.inicio_periodo = s.dia::date
    ) x), '[]'::jsonb);
END $$;

-- Dashboard operacional
CREATE OR REPLACE FUNCTION public.operacional_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (timezone('America/Manaus', now()))::date;
  v_cfg jsonb; v_parada int; v_prioridade int; v_semana jsonb; v_ant jsonb;
BEGIN
  IF NOT public.operacional_pode('visualizar') THEN
    RAISE EXCEPTION 'Você não tem acesso à Central Operacional.';
  END IF;
  SELECT value INTO v_cfg FROM public.settings WHERE key = 'operacional_parametros';
  v_parada := coalesce((v_cfg->>'dias_parada')::int, 5);
  v_prioridade := coalesce((v_cfg->>'faixa_prioridade')::int, 16);
  v_semana := public.operacional_semana(v_hoje);
  v_ant := public.operacional_semana(v_hoje - 7);

  RETURN jsonb_build_object(
    'hoje', jsonb_build_object(
      'aguardando_validacao', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'enviado_validacao'),
      'correcao_solicitada', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'correcao_solicitada'),
      'validados_hoje', (SELECT count(*) FROM public.producao_tecnica
        WHERE status = 'validado' AND (validado_em AT TIME ZONE 'America/Manaus')::date = v_hoje),
      'rejeitados', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'rejeitado'),
      'sem_tecnico', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id IS NULL),
      'sem_tipo', (SELECT count(*) FROM public.producao_tecnica
        WHERE tipo_servico_id IS NULL AND status IN ('enviado_validacao','correcao_solicitada'))
    ),
    'semana', v_semana,
    'semana_anterior', v_ant,
    'comissoes', jsonb_build_object(
      'geradas', (SELECT count(*) FROM public.comissoes WHERE status IN ('gerada','pendente_conferencia')),
      'conferidas', (SELECT count(*) FROM public.comissoes WHERE status = 'conferida'),
      'liberadas', (SELECT count(*) FROM public.comissoes WHERE status = 'aprovada'),
      'devolvidas', (SELECT count(*) FROM public.comissoes WHERE status::text = 'devolvida'),
      'pagas_mes', (SELECT count(*) FROM public.comissoes WHERE status = 'paga'
        AND data_referencia >= date_trunc('month', v_hoje)::date),
      'valor_liberado', (SELECT coalesce(sum(coalesce(valor_aprovado, valor_final)), 0)
        FROM public.comissoes WHERE status = 'aprovada')
    ),
    'estoque', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT m.id AS motivo_id, m.nome AS motivo, count(*)::int AS total
        FROM public.pendencias_operacionais p
        JOIN public.motivos_pendencia m ON m.id = p.motivo_id
        WHERE p.status = 'aberta'
        GROUP BY m.id, m.nome ORDER BY count(*) DESC) x), '[]'::jsonb),
    'parametros', jsonb_build_object('dias_parada', v_parada, 'faixa_prioridade', v_prioridade),
    'alertas', public.operacional_alertas()
  );
END $$;

CREATE OR REPLACE FUNCTION public.operacional_alertas()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (timezone('America/Manaus', now()))::date;
  v_cfg jsonb; v_parada int; v_prioridade int;
  v_out jsonb := '[]'::jsonb; v_n int; v_ini_ant date; v_total int; v_top record;
BEGIN
  IF NOT public.operacional_pode('visualizar') THEN
    RAISE EXCEPTION 'Você não tem acesso à Central Operacional.';
  END IF;
  SELECT value INTO v_cfg FROM public.settings WHERE key = 'operacional_parametros';
  v_parada := coalesce((v_cfg->>'dias_parada')::int, 5);
  v_prioridade := coalesce((v_cfg->>'faixa_prioridade')::int, 16);
  v_ini_ant := public.operacional_semana_inicio(v_hoje) - 7;

  SELECT count(*) INTO v_n FROM public.pendencias_operacionais
    WHERE status = 'aberta' AND (v_hoje - data_entrada) >= v_prioridade;
  IF v_n > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','critico','tipo','envelhecimento',
      'mensagem', format('%s TVs há mais de %s dias na ITV.', v_n, v_prioridade)));
  END IF;

  SELECT count(*) INTO v_n FROM public.pendencias_operacionais
    WHERE status = 'aberta' AND ultima_movimentacao < now() - make_interval(days => v_parada);
  IF v_n > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','critico','tipo','paradas',
      'mensagem', format('%s TVs sem atualização há mais de %s dias.', v_n, v_parada)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.fechamentos_operacionais_semanais
                 WHERE inicio_periodo = v_ini_ant AND status = 'fechado') THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','critico','tipo','fechamento',
      'mensagem', 'Fechamento da semana anterior pendente.'));
  END IF;

  SELECT count(*) INTO v_n FROM public.producao_tecnica WHERE status = 'enviado_validacao';
  IF v_n > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','atencao','tipo','validacao',
      'mensagem', format('%s serviços aguardando validação.', v_n)));
  END IF;

  SELECT count(*) INTO v_n FROM public.comissoes WHERE status IN ('gerada','pendente_conferencia','conferida');
  IF v_n > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','atencao','tipo','comissoes',
      'mensagem', format('%s comissões aguardando liberação para o Financeiro.', v_n)));
  END IF;

  SELECT count(*) INTO v_n FROM public.comissoes WHERE status::text = 'devolvida';
  IF v_n > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','critico','tipo','devolucao',
      'mensagem', format('%s comissões devolvidas pelo Financeiro.', v_n)));
  END IF;

  SELECT count(*) INTO v_n FROM public.producao_tecnica
    WHERE tecnico_id IS NULL AND status IN ('enviado_validacao','correcao_solicitada');
  IF v_n > 0 THEN
    v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','atencao','tipo','sem_tecnico',
      'mensagem', format('%s serviços sem técnico definido.', v_n)));
  END IF;

  SELECT count(*) INTO v_total FROM public.pendencias_operacionais WHERE status = 'aberta';
  IF v_total >= 5 THEN
    SELECT m.nome AS nome, count(*)::int AS total INTO v_top
      FROM public.pendencias_operacionais p JOIN public.motivos_pendencia m ON m.id = p.motivo_id
      WHERE p.status = 'aberta' GROUP BY m.nome ORDER BY count(*) DESC LIMIT 1;
    IF v_top.total::numeric / v_total >= 0.4 THEN
      v_out := v_out || jsonb_build_array(jsonb_build_object('nivel','informativo','tipo','gargalo',
        'mensagem', format('%s%% das TVs pendentes estão em "%s".',
          round(v_top.total::numeric * 100 / v_total), v_top.nome)));
    END IF;
  END IF;

  RETURN v_out;
END $$;

-- Alterar técnico da produção (autoridade do gerente operacional)
CREATE OR REPLACE FUNCTION public.operacional_alterar_tecnico(p_producao_id uuid, p_tecnico_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ant uuid; v_status producao_status;
BEGIN
  IF NOT public.operacional_pode('atribuir') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para alterar o técnico.');
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo da alteração de técnico.');
  END IF;
  SELECT tecnico_id, status INTO v_ant, v_status FROM public.producao_tecnica WHERE id = p_producao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Registro de produção não encontrado.');
  END IF;
  IF v_status = 'validado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Serviço já validado. Solicite correção antes de alterar o técnico.');
  END IF;
  IF p_tecnico_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Selecione o técnico responsável.');
  END IF;
  UPDATE public.producao_tecnica SET tecnico_id = p_tecnico_id, updated_at = now() WHERE id = p_producao_id;
  INSERT INTO public.producao_tecnico_alteracoes (producao_id, tecnico_anterior, tecnico_novo, motivo, usuario_id)
  VALUES (p_producao_id, v_ant, p_tecnico_id, btrim(p_motivo), auth.uid());
  PERFORM public.registrar_auditoria('operacional', 'alterar_tecnico',
    jsonb_build_object('tecnico', v_ant),
    jsonb_build_object('producao_id', p_producao_id, 'tecnico', p_tecnico_id, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Liberar comissões para o Financeiro (lote)
CREATE OR REPLACE FUNCTION public.operacional_comissoes_liberar(p_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_ok int := 0; v_erros jsonb := '[]'::jsonb; v_c public.comissoes%rowtype;
BEGIN
  IF NOT public.operacional_pode('aprovar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para liberar comissões.');
  END IF;
  FOREACH v_id IN ARRAY coalesce(p_ids, '{}'::uuid[]) LOOP
    SELECT * INTO v_c FROM public.comissoes WHERE id = v_id;
    IF NOT FOUND THEN
      v_erros := v_erros || jsonb_build_array('Comissão não encontrada.');
      CONTINUE;
    END IF;
    IF v_c.valor_final IS NULL THEN
      v_erros := v_erros || jsonb_build_array(format('OS %s sem valor calculado.', v_c.os));
      CONTINUE;
    END IF;
    IF v_c.status::text NOT IN ('gerada','pendente_conferencia','conferida','devolvida') THEN
      v_erros := v_erros || jsonb_build_array(format('OS %s não pode ser liberada no status atual.', v_c.os));
      CONTINUE;
    END IF;
    UPDATE public.comissoes SET status = 'aprovada', aprovada_em = now(), aprovada_por = auth.uid(),
      liberada_em = now(), liberada_por = auth.uid(), valor_aprovado = valor_final,
      motivo_devolucao = NULL, updated_by = auth.uid()
    WHERE id = v_id;
    v_ok := v_ok + 1;
    PERFORM public.registrar_auditoria('operacional', 'comissao_liberar', to_jsonb(v_c),
      (SELECT to_jsonb(c) FROM public.comissoes c WHERE c.id = v_id));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'liberadas', v_ok, 'erros', v_erros);
END $$;

-- Devolução pelo Financeiro
CREATE OR REPLACE FUNCTION public.comissoes_devolver(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c public.comissoes%rowtype;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'comissoes', 'pagar')
          OR public.has_role(auth.uid(), 'administrador')) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Somente o Financeiro pode devolver comissões.');
  END IF;
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo da devolução.');
  END IF;
  SELECT * INTO v_c FROM public.comissoes WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Comissão não encontrada.');
  END IF;
  IF v_c.status <> 'aprovada' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Só é possível devolver comissões liberadas e ainda não pagas.');
  END IF;
  UPDATE public.comissoes SET status = 'devolvida', devolvida_em = now(), devolvida_por = auth.uid(),
    motivo_devolucao = btrim(p_motivo), aprovada_em = NULL, aprovada_por = NULL,
    valor_aprovado = NULL, updated_by = auth.uid()
  WHERE id = p_id;
  PERFORM public.registrar_auditoria('comissoes', 'devolver', to_jsonb(v_c),
    (SELECT to_jsonb(c) FROM public.comissoes c WHERE c.id = p_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Responsabilidade por técnico
CREATE OR REPLACE FUNCTION public.operacional_por_tecnico(p_ini date, p_fim date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.operacional_pode('visualizar') THEN
    RAISE EXCEPTION 'Você não tem acesso à Central Operacional.';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x.tecnico)
    FROM (
      SELECT pr.full_name AS tecnico, pr.id AS tecnico_id,
        count(*) FILTER (WHERE pt.status = 'enviado_validacao')::int AS enviados,
        count(*) FILTER (WHERE pt.status = 'validado')::int AS validados,
        count(*) FILTER (WHERE pt.status = 'rejeitado')::int AS rejeitados,
        count(*) FILTER (WHERE pt.status = 'correcao_solicitada')::int AS correcoes,
        coalesce(sum(pt.valor_servico) FILTER (WHERE pt.status = 'validado'), 0) AS producao_validada,
        (SELECT count(*)::int FROM public.pendencias_operacionais po
           WHERE po.tecnico_id = pr.id AND po.status = 'aberta') AS tvs_responsabilidade,
        (SELECT count(*)::int FROM public.pendencias_operacionais po
           WHERE po.tecnico_id = pr.id AND po.status = 'aberta'
             AND po.ultima_movimentacao < now() - interval '5 day') AS tvs_paradas
      FROM public.producao_tecnica pt
      JOIN public.profiles pr ON pr.id = pt.tecnico_id
      WHERE pt.data_execucao BETWEEN p_ini AND p_fim
      GROUP BY pr.id, pr.full_name
    ) x), '[]'::jsonb);
END $$;

-- Relatório executivo da semana
CREATE OR REPLACE FUNCTION public.operacional_relatorio_semana(p_ref date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; v_ini date; v_fim date;
BEGIN
  IF NOT public.operacional_pode('relatorios') THEN
    RAISE EXCEPTION 'Você não tem permissão para gerar relatórios operacionais.';
  END IF;
  v := public.operacional_semana(p_ref);
  v_ini := (v->>'inicio')::date; v_fim := (v->>'fim')::date;
  RETURN v || jsonb_build_object(
    'servicos_validados', (SELECT count(*) FROM public.producao_tecnica
      WHERE status = 'validado' AND (validado_em AT TIME ZONE 'America/Manaus')::date BETWEEN v_ini AND v_fim),
    'comissoes_liberadas', (SELECT count(*) FROM public.comissoes
      WHERE liberada_em IS NOT NULL AND (liberada_em AT TIME ZONE 'America/Manaus')::date BETWEEN v_ini AND v_fim),
    'valor_comissoes_liberadas', (SELECT coalesce(sum(coalesce(valor_aprovado, valor_final)), 0) FROM public.comissoes
      WHERE liberada_em IS NOT NULL AND (liberada_em AT TIME ZONE 'America/Manaus')::date BETWEEN v_ini AND v_fim),
    'tvs_criticas', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT p.os, p.cliente, p.marca, p.modelo, p.polegadas, m.nome AS motivo,
               ((timezone('America/Manaus', now()))::date - p.data_entrada) AS dias
        FROM public.pendencias_operacionais p JOIN public.motivos_pendencia m ON m.id = p.motivo_id
        WHERE p.status = 'aberta'
          AND ((timezone('America/Manaus', now()))::date - p.data_entrada) >= 15
        ORDER BY p.data_entrada LIMIT 50) x), '[]'::jsonb));
END $$;

-- Grants das funções
REVOKE ALL ON FUNCTION public.operacional_pode(permission_action) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_semana_inicio(date) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_entregas_periodo(date, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_semana(date) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_entradas_registrar(date, integer, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_pendencia_salvar(date, text, uuid, text, uuid, date, text, text, text, integer, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_pendencia_remover(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_fechar_semana(date) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_reabrir_semana(date, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_historico(integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_dashboard() FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_alertas() FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_alterar_tecnico(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_comissoes_liberar(uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.comissoes_devolver(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_por_tecnico(date, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.operacional_relatorio_semana(date) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.operacional_pode(permission_action) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_semana_inicio(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_entregas_periodo(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_semana(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_entradas_registrar(date, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_pendencia_salvar(date, text, uuid, text, uuid, date, text, text, text, integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_pendencia_remover(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_fechar_semana(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_reabrir_semana(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_historico(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_alertas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_alterar_tecnico(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_comissoes_liberar(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.comissoes_devolver(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_por_tecnico(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operacional_relatorio_semana(date) TO authenticated;
