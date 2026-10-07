DO $$ BEGIN
  CREATE TYPE public.avaliacao_conferencia_status AS ENUM ('sem_avaliacao','aguardando','validada','nao_validada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.comissoes_entrega
  ADD COLUMN IF NOT EXISTS valor_base numeric(12,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS bonificacao_solicitada numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonificacao_validada numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avaliacao_status public.avaliacao_conferencia_status NOT NULL DEFAULT 'sem_avaliacao',
  ADD COLUMN IF NOT EXISTS conferencia_forma text,
  ADD COLUMN IF NOT EXISTS conferencia_obs text,
  ADD COLUMN IF NOT EXISTS conferencia_anexo_path text,
  ADD COLUMN IF NOT EXISTS conferido_por uuid,
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz;

CREATE TABLE IF NOT EXISTS public.comissoes_entrega_conferencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comissao_id uuid NOT NULL REFERENCES public.comissoes_entrega(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL,
  status_anterior public.avaliacao_conferencia_status,
  status_final public.avaliacao_conferencia_status NOT NULL,
  valor_anterior numeric(12,2),
  valor_final numeric(12,2) NOT NULL,
  forma text,
  observacao text,
  anexo_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.comissoes_entrega_conferencias TO authenticated;
GRANT ALL ON public.comissoes_entrega_conferencias TO service_role;
ALTER TABLE public.comissoes_entrega_conferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Gerencia le conferencias" ON public.comissoes_entrega_conferencias FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'comissao_entrega','visualizar'));

-- Trigger: sistema calcula sempre; avaliação só muda via conferência
CREATE OR REPLACE FUNCTION public.comissao_entrega_calcular()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v jsonb; v_base numeric; v_bonus numeric; v_conf boolean := coalesce(current_setting('app.ce_conferir', true),'') = '1';
begin
  select s.value into v from public.settings s where s.key='comissao_entrega';
  v_base := round(coalesce((v->>'valor_taxa_fixa')::numeric,5),2);
  v_bonus := round(coalesce((v->>'valor_bonificacao_avaliacao')::numeric,2.5),2);
  if tg_op = 'INSERT' then
    new.valor_base := v_base;
    if new.tipo = 'entrega_avaliacao' then
      new.bonificacao_solicitada := v_bonus; new.avaliacao_status := 'aguardando';
    else
      new.bonificacao_solicitada := 0; new.avaliacao_status := 'sem_avaliacao';
    end if;
    new.conferido_por := null; new.conferido_em := null;
  else
    if not v_conf then
      new.avaliacao_status := old.avaliacao_status;
      new.conferido_por := old.conferido_por; new.conferido_em := old.conferido_em;
      new.conferencia_forma := old.conferencia_forma; new.conferencia_obs := old.conferencia_obs;
      new.conferencia_anexo_path := old.conferencia_anexo_path;
      if old.status <> 'paga' then
        new.valor_base := old.valor_base; new.bonificacao_solicitada := old.bonificacao_solicitada;
      end if;
    end if;
  end if;
  new.bonificacao_validada := case when new.avaliacao_status='validada' then new.bonificacao_solicitada else 0 end;
  if tg_op = 'INSERT' or old.status <> 'paga' then
    new.valor := new.valor_base + new.bonificacao_validada;
  end if;
  if new.status in ('validada','paga') and new.avaliacao_status = 'aguardando'
     and (tg_op='INSERT' or old.status is distinct from new.status) then
    raise exception 'Avaliação aguardando conferência da Gerência: comissão não pode ser validada nem paga.';
  end if;
  return new;
end $$;
DROP TRIGGER IF EXISTS trg_comissao_entrega_calcular ON public.comissoes_entrega;
CREATE TRIGGER trg_comissao_entrega_calcular BEFORE INSERT OR UPDATE ON public.comissoes_entrega
  FOR EACH ROW EXECUTE FUNCTION public.comissao_entrega_calcular();

-- Backfill: não pagos/não cancelados recalculados
SELECT set_config('app.ce_conferir','1',true);
UPDATE public.comissoes_entrega SET
  valor_base = 5,
  bonificacao_solicitada = case when tipo='entrega_avaliacao' then 2.5 else 0 end,
  avaliacao_status = case when tipo='entrega_avaliacao' then 'aguardando'::public.avaliacao_conferencia_status else 'sem_avaliacao' end
WHERE status NOT IN ('paga','cancelada');
UPDATE public.comissoes_entrega SET
  valor_base = case when tipo='entrega_avaliacao' then valor - 0 else valor end,
  avaliacao_status = case when tipo='entrega_avaliacao' then 'validada'::public.avaliacao_conferencia_status else 'sem_avaliacao' end
WHERE status = 'paga';
SELECT set_config('app.ce_conferir','',true);

UPDATE public.settings SET value = value || '{"valor_taxa_fixa":5,"valor_bonificacao_avaliacao":2.5,"valor_taxa_com_avaliacao":7.5}'::jsonb
WHERE key='comissao_entrega';

-- Conferência
CREATE OR REPLACE FUNCTION public.comissao_entrega_conferir(p_ids uuid[], p_aprovar boolean, p_forma text DEFAULT NULL, p_obs text DEFAULT NULL, p_anexo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_uid uuid := auth.uid(); r public.comissoes_entrega%rowtype; v_n int := 0; v_novo public.comissoes_entrega%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'message','Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid,'comissao_entrega','validar') then
    return jsonb_build_object('ok',false,'message','Somente a Gerência pode conferir avaliações.'); end if;
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
end $$;
GRANT EXECUTE ON FUNCTION public.comissao_entrega_conferir(uuid[],boolean,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.comissao_entrega_config()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v jsonb; b numeric; bo numeric;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not (public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar') or public.has_permission(auth.uid(), 'caixa', 'visualizar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para consultar a comissão de entrega.');
  end if;
  select s.value into v from public.settings s where s.key = 'comissao_entrega';
  b := round(coalesce((v->>'valor_taxa_fixa')::numeric, 5), 2);
  bo := round(coalesce((v->>'valor_bonificacao_avaliacao')::numeric, 2.5), 2);
  return jsonb_build_object('ok', true, 'valor_taxa_fixa', b, 'valor_bonificacao_avaliacao', bo,
    'valor_taxa_com_avaliacao', b + bo,
    'exige_validacao', coalesce((v->>'exige_validacao')::boolean, true),
    'ativo', coalesce((v->>'ativo')::boolean, true));
end $function$;

CREATE OR REPLACE FUNCTION public.comissao_entrega_listar(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_entregador_id uuid DEFAULT NULL::uuid, p_status comissao_entrega_status DEFAULT NULL::comissao_entrega_status, p_tipo comissao_entrega_tipo DEFAULT NULL::comissao_entrega_tipo, p_os text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_pode boolean; v_colab uuid; v_itens jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO'); end if;
  v_pode := public.has_permission(v_uid, 'comissao_entrega', 'visualizar');
  select c.id into v_colab from public.colaboradores c where c.user_id = v_uid limit 1;
  if not v_pode and v_colab is null then return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO'); end if;
  select coalesce(jsonb_agg(x order by x ->> 'data' desc), '[]'::jsonb) into v_itens
  from (
    select jsonb_build_object(
      'id', ce.id, 'data', l.data_lancamento, 'os', coalesce(ce.os, l.os), 'cliente', l.cliente,
      'caixa_lancamento_id', ce.caixa_lancamento_id, 'entregador_id', ce.entregador_id,
      'entregador', coalesce(col.nome_exibicao, col.nome), 'tipo', ce.tipo, 'valor', ce.valor,
      'valor_base', ce.valor_base, 'bonificacao_solicitada', ce.bonificacao_solicitada,
      'bonificacao_validada', ce.bonificacao_validada, 'avaliacao_status', ce.avaliacao_status,
      'conferencia_forma', ce.conferencia_forma, 'conferencia_obs', ce.conferencia_obs,
      'conferencia_anexo_path', ce.conferencia_anexo_path, 'conferido_por', conf.full_name, 'conferido_em', ce.conferido_em,
      'avaliacao_confirmada', ce.avaliacao_confirmada, 'avaliacao_observacao', ce.avaliacao_observacao,
      'status', ce.status, 'motivo_status', ce.motivo_status, 'lancamento_status', l.status,
      'responsavel', resp.full_name, 'validado_por', val.full_name, 'validado_em', ce.validado_em,
      'pago_em', ce.pago_em, 'created_at', ce.created_at) as x
    from public.comissoes_entrega ce
    join public.caixa_lancamentos l on l.id = ce.caixa_lancamento_id
    join public.colaboradores col on col.id = ce.entregador_id
    left join public.profiles resp on resp.id = ce.created_by
    left join public.profiles val on val.id = ce.validado_por
    left join public.profiles conf on conf.id = ce.conferido_por
    where (v_pode or ce.entregador_id = v_colab)
      and (p_inicio is null or l.data_lancamento >= p_inicio)
      and (p_fim is null or l.data_lancamento <= p_fim)
      and (p_entregador_id is null or ce.entregador_id = p_entregador_id)
      and (p_status is null or ce.status = p_status)
      and (p_tipo is null or ce.tipo = p_tipo)
      and (nullif(btrim(coalesce(p_os, '')), '') is null or coalesce(ce.os, l.os) ilike '%' || btrim(p_os) || '%')
  ) s;
  return jsonb_build_object('ok', true, 'itens', v_itens, 'pode_gerir', v_pode);
end $function$;

CREATE OR REPLACE FUNCTION public.comissao_entrega_relatorio(p_inicio date DEFAULT NULL::date, p_fim date DEFAULT NULL::date, p_entregador_id uuid DEFAULT NULL::uuid, p_status comissao_entrega_status DEFAULT NULL::comissao_entrega_status, p_tipo comissao_entrega_tipo DEFAULT NULL::comissao_entrega_tipo)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_itens jsonb;
begin
  if v_uid is null or not public.has_permission(v_uid, 'comissao_entrega', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO'); end if;
  select coalesce(jsonb_agg(to_jsonb(s) order by s.valor_gerado desc), '[]'::jsonb) into v_itens
  from (
    select ce.entregador_id, coalesce(col.nome_exibicao, col.nome) as entregador,
      count(*) filter (where ce.status <> 'cancelada') as entregas,
      count(*) filter (where ce.tipo = 'entrega' and ce.status <> 'cancelada') as com_taxa_fixa,
      count(*) filter (where ce.tipo = 'entrega_avaliacao' and ce.status <> 'cancelada') as com_avaliacao,
      count(*) filter (where ce.avaliacao_status = 'validada' and ce.status <> 'cancelada') as avaliacoes_confirmadas,
      count(*) filter (where ce.avaliacao_status = 'nao_validada' and ce.status <> 'cancelada') as avaliacoes_nao_validadas,
      count(*) filter (where ce.avaliacao_status = 'aguardando' and ce.status <> 'cancelada') as avaliacoes_aguardando,
      coalesce(sum(ce.valor_base) filter (where ce.status <> 'cancelada'), 0) as comissao_base,
      coalesce(sum(ce.bonificacao_validada) filter (where ce.status <> 'cancelada'), 0) as bonificacao_validada,
      coalesce(sum(ce.bonificacao_solicitada) filter (where ce.avaliacao_status = 'aguardando' and ce.status <> 'cancelada'), 0) as bonificacao_aguardando,
      coalesce(sum(ce.valor) filter (where ce.status <> 'cancelada'), 0) as valor_gerado,
      coalesce(sum(ce.valor) filter (where ce.status in ('validada', 'paga')), 0) as valor_validado,
      coalesce(sum(ce.valor) filter (where ce.status = 'paga'), 0) as valor_pago,
      coalesce(sum(ce.valor) filter (where ce.status in ('gerada', 'pendente_validacao', 'validada')), 0) as valor_pendente,
      coalesce(sum(ce.valor) filter (where ce.status = 'cancelada'), 0) as valor_cancelado
    from public.comissoes_entrega ce
    join public.caixa_lancamentos l on l.id = ce.caixa_lancamento_id
    join public.colaboradores col on col.id = ce.entregador_id
    where (p_inicio is null or l.data_lancamento >= p_inicio)
      and (p_fim is null or l.data_lancamento <= p_fim)
      and (p_entregador_id is null or ce.entregador_id = p_entregador_id)
      and (p_status is null or ce.status = p_status)
      and (p_tipo is null or ce.tipo = p_tipo)
    group by ce.entregador_id, coalesce(col.nome_exibicao, col.nome)
  ) s;
  return jsonb_build_object('ok', true, 'itens', v_itens);
end $function$;

-- Validar exige conferência concluída
CREATE OR REPLACE FUNCTION public.comissao_entrega_status_alterar(p_id uuid, p_acao text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_uid uuid := auth.uid(); v_ce public.comissoes_entrega%rowtype; v_novo public.comissao_entrega_status;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  select * into v_ce from public.comissoes_entrega ce where ce.id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.'); end if;
  if p_acao in ('validar', 'rejeitar') and not public.has_permission(v_uid, 'comissao_entrega', 'validar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para validar comissões de entrega.'); end if;
  if p_acao = 'pagar' and not public.has_permission(v_uid, 'comissao_entrega', 'pagar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para pagar comissões de entrega.'); end if;
  if p_acao = 'cancelar' and not public.has_permission(v_uid, 'comissao_entrega', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar comissões de entrega.'); end if;
  if v_ce.status = 'paga' and p_acao <> 'cancelar' then
    return jsonb_build_object('ok', false, 'code', 'JA_PAGA', 'message', 'Esta comissão já foi paga.'); end if;
  if p_acao in ('validar','pagar') and v_ce.avaliacao_status = 'aguardando' then
    return jsonb_build_object('ok', false, 'code', 'AGUARDANDO_CONFERENCIA', 'message', 'A avaliação ainda aguarda conferência da Gerência.'); end if;
  if p_acao = 'validar' then
    if v_ce.status not in ('gerada', 'pendente_validacao') then
      return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente comissões geradas ou pendentes podem ser validadas.'); end if;
    v_novo := 'validada';
  elsif p_acao = 'rejeitar' then
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo da rejeição.'); end if;
    v_novo := 'pendente_validacao';
  elsif p_acao = 'cancelar' then
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.'); end if;
    if v_ce.status = 'paga' and not public.has_permission(v_uid, 'comissao_entrega', 'configurar') then
      return jsonb_build_object('ok', false, 'code', 'EXIGE_ADM', 'message', 'Comissão já paga: o ajuste exige um administrador.'); end if;
    v_novo := 'cancelada';
  elsif p_acao = 'pagar' then
    if v_ce.status <> 'validada' then
      return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente comissões validadas podem ser pagas.'); end if;
    v_novo := 'paga';
  else
    return jsonb_build_object('ok', false, 'code', 'ACAO_INVALIDA', 'message', 'Use a Conferência de avaliações para aprovar ou não validar a avaliação.');
  end if;
  update public.comissoes_entrega set status = v_novo,
    motivo_status = nullif(btrim(coalesce(p_motivo, '')), ''),
    validado_por = case when v_novo = 'validada' then v_uid else validado_por end,
    validado_em = case when v_novo = 'validada' then now() else validado_em end,
    pago_em = case when v_novo = 'paga' then now() else pago_em end,
    pago_por = case when v_novo = 'paga' then v_uid else pago_por end,
    updated_by = v_uid
  where id = p_id;
  perform public.registrar_auditoria('comissao_entrega', p_acao, to_jsonb(v_ce),
    (select to_jsonb(ce) from public.comissoes_entrega ce where ce.id = p_id));
  return jsonb_build_object('ok', true, 'id', p_id, 'status', v_novo);
end $function$;