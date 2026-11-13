CREATE OR REPLACE FUNCTION public.escalas_ler(p_inicio date,p_minha boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.escalas_versoes; s public.escalas_semanas; v_equipe jsonb; gestor boolean;
BEGIN
 gestor:=public.has_permission(auth.uid(),'escalas','administrar');
 IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(),'minha_escala','visualizar') AND NOT gestor THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_minha THEN
  SELECT * INTO v FROM public.escalas_versoes ev WHERE ev.inicio=p_inicio ORDER BY ev.versao DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(x),'[]') INTO v_equipe FROM jsonb_array_elements(coalesce(v.equipe,'[]')) x WHERE EXISTS(SELECT 1 FROM public.colaboradores c WHERE c.id=(x->>'colaborador_id')::uuid AND c.user_id=auth.uid());
  RETURN jsonb_build_object('publicacao',CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('inicio',v.inicio,'versao',v.versao,'publicado_em',v.publicado_em,'equipe',v_equipe) END,'vinculado',EXISTS(SELECT 1 FROM public.colaboradores c WHERE c.user_id=auth.uid()));
 END IF;
 IF NOT gestor THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 SELECT * INTO s FROM public.escalas_semanas es WHERE es.inicio=p_inicio;
 RETURN jsonb_build_object('semana',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,
 'regras',coalesce((SELECT ep.regras FROM public.escalas_parametros ep WHERE ep.id),'{"abertura":480,"fechamento":1080,"sabado_abertura":480,"sabado_fechamento":780,"domingo_fechado":true,"prioridade_completa":[0,4],"todos_sabado":true,"minimo_sabado":5,"max_diario":480,"intervalo_minimo":60,"intervalo_apos":360}'::jsonb),
 'colaboradores',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nome',coalesce(c.nome_exibicao,c.nome),'funcao',coalesce(p.funcao,cg.nome,''),'meta',coalesce(p.meta,2520),'folgas',coalesce(p.folgas,ARRAY[6]),'selecionado',p.colaborador_id IS NOT NULL) ORDER BY c.nome) FROM colaboradores c LEFT JOIN cargos cg ON cg.id=c.cargo_id LEFT JOIN escalas_preferencias p ON p.colaborador_id=c.id WHERE c.status<>'desligado'),'[]'),
 'versoes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',ev.id,'versao',ev.versao,'publicado_em',ev.publicado_em,'equipe',ev.equipe,'validacao',ev.validacao) ORDER BY ev.versao DESC) FROM escalas_versoes ev WHERE ev.inicio=p_inicio),'[]'));
END $$;