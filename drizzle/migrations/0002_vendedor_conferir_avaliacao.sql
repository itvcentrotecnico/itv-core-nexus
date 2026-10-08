DROP POLICY IF EXISTS "Gerencia envia comprovantes entrega" ON storage.objects;
CREATE POLICY "Gerencia envia comprovantes entrega" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'comissao-entrega-comprovantes' AND (public.has_permission(auth.uid(),'comissao_entrega','validar') OR public.has_permission(auth.uid(),'comissao_entrega','aprovar')));

CREATE OR REPLACE FUNCTION public.comissao_entrega_conferir(p_ids uuid[], p_aprovar boolean, p_forma text DEFAULT NULL::text, p_obs text DEFAULT NULL::text, p_anexo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); r public.comissoes_entrega%rowtype; v_n int := 0; v_novo public.comissoes_entrega%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Sua sessão expirou. Entre novamente.'); end if;
  if not (public.has_permission(v_uid,'comissao_entrega','validar') or public.has_permission(v_uid,'comissao_entrega','aprovar')) then
    return jsonb_build_object('ok',false,'message','Você não tem permissão para conferir avaliações.'); end if;
  if p_aprovar and nullif(btrim(coalesce(p_forma,'')),'') is null then
    return jsonb_build_object('ok',false,'message','Informe a forma de comprovação.'); end if;
  if not p_aprovar and nullif(btrim(coalesce(p_obs,'')),'') is null then
    return jsonb_build_object('ok',false,'message','Informe o motivo da não validação.'); end if;
  perform set_config('app.ce_conferir','1',true);
  for r in select * from public.comissoes_entrega where id = any(p_ids) for update loop
    if r.tipo <> 'entrega_avaliacao' or r.status in ('paga','cancelada') then continue; end if;
    update public.comissoes_entrega set
      avaliacao_status = case when p_aprovar then 'validada' else 'nao_validada' end::public.avaliacao_conferencia_status,
      avaliacao_confirmada = p_aprovar,
      conferencia_forma = nullif(btrim(coalesce(p_forma,'')),''),
      conferencia_obs = nullif(btrim(coalesce(p_obs,'')),''),
      conferencia_anexo_path = nullif(p_anexo,''),
      conferido_por = v_uid, conferido_em = now(), updated_by = v_uid
    where id = r.id returning * into v_novo;
    insert into public.comissoes_entrega_conferencias(comissao_id,usuario_id,status_anterior,status_final,valor_anterior,valor_final,forma,observacao,anexo_path)
    values (r.id,v_uid,r.avaliacao_status,v_novo.avaliacao_status,r.valor,v_novo.valor,v_novo.conferencia_forma,v_novo.conferencia_obs,v_novo.conferencia_anexo_path);
    perform public.registrar_auditoria('comissao_entrega','validar',to_jsonb(r),to_jsonb(v_novo));
    v_n := v_n + 1;
  end loop;
  perform set_config('app.ce_conferir','',true);
  return jsonb_build_object('ok',true,'conferidas',v_n);
end $function$;