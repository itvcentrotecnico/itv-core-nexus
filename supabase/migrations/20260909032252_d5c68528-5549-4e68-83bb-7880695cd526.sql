
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
    valor_original, status, observacao, responsavel_id, created_by)
  VALUES (format('Serviços terceirizados — %s (%s)', coalesce(v_nome,'Prestador'),
            to_char(v_l.competencia, 'MM/YYYY')),
    v_l.prestador_id, v_l.competencia, (now() AT TIME ZONE 'America/Manaus')::date,
    coalesce(p_vencimento, (now() AT TIME ZONE 'America/Manaus')::date + 7),
    v_l.valor_total, 'pendente',
    format('Lote de %s serviço(s) terceirizado(s).', v_l.quantidade_itens), auth.uid(), auth.uid())
  RETURNING id INTO v_conta;

  UPDATE public.terceirizados_lotes
     SET status = 'liberado_financeiro', conta_pagar_id = v_conta,
         released_to_finance_by = auth.uid(), released_to_finance_at = now()
   WHERE id = p_id;

  PERFORM public.registrar_auditoria('terceirizados', 'lote_liberar_financeiro', to_jsonb(v_l),
    jsonb_build_object('lote_id', p_id, 'conta_pagar_id', v_conta, 'total', v_l.valor_total));

  RETURN jsonb_build_object('ok', true, 'conta_pagar_id', v_conta);
END $$;
