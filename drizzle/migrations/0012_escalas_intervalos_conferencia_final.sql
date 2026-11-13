ALTER TABLE public.escalas_semanas ADD COLUMN IF NOT EXISTS justificativa text;
ALTER TABLE public.escalas_versoes ADD COLUMN IF NOT EXISTS justificativa text;
CREATE OR REPLACE FUNCTION public.escalas_verificar(p_equipe jsonb,p_regras jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE p jsonb; d jsonb; n int; en int; sa int; it int; bi int; bf int; total int; erros jsonb:='[]'; alertas jsonb:='[]'; nome text; t int; ab int; fe int; setor text; ini int; tem boolean;
BEGIN
 IF jsonb_typeof(p_equipe) IS DISTINCT FROM 'array' OR jsonb_array_length(p_equipe)=0 THEN RETURN jsonb_build_object('erros',jsonb_build_array('Selecione colaboradores.'),'alertas',alertas); END IF;
 IF (SELECT count(DISTINCT x->>'colaborador_id') FROM jsonb_array_elements(p_equipe) x)<>jsonb_array_length(p_equipe) THEN erros:=erros||jsonb_build_array('Colaborador duplicado.'); END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(p_equipe) LOOP
  nome:=p->>'nome'; total:=0;
  IF coalesce((p->>'pendente')::boolean,false) OR coalesce(p->>'colaborador_id','') LIKE 'pendente:%' THEN erros:=erros||jsonb_build_array(nome||': identidade e cadastro pendentes de confirmação.'); END IF;
  IF jsonb_array_length(p->'dias') IS DISTINCT FROM 7 OR coalesce((p->>'meta')::int,0) NOT BETWEEN 1 AND 10080 OR coalesce(p->>'funcao','')='' THEN erros:=erros||jsonb_build_array(nome||': dados incompletos.'); CONTINUE; END IF;
  FOR n IN 0..6 LOOP
   d:=p->'dias'->n; en:=(d->>'entrada')::int; sa:=(d->>'saida')::int; bi:=(d->>'intervalo_inicio')::int; bf:=(d->>'intervalo_fim')::int; it:=coalesce(bf-bi,(d->>'intervalo')::int,0);
   IF d->>'folga'='true' THEN
    IF en IS NOT NULL OR sa IS NOT NULL OR it<>0 OR bi IS NOT NULL OR bf IS NOT NULL THEN erros:=erros||jsonb_build_array(nome||': folga com horários no dia '||(n+1)); END IF; CONTINUE;
   END IF;
   IF d->>'folga' IS DISTINCT FROM 'false' OR en IS NULL OR sa IS NULL OR en<0 OR sa>1440 OR en%30<>0 OR sa%30<>0 OR sa<=en OR it<0 OR it>=sa-en OR (bi IS NULL)<>(bf IS NULL) OR (bi IS NOT NULL AND (bi<en OR bf>sa OR bf<=bi OR bi%15<>0 OR bf%15<>0)) OR (it>0 AND bi IS NULL) THEN erros:=erros||jsonb_build_array(nome||': entrada, saída ou horários do intervalo inconsistentes no dia '||(n+1)); CONTINUE; END IF;
   total:=total+sa-en-it;
   IF sa-en-it>(p_regras->>'max_diario')::int THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','trabalhista','texto',nome||': jornada acima do limite administrativo no dia '||(n+1))); END IF;
   IF sa-en>(p_regras->>'intervalo_apos')::int AND it<(p_regras->>'intervalo_minimo')::int THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','trabalhista','texto',nome||': intervalo abaixo do limite administrativo no dia '||(n+1))); END IF;
   IF n=6 AND (p_regras->>'domingo_fechado')::boolean THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto',nome||': trabalho no domingo fechado.')); END IF;
   IF n<5 AND (en<(p_regras->>'abertura')::int OR sa>(p_regras->>'fechamento')::int) OR n=5 AND (en<(p_regras->>'sabado_abertura')::int OR sa>(p_regras->>'sabado_fechamento')::int) THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto',nome||': horário fora do funcionamento no dia '||(n+1))); END IF;
  END LOOP;
  IF total<>(p->>'meta')::int THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','jornada','texto',nome||': diferença de '||(total-(p->>'meta')::int)||' minutos em relação à meta.')); END IF;
 END LOOP;
 FOR n IN 0..5 LOOP
  ab:=CASE WHEN n=5 THEN (p_regras->>'sabado_abertura')::int ELSE (p_regras->>'abertura')::int END; fe:=CASE WHEN n=5 THEN (p_regras->>'sabado_fechamento')::int ELSE (p_regras->>'fechamento')::int END;
  FOREACH setor IN ARRAY ARRAY['Atendimento comercial','Daniel / Adriano','Motoristas'] LOOP
   ini:=NULL;
   FOR t IN ab..fe LOOP
    SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(p_equipe) x WHERE x->'dias'->n->>'folga'='false' AND (x->'dias'->n->>'entrada')::int<=t AND (x->'dias'->n->>'saida')::int>t AND NOT coalesce((x->'dias'->n->>'intervalo_inicio')::int<=t AND (x->'dias'->n->>'intervalo_fim')::int>t,false) AND CASE setor WHEN 'Motoristas' THEN lower(x->>'funcao') LIKE '%motorista%' WHEN 'Daniel / Adriano' THEN lower(x->>'nome') ~ '(daniel|adriano)' ELSE lower(x->>'funcao') ~ '(venda|vendedor|atendimento|comercial)' END) INTO tem;
    IF t<fe AND NOT tem AND ini IS NULL THEN ini:=t; END IF;
    IF (tem OR t=fe) AND ini IS NOT NULL THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto',(ARRAY['Segunda','Terça','Quarta','Quinta','Sexta','Sábado'])[n+1]||' '||lpad((ini/60)::text,2,'0')||':'||lpad((ini%60)::text,2,'0')||'–'||lpad((t/60)::text,2,'0')||':'||lpad((t%60)::text,2,'0')||': sem cobertura de '||setor)); ini:=NULL; END IF;
   END LOOP;
  END LOOP;
  IF p_regras->'prioridade_completa' @> to_jsonb(ARRAY[n]) AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_equipe) x WHERE x->'dias'->n->>'folga'='true' OR x->'dias'->n->>'entrada' IS NULL) THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Equipe completa não atendida no dia '||(n+1))); END IF;
  IF n=5 AND (p_regras->>'todos_sabado')::boolean AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_equipe) x WHERE x->'dias'->n->>'folga'='true') THEN alertas:=alertas||jsonb_build_array(jsonb_build_object('tipo','operacional','texto','Todos devem trabalhar sábado na proposta inicial.')); END IF;
 END LOOP;
 RETURN jsonb_build_object('erros',erros,'alertas',alertas);
END $$;
CREATE FUNCTION public.escalas_salvar_rascunho(p_inicio date,p_equipe jsonb,p_revisao integer DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.escalas_semanas; p jsonb; e jsonb:='[]'; cfg jsonb; cid uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(),'escalas','administrar') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_inicio IS NULL OR extract(isodow FROM p_inicio)<>1 OR jsonb_typeof(p_equipe) IS DISTINCT FROM 'array' OR jsonb_array_length(p_equipe)=0 THEN RAISE EXCEPTION 'Semana ou equipe inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('escala:'||p_inicio)); SELECT * INTO s FROM escalas_semanas WHERE inicio=p_inicio FOR UPDATE;
 IF s.id IS NOT NULL AND (s.estado='publicada' OR p_revisao IS DISTINCT FROM s.revisao) THEN RAISE EXCEPTION 'Reabra a edição e confira a revisão da semana'; END IF;
 FOR p IN SELECT * FROM jsonb_array_elements(p_equipe) LOOP
  IF (p->>'meta')::int NOT BETWEEN 1 AND 10080 OR jsonb_array_length(p->'dias') IS DISTINCT FROM 7 OR coalesce(p->>'funcao','')='' THEN RAISE EXCEPTION 'Dados incompletos'; END IF;
  IF p->>'colaborador_id' IN ('pendente:Adriano','pendente:Taylor') AND coalesce((p->>'pendente')::boolean,false) THEN
   IF EXISTS(SELECT 1 FROM colaboradores c WHERE lower(coalesce(c.nome_exibicao,c.nome)) LIKE '%'||lower(split_part(p->>'colaborador_id',':',2))||'%') THEN RAISE EXCEPTION 'Existe cadastro equivalente. Confira e vincule antes de salvar.'; END IF;
  ELSE
   cid:=(p->>'colaborador_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM colaboradores WHERE id=cid AND status<>'desligado') THEN RAISE EXCEPTION 'Cadastro inválido'; END IF;
   p:=jsonb_set(p,'{nome}',(SELECT to_jsonb(coalesce(nome_exibicao,nome)) FROM colaboradores WHERE id=cid)); p:=p-'pendente';
  END IF;
  e:=e||jsonb_build_array(p);
 END LOOP;
 IF (SELECT count(DISTINCT x->>'colaborador_id') FROM jsonb_array_elements(e) x)<>jsonb_array_length(e) THEN RAISE EXCEPTION 'Colaborador duplicado'; END IF;
 SELECT regras INTO cfg FROM escalas_parametros WHERE id;
 INSERT INTO escalas_semanas(inicio,equipe,regras,updated_by) VALUES(p_inicio,e,cfg,auth.uid()) ON CONFLICT(inicio) DO UPDATE SET equipe=excluded.equipe,regras=excluded.regras,estado='rascunho',validacao=NULL,justificativa=NULL,revisao=escalas_semanas.revisao+1,updated_at=now(),updated_by=auth.uid();
 INSERT INTO audit_logs(user_id,module_key,action,old_value,new_value) VALUES(auth.uid(),'escalas','salvar_rascunho',to_jsonb(s),jsonb_build_object('inicio',p_inicio,'equipe',e,'timezone','America/Manaus'));
 RETURN jsonb_build_object('ok',true,'inicio',p_inicio);
END $$;
REVOKE ALL ON FUNCTION public.escalas_salvar_rascunho(date,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.escalas_salvar_rascunho(date,jsonb,integer) TO authenticated,service_role;
CREATE FUNCTION public.escalas_publicar_confirmado(p_inicio date,p_revisao integer,p_justificativa text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(),'escalas','administrar') THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('escala:'||p_inicio));
 UPDATE escalas_semanas SET justificativa=nullif(btrim(p_justificativa),'') WHERE inicio=p_inicio AND revisao=p_revisao AND estado='validada';
 IF NOT FOUND THEN RAISE EXCEPTION 'Valide a escala e confira a revisão'; END IF;
 RETURN public.escalas_gravar('publicar',p_inicio,p_revisao,NULL,NULL,true);
END $$;
REVOKE ALL ON FUNCTION public.escalas_publicar_confirmado(date,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.escalas_publicar_confirmado(date,integer,text) TO authenticated,service_role;
CREATE FUNCTION public.escalas_conferencia_publicacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v jsonb; j text;
BEGIN
 v:=public.escalas_verificar(NEW.equipe,NEW.regras);
 IF jsonb_array_length(v->'erros')>0 THEN RAISE EXCEPTION 'Corrija horários, intervalos e identidades antes de publicar'; END IF;
 SELECT justificativa INTO j FROM escalas_semanas WHERE id=NEW.escala_id;
 IF jsonb_array_length(v->'alertas')>0 AND coalesce(length(btrim(j)),0)<10 THEN RAISE EXCEPTION 'Registre a decisão administrativa sobre os alertas (mínimo 10 caracteres)'; END IF;
 NEW.justificativa:=j; RETURN NEW;
END $$;
CREATE TRIGGER escalas_conferencia_final BEFORE INSERT ON public.escalas_versoes FOR EACH ROW EXECUTE FUNCTION public.escalas_conferencia_publicacao();