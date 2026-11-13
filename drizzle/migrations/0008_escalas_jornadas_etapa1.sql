CREATE TABLE public.escalas_parametros (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 regras jsonb NOT NULL DEFAULT '{"abertura":480,"fechamento":1080,"sabado_abertura":480,"sabado_fechamento":780,"domingo_fechado":true,"prioridade_completa":[0,4],"todos_sabado":true,"minimo_sabado":5,"max_diario":480,"intervalo_minimo":60,"intervalo_apos":360}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.escalas_parametros TO authenticated;
GRANT ALL ON public.escalas_parametros TO service_role;
ALTER TABLE public.escalas_parametros ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalas_parametros_gestao ON public.escalas_parametros FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'escalas','administrar'));
CREATE TABLE public.escalas_preferencias (
 colaborador_id uuid PRIMARY KEY REFERENCES public.colaboradores(id),
 funcao text NOT NULL,
 meta integer NOT NULL DEFAULT 2520 CHECK(meta BETWEEN 1 AND 10080),
 folgas integer[] NOT NULL DEFAULT ARRAY[6],
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.escalas_preferencias TO authenticated;
GRANT ALL ON public.escalas_preferencias TO service_role;
ALTER TABLE public.escalas_preferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalas_preferencias_gestao ON public.escalas_preferencias FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'escalas','administrar'));
CREATE TABLE public.escalas_semanas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inicio date NOT NULL UNIQUE CHECK(extract(isodow FROM inicio)=1),
 estado text NOT NULL DEFAULT 'rascunho' CHECK(estado IN ('rascunho','validada','publicada')),
 revisao integer NOT NULL DEFAULT 1,
 equipe jsonb NOT NULL DEFAULT '[]',
 regras jsonb NOT NULL,
 validacao jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL
);
GRANT SELECT ON public.escalas_semanas TO authenticated;
GRANT ALL ON public.escalas_semanas TO service_role;
ALTER TABLE public.escalas_semanas ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalas_semanas_gestao ON public.escalas_semanas FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'escalas','administrar'));
CREATE TABLE public.escalas_versoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 escala_id uuid NOT NULL REFERENCES public.escalas_semanas(id),
 inicio date NOT NULL,
 versao integer NOT NULL,
 equipe jsonb NOT NULL,
 regras jsonb NOT NULL,
 validacao jsonb NOT NULL,
 publicado_em timestamptz NOT NULL DEFAULT now(),
 publicado_por uuid NOT NULL,
 UNIQUE(escala_id,versao)
);
GRANT SELECT ON public.escalas_versoes TO authenticated;
GRANT ALL ON public.escalas_versoes TO service_role;
ALTER TABLE public.escalas_versoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY escalas_versoes_gestao ON public.escalas_versoes FOR SELECT TO authenticated USING(public.has_permission(auth.uid(),'escalas','administrar'));
CREATE FUNCTION public.escalas_verificar(p_equipe jsonb,p_regras jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE p jsonb; d jsonb; n int; en int; sa int; it int; total int; alertas jsonb:='[]'; erros jsonb:='[]'; presentes int; atendimento int; motoristas int; nome text;
BEGIN
 IF jsonb_typeof(p_equipe)<>'array' OR jsonb_array_length(p_equipe)=0 THEN RETURN jsonb_build_object('erros',jsonb_build_array('Selecione ao menos um colaborador.'),'alertas',alertas); END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(p_equipe)) <> (SELECT count(DISTINCT x->>'colaborador_id') FROM jsonb_array_elements(p_equipe) x) THEN erros:=erros||jsonb_build_array('Colaborador duplicado.'); END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(p_equipe) LOOP
  nome:=p->>'nome'; total:=0;
  IF jsonb_array_length(p->'dias')<>7 OR coalesce((p->>'meta')::int,0) NOT BETWEEN 1 AND 10080 OR length(coalesce(p->>'funcao',''))=0 THEN erros:=erros||jsonb_build_array(nome||': dados incompletos.'); CONTINUE; END IF;
  FOR n IN 0..6 LOOP
   d:=p->'dias'->n; en:=(d->>'entrada')::int; sa:=(d->>'saida')::int; it:=(d->>'intervalo')::int;
   IF d->>'folga'='true' THEN
    IF en IS NOT NULL OR sa IS NOT NULL OR coalesce(it,0)<>0 THEN erros:=erros||jsonb_build_array(nome||': folga com horários no dia '||(n+1)); END IF;
    CONTINUE;
   END IF;
   IF en IS NULL OR sa IS NULL OR it IS NULL OR en<0 OR sa>1440 OR en%30<>0 OR sa%30<>0 OR sa<=en OR it<0 OR it>=sa-en THEN erros:=erros||jsonb_build_array(nome||': horário inválido no dia '||(n+1)); CONTINUE; END IF;
   total:=total+sa-en-it;
   IF sa-en-it>(p_regras->>'max_diario')::int THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','trabalhista','texto',nome||': jornada acima do limite administrativo no dia '||(n+1))); END IF;
   IF sa-en>(p_regras->>'intervalo_apos')::int AND it<(p_regras->>'intervalo_minimo')::int THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','trabalhista','texto',nome||': intervalo insuficiente no dia '||(n+1))); END IF;
   IF n=6 AND (p_regras->>'domingo_fechado')::boolean THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto',nome||': trabalho no domingo fechado.')); END IF;
   IF n<5 AND (en<(p_regras->>'abertura')::int OR sa>(p_regras->>'fechamento')::int) OR n=5 AND (en<(p_regras->>'sabado_abertura')::int OR sa>(p_regras->>'sabado_fechamento')::int) THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto',nome||': horário fora do funcionamento no dia '||(n+1))); END IF;
  END LOOP;
  IF total<>(p->>'meta')::int THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','jornada','texto',nome||': diferença de '||(total-(p->>'meta')::int)||' minutos em relação à meta.')); END IF;
 END LOOP;
 FOR n IN 0..5 LOOP
  SELECT count(*) FILTER(WHERE x->'dias'->n->>'folga'='false' AND x->'dias'->n->>'entrada' IS NOT NULL),
   count(*) FILTER(WHERE x->'dias'->n->>'folga'='false' AND lower(x->>'nome') ~ '(daniel|adriano)'),
   count(*) FILTER(WHERE x->'dias'->n->>'folga'='false' AND lower(x->>'funcao') LIKE '%motorista%')
  INTO presentes,atendimento,motoristas FROM jsonb_array_elements(p_equipe) x;
  IF atendimento=0 THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Daniel e Adriano sem atendimento no dia '||(n+1))); END IF;
  IF motoristas=0 THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Sem motorista no dia '||(n+1))); END IF;
  IF n<5 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_equipe) x WHERE x->'dias'->n->>'folga'='false' AND lower(x->>'funcao') ~ '(vendedor|atendimento|comercial)' AND (x->'dias'->n->>'saida')::int >= (p_regras->>'fechamento')::int) THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Atendimento sem cobertura até o fechamento no dia '||(n+1))); END IF;
  IF p_regras->'prioridade_completa' @> to_jsonb(ARRAY[n]) AND presentes<jsonb_array_length(p_equipe) THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Prioridade de equipe completa não atendida no dia '||(n+1))); END IF;
  IF n=5 AND (presentes<(p_regras->>'minimo_sabado')::int OR ((p_regras->>'todos_sabado')::boolean AND presentes<jsonb_array_length(p_equipe))) THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Equipe insuficiente no sábado.')); END IF;
 END LOOP;
 RETURN jsonb_build_object('erros',erros,'alertas',alertas);
END $$;
REVOKE ALL ON FUNCTION public.escalas_verificar(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.escalas_verificar(jsonb,jsonb) TO service_role;
CREATE FUNCTION public.escalas_ler(p_inicio date,p_minha boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.escalas_versoes; s public.escalas_semanas; equipe jsonb; gestor boolean;
BEGIN
 gestor:=public.has_permission(auth.uid(),'escalas','administrar');
 IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(),'minha_escala','visualizar') AND NOT gestor THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_minha THEN
  SELECT * INTO v FROM public.escalas_versoes WHERE inicio=p_inicio ORDER BY versao DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(x),'[]') INTO equipe FROM jsonb_array_elements(coalesce(v.equipe,'[]')) x WHERE EXISTS(SELECT 1 FROM public.colaboradores c WHERE c.id=(x->>'colaborador_id')::uuid AND c.user_id=auth.uid());
  RETURN jsonb_build_object('publicacao',CASE WHEN v.id IS NULL THEN NULL ELSE jsonb_build_object('inicio',v.inicio,'versao',v.versao,'publicado_em',v.publicado_em,'equipe',equipe) END,'vinculado',EXISTS(SELECT 1 FROM public.colaboradores WHERE user_id=auth.uid()));
 END IF;
 IF NOT gestor THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 SELECT * INTO s FROM public.escalas_semanas WHERE inicio=p_inicio;
 RETURN jsonb_build_object('semana',CASE WHEN s.id IS NULL THEN NULL ELSE to_jsonb(s) END,
 'regras',coalesce((SELECT regras FROM public.escalas_parametros WHERE id),'{"abertura":480,"fechamento":1080,"sabado_abertura":480,"sabado_fechamento":780,"domingo_fechado":true,"prioridade_completa":[0,4],"todos_sabado":true,"minimo_sabado":5,"max_diario":480,"intervalo_minimo":60,"intervalo_apos":360}'::jsonb),
 'colaboradores',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'nome',coalesce(c.nome_exibicao,c.nome),'funcao',coalesce(p.funcao,cg.nome,''),'meta',coalesce(p.meta,2520),'folgas',coalesce(p.folgas,ARRAY[6]),'selecionado',p.colaborador_id IS NOT NULL) ORDER BY c.nome) FROM colaboradores c LEFT JOIN cargos cg ON cg.id=c.cargo_id LEFT JOIN escalas_preferencias p ON p.colaborador_id=c.id WHERE c.status<>'desligado'),'[]'),
 'versoes',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'versao',versao,'publicado_em',publicado_em,'equipe',equipe,'validacao',validacao) ORDER BY versao DESC) FROM escalas_versoes WHERE inicio=p_inicio),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.escalas_ler(date,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.escalas_ler(date,boolean) TO authenticated,service_role;
CREATE FUNCTION public.escalas_gravar(p_acao text,p_inicio date,p_revisao integer DEFAULT NULL,p_equipe jsonb DEFAULT NULL,p_regras jsonb DEFAULT NULL,p_confirmado boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.escalas_semanas; v_id uuid; p jsonb; cfg jsonb; valid jsonb; versao int; ini date:=p_inicio; v_equipe jsonb; old jsonb;
BEGIN
 IF NOT public.has_permission(auth.uid(),'escalas','administrar') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_acao NOT IN ('criar','salvar','editar','duplicar','validar','publicar','configurar') OR p_inicio IS NULL OR extract(isodow FROM p_inicio)<>1 THEN RAISE EXCEPTION 'Ação ou semana inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('escala:'||p_inicio));
 SELECT * INTO s FROM escalas_semanas WHERE inicio=p_inicio FOR UPDATE;
 old:=to_jsonb(s);
 IF p_acao='configurar' THEN
  IF NOT public.has_role(auth.uid(),'administrador') THEN RAISE EXCEPTION 'Somente administrador configura parâmetros'; END IF;
  IF p_regras IS NULL OR NOT p_regras ?& ARRAY['abertura','fechamento','sabado_abertura','sabado_fechamento','domingo_fechado','prioridade_completa','todos_sabado','minimo_sabado','max_diario','intervalo_minimo','intervalo_apos'] THEN RAISE EXCEPTION 'Parâmetros incompletos'; END IF;
  IF (p_regras->>'abertura')::int<0 OR (p_regras->>'fechamento')::int>1440 OR (p_regras->>'abertura')::int>=(p_regras->>'fechamento')::int OR (p_regras->>'sabado_abertura')::int<0 OR (p_regras->>'sabado_fechamento')::int>1440 OR (p_regras->>'sabado_abertura')::int>=(p_regras->>'sabado_fechamento')::int OR (p_regras->>'max_diario')::int NOT BETWEEN 1 AND 1440 OR (p_regras->>'intervalo_minimo')::int NOT BETWEEN 0 AND 1440 OR (p_regras->>'intervalo_apos')::int NOT BETWEEN 0 AND 1440 OR (p_regras->>'minimo_sabado')::int<1 THEN RAISE EXCEPTION 'Limites inválidos'; END IF;
  INSERT INTO escalas_parametros(id,regras) VALUES(true,p_regras) ON CONFLICT(id) DO UPDATE SET regras=excluded.regras,updated_at=now();
 ELSE
  IF p_acao NOT IN ('criar') AND (s.id IS NULL OR p_revisao IS DISTINCT FROM s.revisao) THEN RAISE EXCEPTION 'Escala atualizada por outra pessoa. Reabra a semana.'; END IF;
  cfg:=coalesce((SELECT regras FROM escalas_parametros WHERE id),s.regras);
  IF cfg IS NULL THEN RAISE EXCEPTION 'Configure os parâmetros primeiro'; END IF;
  IF p_acao IN ('criar','salvar') THEN
   IF p_acao='criar' AND s.id IS NOT NULL THEN RAISE EXCEPTION 'Semana já cadastrada'; END IF;
   IF p_acao='salvar' AND s.estado='publicada' THEN RAISE EXCEPTION 'Inicie nova edição da escala publicada'; END IF;
   IF p_equipe IS NULL OR jsonb_typeof(p_equipe)<>'array' OR jsonb_array_length(p_equipe)=0 THEN RAISE EXCEPTION 'Selecione os colaboradores'; END IF;
   FOR p IN SELECT * FROM jsonb_array_elements(p_equipe) LOOP
    IF NOT EXISTS(SELECT 1 FROM colaboradores WHERE id=(p->>'colaborador_id')::uuid AND status<>'desligado') OR (p->>'meta')::int NOT BETWEEN 1 AND 10080 OR jsonb_array_length(p->'dias')<>7 OR length(coalesce(p->>'funcao',''))=0 THEN RAISE EXCEPTION 'Dados do colaborador inválidos'; END IF;
   END LOOP;
   SELECT jsonb_agg(jsonb_set(x,'{nome}',to_jsonb(coalesce(c.nome_exibicao,c.nome)))) INTO v_equipe FROM jsonb_array_elements(p_equipe) x JOIN colaboradores c ON c.id=(x->>'colaborador_id')::uuid;
   IF (SELECT count(DISTINCT x->>'colaborador_id') FROM jsonb_array_elements(v_equipe) x)<>jsonb_array_length(v_equipe) THEN RAISE EXCEPTION 'Colaborador duplicado'; END IF;
   INSERT INTO escalas_semanas(inicio,equipe,regras,updated_by) VALUES(p_inicio,v_equipe,cfg,auth.uid()) ON CONFLICT(inicio) DO UPDATE SET equipe=excluded.equipe,regras=excluded.regras,estado='rascunho',validacao=NULL,revisao=escalas_semanas.revisao+1,updated_at=now(),updated_by=auth.uid() RETURNING id INTO v_id;
  ELSIF p_acao='duplicar' THEN
   ini:=p_inicio+7;
   PERFORM pg_advisory_xact_lock(hashtext('escala:'||ini));
   INSERT INTO escalas_semanas(inicio,equipe,regras,updated_by) VALUES(ini,s.equipe,cfg,auth.uid()) RETURNING id INTO v_id;
  ELSIF p_acao='editar' THEN
   UPDATE escalas_semanas SET estado='rascunho',validacao=NULL,revisao=revisao+1,updated_at=now(),updated_by=auth.uid() WHERE id=s.id RETURNING id INTO v_id;
  ELSIF p_acao='validar' THEN
   valid:=escalas_verificar(s.equipe,s.regras);
   UPDATE escalas_semanas SET validacao=valid,estado=CASE WHEN jsonb_array_length(valid->'erros')=0 THEN 'validada' ELSE 'rascunho' END,revisao=revisao+1,updated_at=now(),updated_by=auth.uid() WHERE id=s.id RETURNING id INTO v_id;
  ELSIF p_acao='publicar' THEN
   IF s.estado<>'validada' OR NOT p_confirmado THEN RAISE EXCEPTION 'Valide e confirme os avisos antes de publicar'; END IF;
   valid:=escalas_verificar(s.equipe,s.regras);
   IF jsonb_array_length(valid->'erros')>0 THEN RAISE EXCEPTION 'Corrija os horários antes de publicar'; END IF;
   SELECT coalesce(max(v.versao),0)+1 INTO versao FROM escalas_versoes v WHERE v.escala_id=s.id;
   INSERT INTO escalas_versoes(escala_id,inicio,versao,equipe,regras,validacao,publicado_por) VALUES(s.id,s.inicio,versao,s.equipe,s.regras,valid,auth.uid());
   UPDATE escalas_semanas SET estado='publicada',revisao=revisao+1,updated_at=now(),updated_by=auth.uid() WHERE id=s.id RETURNING id INTO v_id;
   FOR p IN SELECT * FROM jsonb_array_elements(s.equipe) LOOP
    INSERT INTO escalas_preferencias(colaborador_id,funcao,meta,folgas) VALUES((p->>'colaborador_id')::uuid,p->>'funcao',(p->>'meta')::int,ARRAY(SELECT ord::int-1 FROM jsonb_array_elements(p->'dias') WITH ORDINALITY t(d,ord) WHERE d->>'folga'='true')) ON CONFLICT(colaborador_id) DO UPDATE SET funcao=excluded.funcao,meta=excluded.meta,folgas=excluded.folgas,updated_at=now();
   END LOOP;
  END IF;
 END IF;
 INSERT INTO audit_logs(user_id,module_key,action,old_value,new_value) VALUES(auth.uid(),'escalas',p_acao,old,jsonb_build_object('inicio',ini,'escala_id',v_id,'equipe',CASE WHEN p_acao='configurar' THEN NULL ELSE (SELECT equipe FROM escalas_semanas WHERE id=v_id) END,'regras',CASE WHEN p_acao='configurar' THEN p_regras ELSE NULL END,'timezone','America/Manaus'));
 RETURN jsonb_build_object('ok',true,'inicio',ini,'id',v_id);
END $$;
REVOKE ALL ON FUNCTION public.escalas_gravar(text,date,integer,jsonb,jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.escalas_gravar(text,date,integer,jsonb,jsonb,boolean) TO authenticated,service_role;