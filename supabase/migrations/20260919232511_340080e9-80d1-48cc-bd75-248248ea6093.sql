
-- 1) Caixa Diário para o ADM Operacional (sem abrir o Financeiro)
INSERT INTO public.role_permissions(role, module_key, action)
VALUES
  ('adm_operacional','caixa','visualizar'),
  ('adm_operacional','caixa','criar'),
  ('adm_operacional','caixa','exportar')
ON CONFLICT DO NOTHING;

-- 2) Devolução do Financeiro para o Operacional
ALTER TABLE public.terceirizados_lotes
  ADD COLUMN IF NOT EXISTS devolvido_por uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS devolvido_em timestamptz,
  ADD COLUMN IF NOT EXISTS devolvido_motivo text;

-- 3) Status financeiro derivado (nunca duplica dado: lê a conta a pagar oficial)
CREATE OR REPLACE FUNCTION public.terceirizados_status_financeiro(_lote public.terceirizados_lotes)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _lote.status = 'cancelado' THEN 'cancelado'
    WHEN _lote.devolvido_em IS NOT NULL AND _lote.conta_pagar_id IS NULL THEN 'devolvido'
    WHEN _lote.conta_pagar_id IS NULL THEN 'nao_liberado'
    ELSE coalesce((
      SELECT CASE cp.status::text
               WHEN 'pago' THEN 'pago'
               WHEN 'parcialmente_pago' THEN 'em_pagamento'
               WHEN 'cancelado' THEN 'cancelado'
               ELSE 'em_analise'
             END
        FROM public.contas_pagar cp WHERE cp.id = _lote.conta_pagar_id), 'liberado')
  END
$$;

-- 4) Histórico do lote (timeline) montado a partir dos registros oficiais
CREATE OR REPLACE FUNCTION public.terceirizados_lote_historico(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_l public.terceirizados_lotes%rowtype; v jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_l FROM public.terceirizados_lotes WHERE id = p_id;
  IF NOT FOUND THEN RETURN v; END IF;

  v := v || jsonb_build_object('em', v_l.created_at, 'titulo', 'Lote criado',
        'quem', (SELECT full_name FROM public.profiles WHERE id = v_l.created_by));

  IF v_l.confirmed_at IS NOT NULL THEN
    v := v || jsonb_build_object('em', v_l.confirmed_at, 'titulo', 'Lote confirmado pelo Gerente Operacional',
          'quem', (SELECT full_name FROM public.profiles WHERE id = v_l.confirmed_by));
  END IF;

  IF v_l.released_to_finance_at IS NOT NULL THEN
    v := v || jsonb_build_object('em', v_l.released_to_finance_at, 'titulo', 'Liberado para o Financeiro',
          'quem', (SELECT full_name FROM public.profiles WHERE id = v_l.released_to_finance_by));
  END IF;

  IF v_l.devolvido_em IS NOT NULL THEN
    v := v || jsonb_build_object('em', v_l.devolvido_em, 'titulo', 'Devolvido pelo Financeiro',
          'quem', (SELECT full_name FROM public.profiles WHERE id = v_l.devolvido_por),
          'detalhe', v_l.devolvido_motivo);
  END IF;

  IF v_l.conta_pagar_id IS NOT NULL THEN
    v := v || coalesce((
      SELECT jsonb_agg(jsonb_build_object('em', pg.created_at,
               'titulo', 'Pagamento registrado no Financeiro',
               'detalhe', to_char(pg.valor_pago, 'FM999G999D00'))
               ORDER BY pg.created_at)
        FROM public.contas_pagar_pagamentos pg WHERE pg.conta_pagar_id = v_l.conta_pagar_id), '[]'::jsonb);
  END IF;

  IF v_l.cancelled_at IS NOT NULL THEN
    v := v || jsonb_build_object('em', v_l.cancelled_at, 'titulo', 'Lote cancelado',
          'quem', (SELECT full_name FROM public.profiles WHERE id = v_l.cancelled_by),
          'detalhe', v_l.cancel_reason);
  END IF;

  RETURN v;
END $$;

-- 5) Liberar: resposta completa para o gerente saber o que foi enviado
CREATE OR REPLACE FUNCTION public.terceirizados_lote_liberar(p_id uuid, p_vencimento date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_l public.terceirizados_lotes%rowtype; v_conta uuid; v_nome text; v_quem text; v_quando timestamptz;
BEGIN
  IF NOT public.terceirizados_pode('aprovar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem permissão para liberar lotes ao Financeiro.');
  END IF;
  SELECT * INTO v_l FROM public.terceirizados_lotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Lote não encontrado.'); END IF;
  SELECT nome INTO v_nome FROM public.fornecedores WHERE id = v_l.prestador_id;

  IF v_l.conta_pagar_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true, 'conta_pagar_id', v_l.conta_pagar_id,
      'prestador', v_nome, 'competencia', v_l.competencia, 'quantidade', v_l.quantidade_itens,
      'valor', v_l.valor_total,
      'liberado_por', (SELECT full_name FROM public.profiles WHERE id = v_l.released_to_finance_by),
      'liberado_em', v_l.released_to_finance_at);
  END IF;
  IF v_l.status <> 'confirmado' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Somente lotes confirmados podem ser liberados.');
  END IF;
  IF v_l.quantidade_itens = 0 OR v_l.valor_total <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Lote sem valor a pagar.');
  END IF;

  INSERT INTO public.contas_pagar(descricao, fornecedor_id, competencia, data_emissao, vencimento,
    valor_original, status, observacao, responsavel_id, created_by)
  VALUES (format('Serviços terceirizados — %s (%s)', coalesce(v_nome,'Prestador'),
            to_char(v_l.competencia, 'MM/YYYY')),
    v_l.prestador_id, v_l.competencia, (now() AT TIME ZONE 'America/Manaus')::date,
    coalesce(p_vencimento, (now() AT TIME ZONE 'America/Manaus')::date + 7),
    v_l.valor_total, 'pendente',
    format('Lote de %s serviço(s) terceirizado(s).', v_l.quantidade_itens), auth.uid(), auth.uid())
  RETURNING id INTO v_conta;

  v_quando := now();
  UPDATE public.terceirizados_lotes
     SET status = 'liberado_financeiro', conta_pagar_id = v_conta,
         released_to_finance_by = auth.uid(), released_to_finance_at = v_quando,
         devolvido_em = NULL, devolvido_por = NULL, devolvido_motivo = NULL
   WHERE id = p_id;

  SELECT full_name INTO v_quem FROM public.profiles WHERE id = auth.uid();

  PERFORM public.registrar_auditoria('terceirizados', 'lote_liberar_financeiro', to_jsonb(v_l),
    jsonb_build_object('lote_id', p_id, 'conta_pagar_id', v_conta, 'total', v_l.valor_total,
      'quantidade', v_l.quantidade_itens));

  RETURN jsonb_build_object('ok', true, 'conta_pagar_id', v_conta, 'prestador', v_nome,
    'competencia', v_l.competencia, 'quantidade', v_l.quantidade_itens, 'valor', v_l.valor_total,
    'liberado_por', v_quem, 'liberado_em', v_quando, 'financeiro_status', 'em_analise');
END $function$;

-- 6) Financeiro devolve o lote ao Operacional (exige motivo)
CREATE OR REPLACE FUNCTION public.terceirizados_lote_devolver(p_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_l public.terceirizados_lotes%rowtype; v_pago numeric;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'financeiro', 'editar'::public.permission_action) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Somente o Financeiro pode devolver o lote.');
  END IF;
  IF coalesce(length(btrim(p_motivo)), 0) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Informe o motivo da devolução.');
  END IF;

  SELECT * INTO v_l FROM public.terceirizados_lotes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Lote não encontrado.'); END IF;
  IF v_l.conta_pagar_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Este lote ainda não foi liberado ao Financeiro.');
  END IF;

  SELECT coalesce(sum(valor_pago), 0) INTO v_pago
    FROM public.contas_pagar_pagamentos WHERE conta_pagar_id = v_l.conta_pagar_id;
  IF v_pago > 0 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Lote com pagamento registrado não pode ser devolvido.');
  END IF;

  UPDATE public.contas_pagar SET status = 'cancelado',
      observacao = coalesce(observacao,'') || format(' | Devolvido ao Operacional: %s', btrim(p_motivo))
   WHERE id = v_l.conta_pagar_id;

  UPDATE public.terceirizados_lotes
     SET status = 'confirmado', conta_pagar_id = NULL,
         released_to_finance_by = NULL, released_to_finance_at = NULL,
         devolvido_por = auth.uid(), devolvido_em = now(), devolvido_motivo = btrim(p_motivo)
   WHERE id = p_id;

  PERFORM public.registrar_auditoria('terceirizados', 'lote_devolver_operacional', to_jsonb(v_l),
    jsonb_build_object('lote_id', p_id, 'motivo', btrim(p_motivo)));

  RETURN jsonb_build_object('ok', true, 'message', 'Lote devolvido ao Operacional.');
END $function$;

-- 7) Detalhe com status financeiro, devolução e histórico
CREATE OR REPLACE FUNCTION public.terceirizados_lote_detalhe(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lote jsonb; v_itens jsonb; v_row public.terceirizados_lotes%rowtype;
BEGIN
  IF NOT public.terceirizados_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem acesso aos serviços terceirizados.');
  END IF;
  SELECT * INTO v_row FROM public.terceirizados_lotes WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'message', 'Lote não encontrado.'); END IF;

  SELECT to_jsonb(x) INTO v_lote FROM (
    SELECT l.*, l.status::text AS status, f.nome AS prestador,
           pc.full_name AS criado_por, pf.full_name AS confirmado_por, pl.full_name AS liberado_por,
           pd.full_name AS devolvido_por_nome,
           public.terceirizados_status_financeiro(l.*) AS financeiro_status
      FROM public.terceirizados_lotes l
      JOIN public.fornecedores f ON f.id = l.prestador_id
      LEFT JOIN public.profiles pc ON pc.id = l.created_by
      LEFT JOIN public.profiles pf ON pf.id = l.confirmed_by
      LEFT JOIN public.profiles pl ON pl.id = l.released_to_finance_by
      LEFT JOIN public.profiles pd ON pd.id = l.devolvido_por
     WHERE l.id = p_id) x;

  SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.data_execucao NULLS LAST, i.created_at), '[]'::jsonb)
    INTO v_itens FROM public.terceirizados_lote_itens i WHERE i.lote_id = p_id;

  RETURN jsonb_build_object('ok', true, 'lote', v_lote, 'itens', v_itens,
    'historico', public.terceirizados_lote_historico(p_id));
END $function$;

-- 8) Listagem com a coluna Financeiro
CREATE OR REPLACE FUNCTION public.terceirizados_lotes_listar(p_prestador_id uuid DEFAULT NULL::uuid, p_competencia date DEFAULT NULL::date, p_status text DEFAULT NULL::text, p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF NOT public.terceirizados_pode('visualizar') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Você não tem acesso aos serviços terceirizados.');
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC), '[]'::jsonb) INTO v FROM (
    SELECT l.id, l.competencia, l.descricao, l.origem_lote, l.quantidade_itens, l.valor_total,
           l.total_esperado, l.status::text AS status, l.teste, l.created_at, l.conta_pagar_id,
           l.devolvido_motivo, l.devolvido_em,
           public.terceirizados_status_financeiro(l.*) AS financeiro_status,
           f.nome AS prestador, l.prestador_id
      FROM public.terceirizados_lotes l
      JOIN public.fornecedores f ON f.id = l.prestador_id
     WHERE (p_prestador_id IS NULL OR l.prestador_id = p_prestador_id)
       AND (p_competencia IS NULL OR l.competencia = p_competencia)
       AND (p_status IS NULL OR l.status::text = p_status)
       AND (p_inicio IS NULL OR l.created_at >= p_inicio::timestamptz)
       AND (p_fim IS NULL OR l.created_at < (p_fim::timestamptz + interval '1 day'))
  ) x;
  RETURN jsonb_build_object('ok', true, 'lotes', v);
END $function$;
