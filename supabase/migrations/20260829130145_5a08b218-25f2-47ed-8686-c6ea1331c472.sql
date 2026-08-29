CREATE OR REPLACE FUNCTION public.coletas_criar(
  p_tipo text,
  p_nome text,
  p_whatsapp text,
  p_observacao text DEFAULT NULL::text,
  p_horas integer DEFAULT 72,
  p_origem_id uuid DEFAULT NULL::uuid,
  p_origem_detalhe text DEFAULT NULL::text,
  p_indicado_nome text DEFAULT NULL::text,
  p_indicado_telefone text DEFAULT NULL::text,
  p_canal_contato text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_link jsonb;
BEGIN
  IF NOT public.coletas_pode('criar') THEN
    RAISE EXCEPTION 'Sem permissão para criar solicitação.';
  END IF;
  IF coalesce(trim(p_nome), '') = '' THEN
    RAISE EXCEPTION 'Informe o nome do cliente.';
  END IF;
  IF coalesce(regexp_replace(p_whatsapp, '\D', '', 'g'), '') = '' THEN
    RAISE EXCEPTION 'Informe o WhatsApp.';
  END IF;
  IF p_tipo NOT IN ('coleta', 'entrega') THEN
    RAISE EXCEPTION 'Tipo inválido.';
  END IF;

  INSERT INTO public.coletas_solicitacoes (
    tipo,
    cliente_nome,
    whatsapp,
    observacao,
    created_by,
    canal_contato
  )
  VALUES (
    p_tipo,
    trim(p_nome),
    regexp_replace(p_whatsapp, '\D', '', 'g'),
    nullif(trim(coalesce(p_observacao, '')), ''),
    auth.uid(),
    nullif(trim(coalesce(p_canal_contato, '')), '')
  )
  RETURNING id INTO v_id;

  IF p_origem_id IS NOT NULL THEN
    PERFORM public.coletas_origem_definir(
      v_id,
      p_origem_id,
      p_origem_detalhe,
      p_indicado_nome,
      p_indicado_telefone,
      p_canal_contato,
      NULL
    );
  END IF;

  PERFORM public.registrar_auditoria(
    'coletas',
    'solicitacao_criada',
    NULL,
    jsonb_build_object('id', v_id, 'tipo', p_tipo)
  );

  v_link := public.coletas_gerar_link(v_id, p_horas);
  RETURN jsonb_build_object(
    'id', v_id,
    'token', v_link->>'token',
    'expira_em', v_link->>'expira_em'
  );
END
$function$;