DO $$ BEGIN
  CREATE TYPE public.grupo_receita AS ENUM ('servicos','acessorios','venda_tv');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.tipos_receita ADD COLUMN IF NOT EXISTS grupo_receita public.grupo_receita;
ALTER TABLE public.caixa_lancamentos ADD COLUMN IF NOT EXISTS grupo_receita public.grupo_receita;
ALTER TABLE public.caixa_lancamentos ADD COLUMN IF NOT EXISTS grupo_classificado_por uuid;
ALTER TABLE public.caixa_lancamentos ADD COLUMN IF NOT EXISTS grupo_classificado_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_caixa_lanc_grupo ON public.caixa_lancamentos (grupo_receita, data_lancamento) WHERE status = 'ativo';

-- Tipos existentes com natureza inequívoca
UPDATE public.tipos_receita SET grupo_receita='servicos', nome='OS / Serviço de Bancada' WHERE nome='Serviço de Bancada';
UPDATE public.tipos_receita SET grupo_receita='servicos' WHERE nome='Serviço em Domicílio';
UPDATE public.tipos_receita SET grupo_receita='acessorios' WHERE nome='Venda de Peças';
UPDATE public.tipos_receita SET grupo_receita='venda_tv', ativo=false WHERE nome='Venda de Aparelho';
-- "Outros" é ambíguo: sai do formulário, registros antigos vão para revisão
UPDATE public.tipos_receita SET ativo=false WHERE nome='Outros';

INSERT INTO public.tipos_receita (nome, ordem, ativo, grupo_receita)
SELECT v.nome, v.ordem, true, v.g::public.grupo_receita FROM (VALUES
  ('Serviço Rápido',10,'servicos'),('Laudo',11,'servicos'),('Deslocamento',12,'servicos'),('Outros Serviços',13,'servicos'),
  ('Controle',20,'acessorios'),('Cabo HDMI',21,'acessorios'),('Antena',22,'acessorios'),('Suporte',23,'acessorios'),
  ('Limpa Tela',24,'acessorios'),('Outros acessórios/produtos',25,'acessorios'),
  ('TV Nova',30,'venda_tv'),('TV Seminova',31,'venda_tv'),('TV Usada',32,'venda_tv'),('Outras TVs',33,'venda_tv')
) v(nome,ordem,g)
WHERE NOT EXISTS (SELECT 1 FROM public.tipos_receita t WHERE t.nome=v.nome);

-- Backfill inequívoco pelo tipo (Outros e Recebimento de Conta a Receber ficam para revisão)
UPDATE public.caixa_lancamentos l SET grupo_receita = t.grupo_receita
  FROM public.tipos_receita t WHERE t.id=l.tipo_receita_id AND l.grupo_receita IS NULL AND t.grupo_receita IS NOT NULL;

-- Toda nova receita precisa de categoria
CREATE OR REPLACE FUNCTION public.caixa_lanc_grupo_receita()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_g public.grupo_receita; v_nome text;
BEGIN
  IF TG_OP='UPDATE' AND NEW.tipo_receita_id IS NOT DISTINCT FROM OLD.tipo_receita_id THEN RETURN NEW; END IF;
  SELECT grupo_receita, nome INTO v_g, v_nome FROM public.tipos_receita WHERE id=NEW.tipo_receita_id;
  IF v_g IS NOT NULL THEN NEW.grupo_receita := v_g;
  ELSIF TG_OP='INSERT' AND NEW.grupo_receita IS NULL AND v_nome IS DISTINCT FROM 'Recebimento de Conta a Receber' THEN
    RAISE EXCEPTION 'Selecione a categoria da receita (Serviços, Acessórios ou Venda de TVs).' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_caixa_lanc_grupo_receita ON public.caixa_lancamentos;
CREATE TRIGGER trg_caixa_lanc_grupo_receita BEFORE INSERT OR UPDATE OF tipo_receita_id ON public.caixa_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.caixa_lanc_grupo_receita();

-- Indicadores do Caixa com separação por categoria
CREATE OR REPLACE FUNCTION public.caixa_indicadores(p_from date, p_to date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v record;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'dashboard', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select count(*) as qtd,
         coalesce(sum(l.valor_bruto), 0) as bruto,
         coalesce(sum(l.desconto), 0) as descontos,
         coalesce(sum(l.valor_final), 0) as faturamento,
         coalesce(sum(l.taxas_total), 0) as taxas,
         coalesce(sum(l.receita_liquida), 0) as liquida,
         count(distinct l.os) filter (where l.os is not null) as os_faturadas,
         coalesce(sum(l.valor_final) filter (where l.grupo_receita='servicos'), 0) as servicos,
         coalesce(sum(l.valor_final) filter (where l.grupo_receita='acessorios'), 0) as acessorios,
         coalesce(sum(l.valor_final) filter (where l.grupo_receita='venda_tv'), 0) as venda_tv,
         coalesce(sum(l.valor_final) filter (where l.grupo_receita is null), 0) as sem_class,
         count(*) filter (where l.grupo_receita='servicos') as qtd_servicos,
         count(*) filter (where l.grupo_receita is null) as qtd_sem_class
    into v
    from public.caixa_lancamentos l
   where l.status = 'ativo' and l.data_lancamento between p_from and p_to;
  return jsonb_build_object(
    'ok', true, 'quantidade', v.qtd, 'faturamento_bruto', v.bruto, 'descontos', v.descontos,
    'faturamento_final', v.faturamento, 'taxas', v.taxas, 'receita_liquida', v.liquida,
    'os_faturadas', v.os_faturadas,
    'ticket_medio', case when v.qtd > 0 then round(v.faturamento / v.qtd, 2) else 0 end,
    'receita_servicos', v.servicos, 'receita_acessorios', v.acessorios, 'receita_venda_tv', v.venda_tv,
    'receita_sem_classificacao', v.sem_class, 'quantidade_servicos', v.qtd_servicos,
    'quantidade_sem_classificacao', v.qtd_sem_class,
    'ticket_medio_servicos', case when v.qtd_servicos > 0 then round(v.servicos / v.qtd_servicos, 2) else 0 end
  );
end;
$function$;

-- Revisão de classificação (somente gerência)
CREATE OR REPLACE FUNCTION public.caixa_receitas_sem_classificacao()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'administrador') OR public.has_permission(auth.uid(),'caixa','administrar')) THEN
    RETURN jsonb_build_object('ok',false,'code','SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok',true,'itens',coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',l.id,'data',l.data_lancamento,'os',l.os,'cliente',l.cliente,'descricao',l.descricao,
    'tipo',t.nome,'valor',l.valor_final) ORDER BY l.data_lancamento)
    FROM public.caixa_lancamentos l JOIN public.tipos_receita t ON t.id=l.tipo_receita_id
    WHERE l.status='ativo' AND l.grupo_receita IS NULL),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.caixa_classificar_receita(p_id uuid, p_grupo public.grupo_receita)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old public.grupo_receita;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'administrador') OR public.has_permission(auth.uid(),'caixa','administrar')) THEN
    RETURN jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Somente a Gerência pode classificar receitas.');
  END IF;
  IF p_grupo IS NULL THEN RETURN jsonb_build_object('ok',false,'code','GRUPO_OBRIGATORIO','message','Escolha a categoria.'); END IF;
  SELECT grupo_receita INTO v_old FROM public.caixa_lancamentos WHERE id=p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','NAO_ENCONTRADO','message','Lançamento não encontrado.'); END IF;
  UPDATE public.caixa_lancamentos SET grupo_receita=p_grupo, grupo_classificado_por=auth.uid(),
    grupo_classificado_em=now(), updated_by=auth.uid() WHERE id=p_id;
  INSERT INTO public.audit_logs (user_id, action, table_name, record_id, details)
  VALUES (auth.uid(), 'classificar_receita', 'caixa_lancamentos', p_id,
    jsonb_build_object('de', v_old, 'para', p_grupo));
  RETURN jsonb_build_object('ok',true);
EXCEPTION WHEN undefined_column THEN
  RETURN jsonb_build_object('ok',true);
END $$;

GRANT EXECUTE ON FUNCTION public.caixa_receitas_sem_classificacao() TO authenticated;
GRANT EXECUTE ON FUNCTION public.caixa_classificar_receita(uuid, public.grupo_receita) TO authenticated;

-- Meta de Serviços: realizado somente com receitas de SERVIÇOS
DO $$
DECLARE s text;
BEGIN
  s := pg_get_functiondef('public.metas_realizado'::regproc);
  s := replace(s, 'IF p_tipo = ''faturamento'' THEN RETURN v_fat; END IF;',
    'IF p_tipo = ''faturamento'' THEN RETURN (SELECT coalesce(sum(l.valor_final),0) FROM public.caixa_lancamentos l WHERE l.status=''ativo'' AND l.grupo_receita=''servicos'' AND l.data_lancamento BETWEEN p_inicio AND p_fim); END IF; IF p_tipo = ''faturamento_total'' THEN RETURN v_fat; END IF;');
  IF position('faturamento_total' in s) = 0 THEN RAISE EXCEPTION 'metas_realizado não ajustada'; END IF;
  EXECUTE s;

  s := pg_get_functiondef('public.metas_evolucao'::regproc);
  s := replace(s, E'WHERE l.status = ''ativo'' AND l.data_lancamento BETWEEN p_from AND p_to\n     GROUP BY',
    E'WHERE l.status = ''ativo'' AND l.grupo_receita = ''servicos'' AND l.data_lancamento BETWEEN p_from AND p_to\n     GROUP BY');
  IF position('grupo_receita' in s) = 0 THEN RAISE EXCEPTION 'metas_evolucao não ajustada'; END IF;
  EXECUTE s;

  s := pg_get_functiondef('public.modo_tv_indicadores'::regproc);
  s := replace(s, 'v_ritmo_atual := round(v_fat / greatest(v_dias_decorridos, 1), 2);',
    'v_ritmo_atual := round(coalesce(v_realizado, v_fat) / greatest(v_dias_decorridos, 1), 2);');
  IF position('coalesce(v_realizado, v_fat) / greatest' in s) = 0 THEN RAISE EXCEPTION 'modo_tv não ajustada'; END IF;
  EXECUTE s;
END $$;