
-- ============ ENUM ============
DO $$ BEGIN
  CREATE TYPE public.terceirizado_lote_status AS ENUM
    ('rascunho','em_validacao','aguardando_confirmacao','confirmado','liberado_financeiro','parcialmente_pago','pago','cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ TABELAS ============
CREATE TABLE public.terceirizados_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prestador_id uuid NOT NULL REFERENCES public.fornecedores(id),
  competencia date NOT NULL,
  descricao text,
  origem_lote text NOT NULL DEFAULT 'manual',
  arquivo_original text,
  quantidade_itens integer NOT NULL DEFAULT 0,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  total_esperado numeric(12,2),
  status public.terceirizado_lote_status NOT NULL DEFAULT 'confirmado',
  conta_pagar_id uuid REFERENCES public.contas_pagar(id),
  idempotency_key text UNIQUE,
  teste boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by uuid,
  confirmed_at timestamptz,
  released_to_finance_by uuid,
  released_to_finance_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  cancel_reason text
);

CREATE TABLE public.terceirizados_lote_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id uuid NOT NULL REFERENCES public.terceirizados_lotes(id) ON DELETE CASCADE,
  prestador_id uuid NOT NULL REFERENCES public.fornecedores(id),
  os text,
  referencia text,
  data_execucao date,
  marca text,
  modelo text,
  polegadas numeric(5,1),
  tipo_servico text,
  descricao_servico text NOT NULL,
  valor_devido_prestador numeric(12,2) NOT NULL DEFAULT 0,
  observacao text,
  ajuste_manual boolean NOT NULL DEFAULT false,
  duplicidade_autorizada boolean NOT NULL DEFAULT false,
  motivo_duplicidade text,
  status text NOT NULL DEFAULT 'ativo',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT terceirizados_item_valor_nao_negativo CHECK (valor_devido_prestador >= 0),
  CONSTRAINT terceirizados_item_referencia CHECK (coalesce(os,'') <> '' OR coalesce(referencia,'') <> '')
);

CREATE INDEX idx_terc_lotes_prestador ON public.terceirizados_lotes(prestador_id, competencia);
CREATE INDEX idx_terc_lotes_status ON public.terceirizados_lotes(status);
CREATE INDEX idx_terc_itens_lote ON public.terceirizados_lote_itens(lote_id);
CREATE INDEX idx_terc_itens_os ON public.terceirizados_lote_itens(os);
CREATE INDEX idx_terc_itens_dup ON public.terceirizados_lote_itens(prestador_id, os, data_execucao, valor_devido_prestador);

GRANT SELECT ON public.terceirizados_lotes TO authenticated;
GRANT SELECT ON public.terceirizados_lote_itens TO authenticated;
GRANT ALL ON public.terceirizados_lotes TO service_role;
GRANT ALL ON public.terceirizados_lote_itens TO service_role;

ALTER TABLE public.terceirizados_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terceirizados_lote_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Terceirizados: leitura autorizada"
  ON public.terceirizados_lotes FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'terceirizados', 'visualizar'::public.permission_action));

CREATE POLICY "Terceirizados itens: leitura autorizada"
  ON public.terceirizados_lote_itens FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'terceirizados', 'visualizar'::public.permission_action));

CREATE TRIGGER trg_terc_lotes_updated BEFORE UPDATE ON public.terceirizados_lotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_terc_itens_updated BEFORE UPDATE ON public.terceirizados_lote_itens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ MÓDULO E PERMISSÕES ============
INSERT INTO public.modules(key, label, sort_order)
VALUES ('terceirizados', 'Serviços Terceirizados', 62)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions(role, module_key, action)
SELECT r::public.app_role, 'terceirizados', a::public.permission_action
FROM (VALUES ('administrador'),('adm_operacional')) AS roles(r),
     (VALUES ('visualizar'),('criar'),('editar'),('validar'),('aprovar'),('cancelar')) AS acts(a)
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role, module_key, action)
VALUES ('adm_financeiro','terceirizados','visualizar')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.terceirizados_pode(_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_permission(auth.uid(), 'terceirizados', _action::public.permission_action)
$$;

-- ============ VALIDAÇÃO (PRÉVIA — NÃO GRAVA NADA) ============
CREATE OR REPLACE FUNCTION public.terceirizados_lote_validar(
  p_prestador_id uuid,
  p_competencia date,
  p_itens jsonb,
  p_total_esperado numeric DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item jsonb; v_out jsonb := '[]'::jsonb; v_i int := 0;
  v_total numeric(12,2) := 0; v_erros int := 0; v_dup int := 0; v_dup_exata int := 0; v_aten int := 0;
  v_msgs jsonb; v_situacao text; v_data date; v_valor numeric(12,2);
  v_os text; v_ref text; v_desc text; v_dupref jsonb; v_existe record;
BEGIN
  IF NOT public.terceirizados_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem acesso aos serviços terceirizados.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fornecedores WHERE id = p_prestador_id AND ativo) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Selecione um prestador válido e ativo.');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_itens,'[]'::jsonb)) LOOP
    v_i := v_i + 1; v_msgs := '[]'::jsonb; v_situacao := 'ok'; v_dupref := NULL;
    v_os := nullif(btrim(coalesce(v_item->>'os','')), '');
    v_ref := nullif(btrim(coalesce(v_item->>'referencia','')), '');
    v_desc := nullif(btrim(coalesce(v_item->>'descricao_servico','')), '');

    BEGIN v_data := nullif(v_item->>'data_execucao','')::date;
    EXCEPTION WHEN others THEN v_data := NULL; v_msgs := v_msgs || to_jsonb('Data inválida.'::text); END;

    BEGIN v_valor := round(coalesce(nullif(v_item->>'valor','')::numeric, 0), 2);
    EXCEPTION WHEN others THEN v_valor := NULL; v_msgs := v_msgs || to_jsonb('Valor inválido.'::text); END;

    IF v_os IS NULL AND v_ref IS NULL THEN
      v_msgs := v_msgs || to_jsonb('Informe a OS ou uma referência complementar.'::text);
    END IF;
    IF v_desc IS NULL THEN
      v_msgs := v_msgs || to_jsonb('Descreva o serviço realizado.'::text);
    END IF;
    IF v_valor IS NULL THEN
      NULL;
    ELSIF v_valor < 0 THEN
      v_msgs := v_msgs || to_jsonb('O valor não pode ser negativo.'::text);
    ELSIF v_valor = 0 THEN
      v_msgs := v_msgs || to_jsonb('Valor zerado — confira antes de confirmar.'::text);
      v_situacao := 'atencao';
    END IF;

    IF v_data IS NOT NULL THEN
      IF v_data > (now() AT TIME ZONE 'America/Manaus')::date THEN
        v_msgs := v_msgs || to_jsonb('Data no futuro.'::text); v_situacao := 'atencao';
      ELSIF v_data < date '2015-01-01' THEN
        v_msgs := v_msgs || to_jsonb('Data muito antiga.'::text); v_situacao := 'atencao';
      ELSIF p_competencia IS NOT NULL AND date_trunc('month', v_data) <> date_trunc('month', p_competencia) THEN
        v_msgs := v_msgs || to_jsonb('Data fora da competência informada.'::text); v_situacao := 'atencao';
      END IF;
    ELSE
      v_msgs := v_msgs || to_jsonb('Data do serviço não informada.'::text); v_situacao := 'atencao';
    END IF;

    -- Duplicidade contra o que já existe no sistema
    SELECT i.id, i.os, i.referencia, i.descricao_servico, i.valor_devido_prestador, i.data_execucao, l.competencia
      INTO v_existe
      FROM public.terceirizados_lote_itens i
      JOIN public.terceirizados_lotes l ON l.id = i.lote_id
     WHERE i.prestador_id = p_prestador_id
       AND i.status = 'ativo'
       AND l.status <> 'cancelado'
       AND coalesce(i.os,'') = coalesce(v_os,'')
       AND coalesce(i.referencia,'') = coalesce(v_ref,'')
       AND i.data_execucao IS NOT DISTINCT FROM v_data
       AND i.valor_devido_prestador = coalesce(v_valor, -1)
       AND lower(coalesce(i.descricao_servico,'')) = lower(coalesce(v_desc,''))
     LIMIT 1;
    IF FOUND THEN
      v_situacao := 'duplicidade_exata';
      v_msgs := v_msgs || to_jsonb('Registro idêntico já existe no sistema.'::text);
      v_dupref := to_jsonb(v_existe);
    ELSE
      SELECT i.id, i.os, i.referencia, i.descricao_servico, i.valor_devido_prestador, i.data_execucao, l.competencia
        INTO v_existe
        FROM public.terceirizados_lote_itens i
        JOIN public.terceirizados_lotes l ON l.id = i.lote_id
       WHERE i.prestador_id = p_prestador_id
         AND i.status = 'ativo'
         AND l.status <> 'cancelado'
         AND ( (v_os IS NOT NULL AND i.os = v_os) OR (v_ref IS NOT NULL AND lower(i.referencia) = lower(v_ref)) )
         AND ( i.valor_devido_prestador = coalesce(v_valor,-1)
               OR i.data_execucao IS NOT DISTINCT FROM v_data
               OR lower(coalesce(i.descricao_servico,'')) = lower(coalesce(v_desc,'')) )
       LIMIT 1;
      IF FOUND THEN
        v_situacao := 'duplicidade';
        v_msgs := v_msgs || to_jsonb('Já existe um serviço semelhante para este prestador.'::text);
        v_dupref := to_jsonb(v_existe);
      END IF;
    END IF;

    -- Duplicidade dentro do próprio lote
    IF v_situacao NOT IN ('duplicidade_exata') AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS t(o, n)
       WHERE n < v_i
         AND coalesce(nullif(btrim(o->>'os',''),''),'') = coalesce(v_os,'')
         AND coalesce(nullif(btrim(o->>'referencia',''),''),'') = coalesce(v_ref,'')
         AND coalesce(o->>'data_execucao','') = coalesce(v_data::text,'')
         AND lower(coalesce(o->>'descricao_servico','')) = lower(coalesce(v_desc,''))
    ) THEN
      v_situacao := 'duplicidade';
      v_msgs := v_msgs || to_jsonb('Linha repetida dentro deste próprio lote.'::text);
    END IF;

    IF jsonb_array_length(v_msgs) > 0 AND v_situacao = 'ok' THEN v_situacao := 'atencao'; END IF;
    IF v_valor IS NULL OR v_desc IS NULL OR (v_os IS NULL AND v_ref IS NULL) OR (v_valor IS NOT NULL AND v_valor < 0) THEN
      v_situacao := 'erro';
    END IF;

    IF v_situacao = 'erro' THEN v_erros := v_erros + 1;
    ELSIF v_situacao = 'duplicidade_exata' THEN v_dup_exata := v_dup_exata + 1;
    ELSIF v_situacao = 'duplicidade' THEN v_dup := v_dup + 1;
    ELSIF v_situacao = 'atencao' THEN v_aten := v_aten + 1; END IF;

    IF v_situacao <> 'erro' THEN v_total := v_total + coalesce(v_valor,0); END IF;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'linha', v_i, 'os', v_os, 'referencia', v_ref, 'data_execucao', v_data,
      'marca', nullif(btrim(coalesce(v_item->>'marca','')),''),
      'modelo', nullif(btrim(coalesce(v_item->>'modelo','')),''),
      'polegadas', nullif(v_item->>'polegadas','')::numeric,
      'tipo_servico', nullif(btrim(coalesce(v_item->>'tipo_servico','')),''),
      'descricao_servico', v_desc, 'valor', v_valor,
      'observacao', nullif(btrim(coalesce(v_item->>'observacao','')),''),
      'situacao', v_situacao, 'mensagens', v_msgs, 'similar', v_dupref
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'itens', v_out,
    'quantidade', v_i,
    'total_calculado', v_total,
    'total_esperado', p_total_esperado,
    'diferenca', CASE WHEN p_total_esperado IS NULL THEN NULL ELSE round(p_total_esperado - v_total, 2) END,
    'conciliado', CASE WHEN p_total_esperado IS NULL THEN NULL ELSE (round(p_total_esperado - v_total, 2) = 0) END,
    'erros', v_erros, 'atencoes', v_aten,
    'duplicidades', v_dup, 'duplicidades_exatas', v_dup_exata,
    'pode_confirmar', (v_i > 0 AND v_erros = 0 AND v_dup_exata = 0
      AND (p_total_esperado IS NULL OR round(p_total_esperado - v_total, 2) = 0))
  );
END $$;

-- ============ CONFIRMAÇÃO (ATÔMICA + IDEMPOTENTE) ============
CREATE OR REPLACE FUNCTION public.terceirizados_lote_confirmar(
  p_prestador_id uuid,
  p_competencia date,
  p_itens jsonb,
  p_idempotency_key text,
  p_descricao text DEFAULT NULL,
  p_origem_lote text DEFAULT 'manual',
  p_total_esperado numeric DEFAULT NULL,
  p_teste boolean DEFAULT false,
  p_duplicidades jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prev jsonb; v_lote_id uuid; v_item jsonb; v_total numeric(12,2) := 0; v_qtd int := 0;
  v_motivo text; v_existente uuid;
BEGIN
  IF NOT public.terceirizados_pode('criar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para lançar serviços terceirizados.');
  END IF;
  IF coalesce(btrim(p_idempotency_key),'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Requisição inválida. Recarregue a página e tente novamente.');
  END IF;

  SELECT id INTO v_existente FROM public.terceirizados_lotes WHERE idempotency_key = p_idempotency_key;
  IF v_existente IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'lote_id', v_existente, 'repetido', true);
  END IF;

  v_prev := public.terceirizados_lote_validar(p_prestador_id, p_competencia, p_itens, p_total_esperado);
  IF (v_prev->>'ok')::boolean IS NOT TRUE THEN RETURN v_prev; END IF;
  IF (v_prev->>'erros')::int > 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Não foi possível validar todos os serviços. Revise os itens destacados.');
  END IF;
  IF (v_prev->>'duplicidades_exatas')::int > 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Há serviços idênticos já registrados. Ajuste os itens antes de confirmar.');
  END IF;
  IF p_total_esperado IS NOT NULL AND (v_prev->>'conciliado')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'message', 'O total informado não confere com a soma dos serviços.');
  END IF;
  IF (v_prev->>'duplicidades')::int > 0 THEN
    v_motivo := nullif(btrim(coalesce(p_duplicidades->>'motivo','')), '');
    IF v_motivo IS NULL OR length(v_motivo) < 3 THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo para registrar serviços marcados como possível duplicidade.');
    END IF;
  END IF;

  INSERT INTO public.terceirizados_lotes(
    prestador_id, competencia, descricao, origem_lote, total_esperado, idempotency_key,
    teste, status, created_by, confirmed_by, confirmed_at)
  VALUES (p_prestador_id, date_trunc('month', p_competencia)::date, nullif(btrim(coalesce(p_descricao,'')),''),
    coalesce(nullif(btrim(p_origem_lote),''),'manual'), p_total_esperado, p_idempotency_key,
    coalesce(p_teste,false), 'confirmado', auth.uid(), auth.uid(), now())
  RETURNING id INTO v_lote_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_prev->'itens') LOOP
    INSERT INTO public.terceirizados_lote_itens(
      lote_id, prestador_id, os, referencia, data_execucao, marca, modelo, polegadas,
      tipo_servico, descricao_servico, valor_devido_prestador, observacao,
      ajuste_manual, duplicidade_autorizada, motivo_duplicidade)
    VALUES (v_lote_id, p_prestador_id, v_item->>'os', v_item->>'referencia',
      nullif(v_item->>'data_execucao','')::date, v_item->>'marca', v_item->>'modelo',
      nullif(v_item->>'polegadas','')::numeric, v_item->>'tipo_servico',
      v_item->>'descricao_servico', round(coalesce(nullif(v_item->>'valor','')::numeric,0),2),
      v_item->>'observacao', false,
      (v_item->>'situacao') = 'duplicidade',
      CASE WHEN (v_item->>'situacao') = 'duplicidade' THEN v_motivo ELSE NULL END);
    v_qtd := v_qtd + 1;
    v_total := v_total + round(coalesce(nullif(v_item->>'valor','')::numeric,0),2);
  END LOOP;

  UPDATE public.terceirizados_lotes SET quantidade_itens = v_qtd, valor_total = v_total WHERE id = v_lote_id;

  PERFORM public.registrar_auditoria('terceirizados', 'lote_confirmar', NULL,
    jsonb_build_object('lote_id', v_lote_id, 'prestador_id', p_prestador_id, 'quantidade', v_qtd,
      'total', v_total, 'total_esperado', p_total_esperado, 'origem', p_origem_lote,
      'duplicidades_autorizadas', (v_prev->>'duplicidades')::int, 'motivo_duplicidade', v_motivo,
      'teste', coalesce(p_teste,false)));

  RETURN jsonb_build_object('ok', true, 'lote_id', v_lote_id, 'quantidade', v_qtd, 'total', v_total);
END $$;

-- ============ LIBERAÇÃO PARA O FINANCEIRO ============
CREATE OR REPLACE FUNCTION public.terceirizados_lote_liberar(
  p_id uuid, p_vencimento date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.terceirizados_lotes%rowtype; v_conta uuid; v_nome text;
BEGIN
  IF NOT public.terceirizados_pode('aprovar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para liberar lotes ao Financeiro.');
  END IF;
  SELECT * INTO v_l FROM public.terceirizados_lotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Lote não encontrado.'); END IF;
  IF v_l.conta_pagar_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true, 'conta_pagar_id', v_l.conta_pagar_id);
  END IF;
  IF v_l.status <> 'confirmado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Somente lotes confirmados podem ser liberados.');
  END IF;
  IF v_l.quantidade_itens = 0 OR v_l.valor_total <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Lote sem valor a pagar.');
  END IF;

  SELECT nome INTO v_nome FROM public.fornecedores WHERE id = v_l.prestador_id;

  INSERT INTO public.contas_pagar(descricao, fornecedor_id, competencia, data_emissao, vencimento,
    valor_original, status, observacao, created_by)
  VALUES (format('Serviços terceirizados — %s (%s)', coalesce(v_nome,'Prestador'),
            to_char(v_l.competencia, 'MM/YYYY')),
    v_l.prestador_id, v_l.competencia, (now() AT TIME ZONE 'America/Manaus')::date,
    coalesce(p_vencimento, (now() AT TIME ZONE 'America/Manaus')::date + 7),
    v_l.valor_total, 'pendente',
    format('Lote de %s serviço(s) terceirizado(s).', v_l.quantidade_itens), auth.uid())
  RETURNING id INTO v_conta;

  UPDATE public.terceirizados_lotes
     SET status = 'liberado_financeiro', conta_pagar_id = v_conta,
         released_to_finance_by = auth.uid(), released_to_finance_at = now()
   WHERE id = p_id;

  PERFORM public.registrar_auditoria('terceirizados', 'lote_liberar_financeiro', to_jsonb(v_l),
    jsonb_build_object('lote_id', p_id, 'conta_pagar_id', v_conta, 'total', v_l.valor_total));

  RETURN jsonb_build_object('ok', true, 'conta_pagar_id', v_conta);
END $$;

-- ============ CANCELAMENTO ============
CREATE OR REPLACE FUNCTION public.terceirizados_lote_cancelar(
  p_id uuid, p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l public.terceirizados_lotes%rowtype;
BEGIN
  IF NOT public.terceirizados_pode('cancelar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para cancelar lotes.');
  END IF;
  IF coalesce(btrim(p_motivo),'') = '' OR length(btrim(p_motivo)) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo do cancelamento.');
  END IF;
  SELECT * INTO v_l FROM public.terceirizados_lotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Lote não encontrado.'); END IF;
  IF v_l.status IN ('pago','parcialmente_pago','cancelado') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Este lote não pode mais ser cancelado por aqui.');
  END IF;

  IF v_l.conta_pagar_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos WHERE conta_id = v_l.conta_pagar_id) THEN
      RETURN jsonb_build_object('ok', false, 'message', 'Já existe pagamento vinculado. Use o fluxo de estorno do Financeiro.');
    END IF;
    UPDATE public.contas_pagar
       SET status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
           motivo_cancelamento = btrim(p_motivo)
     WHERE id = v_l.conta_pagar_id;
  END IF;

  UPDATE public.terceirizados_lote_itens SET status = 'cancelado' WHERE lote_id = p_id;
  UPDATE public.terceirizados_lotes
     SET status = 'cancelado', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = btrim(p_motivo)
   WHERE id = p_id;

  PERFORM public.registrar_auditoria('terceirizados', 'lote_cancelar', to_jsonb(v_l),
    jsonb_build_object('lote_id', p_id, 'motivo', btrim(p_motivo)));

  RETURN jsonb_build_object('ok', true);
END $$;

-- ============ LISTAGEM E DETALHE ============
CREATE OR REPLACE FUNCTION public.terceirizados_lotes_listar(
  p_prestador_id uuid DEFAULT NULL,
  p_competencia date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_inicio date DEFAULT NULL,
  p_fim date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.terceirizados_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem acesso aos serviços terceirizados.');
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT l.id, l.competencia, l.descricao, l.origem_lote, l.quantidade_itens, l.valor_total,
           l.total_esperado, l.status::text AS status, l.teste, l.created_at, l.conta_pagar_id,
           f.nome AS prestador, l.prestador_id
      FROM public.terceirizados_lotes l
      JOIN public.fornecedores f ON f.id = l.prestador_id
     WHERE (p_prestador_id IS NULL OR l.prestador_id = p_prestador_id)
       AND (p_competencia IS NULL OR l.competencia = date_trunc('month', p_competencia)::date)
       AND (p_status IS NULL OR l.status::text = p_status)
       AND (p_inicio IS NULL OR l.created_at >= p_inicio)
       AND (p_fim IS NULL OR l.created_at < (p_fim + 1))
     LIMIT 300
  ) x;
  RETURN jsonb_build_object('ok', true, 'lotes', v);
END $$;

CREATE OR REPLACE FUNCTION public.terceirizados_lote_detalhe(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lote jsonb; v_itens jsonb;
BEGIN
  IF NOT public.terceirizados_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem acesso aos serviços terceirizados.');
  END IF;
  SELECT to_jsonb(x) INTO v_lote FROM (
    SELECT l.*, l.status::text AS status, f.nome AS prestador,
           pc.full_name AS criado_por, pf.full_name AS confirmado_por, pl.full_name AS liberado_por
      FROM public.terceirizados_lotes l
      JOIN public.fornecedores f ON f.id = l.prestador_id
      LEFT JOIN public.profiles pc ON pc.id = l.created_by
      LEFT JOIN public.profiles pf ON pf.id = l.confirmed_by
      LEFT JOIN public.profiles pl ON pl.id = l.released_to_finance_by
     WHERE l.id = p_id) x;
  IF v_lote IS NULL THEN RETURN jsonb_build_object('ok', false, 'message', 'Lote não encontrado.'); END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.data_execucao NULLS LAST, i.created_at), '[]'::jsonb)
    INTO v_itens FROM public.terceirizados_lote_itens i WHERE i.lote_id = p_id;
  RETURN jsonb_build_object('ok', true, 'lote', v_lote, 'itens', v_itens);
END $$;

REVOKE ALL ON FUNCTION public.terceirizados_lote_validar(uuid, date, jsonb, numeric) FROM anon, public;
REVOKE ALL ON FUNCTION public.terceirizados_lote_confirmar(uuid, date, jsonb, text, text, text, numeric, boolean, jsonb) FROM anon, public;
REVOKE ALL ON FUNCTION public.terceirizados_lote_liberar(uuid, date) FROM anon, public;
REVOKE ALL ON FUNCTION public.terceirizados_lote_cancelar(uuid, text) FROM anon, public;
REVOKE ALL ON FUNCTION public.terceirizados_lotes_listar(uuid, date, text, date, date) FROM anon, public;
REVOKE ALL ON FUNCTION public.terceirizados_lote_detalhe(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.terceirizados_pode(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.terceirizados_lote_validar(uuid, date, jsonb, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terceirizados_lote_confirmar(uuid, date, jsonb, text, text, text, numeric, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terceirizados_lote_liberar(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terceirizados_lote_cancelar(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terceirizados_lotes_listar(uuid, date, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terceirizados_lote_detalhe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terceirizados_pode(text) TO authenticated;
