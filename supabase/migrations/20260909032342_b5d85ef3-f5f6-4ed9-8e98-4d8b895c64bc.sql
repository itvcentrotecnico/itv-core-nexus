
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
    IF EXISTS (SELECT 1 FROM public.contas_pagar_pagamentos WHERE conta_pagar_id = v_l.conta_pagar_id) THEN
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
