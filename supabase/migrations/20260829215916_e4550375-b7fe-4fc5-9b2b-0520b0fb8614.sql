ALTER TABLE public.coletas_solicitacoes
  ADD COLUMN IF NOT EXISTS whatsapp_aberto_em timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_aberto_por uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS whatsapp_aberturas integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.coletas_whatsapp_aberto(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.coletas_solicitacoes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente para continuar.';
  END IF;
  IF NOT public.coletas_pode('criar') THEN
    RAISE EXCEPTION 'Você não tem permissão para enviar o link ao cliente.';
  END IF;

  UPDATE public.coletas_solicitacoes
     SET whatsapp_aberto_em = now(),
         whatsapp_aberto_por = auth.uid(),
         whatsapp_aberturas = COALESCE(whatsapp_aberturas, 0) + 1
   WHERE id = p_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.';
  END IF;

  INSERT INTO public.coletas_historico (solicitacao_id, autor_id, acao, detalhe)
  VALUES (p_id, auth.uid(), 'whatsapp_aberto', 'WhatsApp aberto para envio do link (envio manual pelo vendedor)');

  RETURN jsonb_build_object(
    'whatsapp_aberto_em', v_row.whatsapp_aberto_em,
    'whatsapp_aberturas', v_row.whatsapp_aberturas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.coletas_whatsapp_aberto(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coletas_whatsapp_aberto(uuid) TO authenticated, service_role;

INSERT INTO public.settings (key, value)
VALUES ('coletas_mensagem', jsonb_build_object(
  'template',
  E'Olá, {primeiro_nome}! 👋\n\nPara darmos continuidade à sua solicitação de coleta da TV, precisamos confirmar seus dados de contato e endereço.\n\nPor favor, preencha sua ficha pelo link abaixo:\n\n{link}\n\nO preenchimento leva aproximadamente 1 minuto.\n\nApós o envio, as informações ficarão disponíveis para nossa equipe responsável pela coleta.\n\nITV Centro Técnico'
))
ON CONFLICT (key) DO NOTHING;