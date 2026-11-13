CREATE OR REPLACE FUNCTION public.escalas_acessos() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(),'escalas','administrar') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('colaborador_id',c.id,'nome',coalesce(c.nome_exibicao,c.nome),'usuario',p.full_name,'vinculado',c.user_id IS NOT NULL,'ativo',coalesce(p.active AND p.status='ativo',false),'pode_consultar',coalesce(public.has_permission(c.user_id,'minha_escala','visualizar'),false)) ORDER BY c.nome) FROM public.colaboradores c LEFT JOIN public.profiles p ON p.id=c.user_id WHERE c.status<>'desligado'),'[]');
END $$;
REVOKE ALL ON FUNCTION public.escalas_acessos() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.escalas_acessos() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.escalas_exigir_acessos() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE pendencias text;
BEGIN
 SELECT string_agg(coalesce(c.nome_exibicao,c.nome,x->>'nome','Colaborador'),', ') INTO pendencias FROM jsonb_array_elements(NEW.equipe) x LEFT JOIN public.colaboradores c ON c.id=(x->>'colaborador_id')::uuid LEFT JOIN public.profiles p ON p.id=c.user_id WHERE c.id IS NULL OR c.status<>'ativo' OR c.user_id IS NULL OR NOT coalesce(p.active AND p.status='ativo',false) OR NOT coalesce(public.has_permission(c.user_id,'minha_escala','visualizar'),false);
 IF pendencias IS NOT NULL THEN RAISE EXCEPTION 'Publicação bloqueada: confira cadastro ativo, vínculo e acesso à Minha Escala de %. A escala permanece em rascunho ou validação.',pendencias; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.escalas_exigir_acessos() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER escalas_versoes_exigir_acessos BEFORE INSERT ON public.escalas_versoes FOR EACH ROW EXECUTE FUNCTION public.escalas_exigir_acessos();
CREATE TRIGGER escalas_semanas_exigir_acessos BEFORE INSERT OR UPDATE OF estado,equipe ON public.escalas_semanas FOR EACH ROW WHEN (NEW.estado='publicada') EXECUTE FUNCTION public.escalas_exigir_acessos();