-- ============================================================
-- GOVERNANÇA FINANCEIRA — FECHAMENTO DA V1
-- ============================================================

create type public.tributo_status as enum ('previsto','confirmado','pago','cancelado');
create type public.tributo_metodo as enum ('manual','percentual');
create type public.caixa_movimento_tipo as enum ('saldo_inicial','suprimento','sangria');
create type public.desconto_autorizacao_status as enum ('pendente','aprovado','rejeitado');

-- ---------- TRIBUTOS ----------
create table public.tributos (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  tipo text not null default 'Tributos sobre Faturamento',
  metodo public.tributo_metodo not null default 'manual',
  base_calculo numeric(12,2) not null default 0,
  percentual numeric(7,4),
  valor numeric(12,2) not null default 0,
  observacao text,
  responsavel_id uuid references public.profiles(id),
  status public.tributo_status not null default 'previsto',
  confirmado_em timestamptz,
  pago_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create unique index tributos_competencia_unica on public.tributos (competencia, tipo) where status <> 'cancelado';
create index tributos_competencia_idx on public.tributos (competencia);

grant select, insert, update on public.tributos to authenticated;
grant all on public.tributos to service_role;
alter table public.tributos enable row level security;

create policy "tributos_select" on public.tributos for select to authenticated
  using (public.has_permission(auth.uid(),'financeiro_tributos','visualizar'));
create policy "tributos_insert" on public.tributos for insert to authenticated with check (false);
create policy "tributos_update" on public.tributos for update to authenticated using (false);

create trigger tributos_updated_at before update on public.tributos
  for each row execute function public.update_updated_at_column();

-- ---------- CAIXA FÍSICO ----------
create table public.caixa_movimentos (
  id uuid primary key default gen_random_uuid(),
  data_movimento date not null,
  ocorrido_em timestamptz not null default now(),
  tipo public.caixa_movimento_tipo not null,
  valor numeric(12,2) not null,
  motivo text not null,
  observacao text,
  responsavel_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index caixa_saldo_inicial_unico on public.caixa_movimentos (data_movimento) where tipo = 'saldo_inicial';
create index caixa_movimentos_data_idx on public.caixa_movimentos (data_movimento);

grant select, insert on public.caixa_movimentos to authenticated;
grant all on public.caixa_movimentos to service_role;
alter table public.caixa_movimentos enable row level security;

create policy "caixa_mov_select" on public.caixa_movimentos for select to authenticated
  using (public.has_permission(auth.uid(),'caixa','visualizar'));
create policy "caixa_mov_insert" on public.caixa_movimentos for insert to authenticated with check (false);

alter table public.caixa_fechamentos
  add column if not exists saldo_inicial numeric(12,2) not null default 0,
  add column if not exists entradas_dinheiro numeric(12,2) not null default 0,
  add column if not exists suprimentos numeric(12,2) not null default 0,
  add column if not exists sangrias numeric(12,2) not null default 0,
  add column if not exists motivo_diferenca text;

-- ---------- ALÇADA DE DESCONTOS ----------
create table public.descontos_autorizacoes (
  id uuid primary key default gen_random_uuid(),
  os text,
  cliente text,
  valor_original numeric(12,2) not null,
  valor_desconto numeric(12,2) not null,
  percentual numeric(7,4) not null,
  limite_perfil numeric(7,4),
  motivo text not null,
  status public.desconto_autorizacao_status not null default 'pendente',
  solicitado_por uuid not null references public.profiles(id),
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references public.profiles(id),
  decidido_em timestamptz,
  comentario text,
  lancamento_id uuid references public.caixa_lancamentos(id),
  utilizado_em timestamptz,
  created_at timestamptz not null default now()
);
create index descontos_autorizacoes_status_idx on public.descontos_autorizacoes (status, solicitado_em desc);

grant select, insert, update on public.descontos_autorizacoes to authenticated;
grant all on public.descontos_autorizacoes to service_role;
alter table public.descontos_autorizacoes enable row level security;

create policy "desc_aut_select" on public.descontos_autorizacoes for select to authenticated
  using (
    solicitado_por = auth.uid()
    or public.has_permission(auth.uid(),'caixa_desconto','visualizar')
    or public.has_permission(auth.uid(),'caixa_desconto','aprovar')
  );
create policy "desc_aut_insert" on public.descontos_autorizacoes for insert to authenticated with check (false);
create policy "desc_aut_update" on public.descontos_autorizacoes for update to authenticated using (false);

alter table public.caixa_lancamentos
  add column if not exists desconto_autorizacao_id uuid references public.descontos_autorizacoes(id);

-- ---------- BACKUP ----------
create table public.backup_registros (
  id uuid primary key default gen_random_uuid(),
  data_backup date not null,
  tipo text not null,
  local_armazenamento text not null,
  status text not null default 'concluido',
  observacao text,
  responsavel_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index backup_registros_data_idx on public.backup_registros (data_backup desc);

grant select, insert on public.backup_registros to authenticated;
grant all on public.backup_registros to service_role;
alter table public.backup_registros enable row level security;

create policy "backup_reg_select" on public.backup_registros for select to authenticated
  using (public.has_permission(auth.uid(),'admin_backup','visualizar'));
create policy "backup_reg_insert" on public.backup_registros for insert to authenticated with check (false);

-- ---------- MÓDULOS E PERMISSÕES ----------
insert into public.modules (key, label, sort_order) values
  ('financeiro_tributos','Financeiro · Tributos', 57),
  ('caixa_suprimento','Caixa · Suprimento', 58),
  ('caixa_sangria','Caixa · Sangria', 59),
  ('caixa_desconto','Caixa · Alçada de Desconto', 60),
  ('admin_governanca','Admin · Governança Financeira', 61)
on conflict (key) do nothing;

insert into public.role_permissions (role, module_key, action) values
  ('adm_financeiro','financeiro_tributos','visualizar'),
  ('adm_financeiro','financeiro_tributos','criar'),
  ('adm_financeiro','financeiro_tributos','editar'),
  ('adm_operacional','financeiro_tributos','visualizar'),
  ('adm_financeiro','caixa_suprimento','criar'),
  ('adm_operacional','caixa_suprimento','criar'),
  ('vendedor','caixa_suprimento','criar'),
  ('adm_financeiro','caixa_sangria','criar'),
  ('adm_operacional','caixa_sangria','criar'),
  ('adm_financeiro','caixa_desconto','visualizar'),
  ('adm_financeiro','caixa_desconto','aprovar'),
  ('adm_operacional','caixa_desconto','visualizar'),
  ('adm_operacional','caixa_desconto','aprovar'),
  ('adm_financeiro','admin_backup','visualizar'),
  ('adm_financeiro','admin_governanca','visualizar')
on conflict do nothing;

-- ---------- PARÂMETROS DE GOVERNANÇA ----------
insert into public.settings (key, value) values (
  'governanca',
  jsonb_build_object(
    'tributo_metodo','percentual',
    'tributo_percentual_padrao', 6,
    'alcada_desconto', jsonb_build_object(
      'vendedor', 5, 'tecnico', 0, 'adm_operacional', 10, 'adm_financeiro', 15, 'administrador', null, 'tv_display', 0
    ),
    'alerta_desconto_pct', 5,
    'comissao_entrega_reconhecimento','validada',
    'exige_conferencia_fisica', true,
    'backup_intervalo_dias', 7
  )
) on conflict (key) do nothing;

create or replace function public.governanca_config()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select value from public.settings where key='governanca'), '{}'::jsonb)
$$;
revoke execute on function public.governanca_config() from public;
grant execute on function public.governanca_config() to authenticated;

-- limite de desconto (%) do usuário: null = sem limite
create or replace function public.desconto_limite(_user_id uuid)
returns numeric language plpgsql stable security definer set search_path to 'public' as $$
declare v_cfg jsonb; v_max numeric := 0; v_r record; v_v jsonb;
begin
  if public.has_role(_user_id,'administrador') then return null; end if;
  v_cfg := coalesce((select value->'alcada_desconto' from public.settings where key='governanca'), '{}'::jsonb);
  for v_r in select role::text as role from public.user_roles where user_id = _user_id loop
    v_v := v_cfg -> v_r.role;
    if v_v is null or jsonb_typeof(v_v) = 'null' then return null; end if;
    v_max := greatest(v_max, coalesce((v_v #>> '{}')::numeric, 0));
  end loop;
  return v_max;
end; $$;
revoke execute on function public.desconto_limite(uuid) from public;
grant execute on function public.desconto_limite(uuid) to authenticated;

-- ---------- RPC: TRIBUTOS ----------
create or replace function public.tributos_salvar(
  p_id uuid, p_competencia date, p_tipo text, p_metodo public.tributo_metodo,
  p_base numeric, p_percentual numeric, p_valor numeric, p_observacao text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_old jsonb; v_valor numeric(12,2); v_id uuid; v_tipo text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO','message','Sua sessão expirou.'); end if;
  if not public.has_permission(v_uid,'financeiro_tributos', case when p_id is null then 'criar' else 'editar' end::permission_action) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para registrar tributos.');
  end if;
  if p_competencia is null then return jsonb_build_object('ok',false,'code','COMPETENCIA','message','Informe a competência.'); end if;
  v_tipo := coalesce(nullif(btrim(p_tipo),''),'Tributos sobre Faturamento');

  if p_metodo = 'percentual' then
    if coalesce(p_percentual,0) <= 0 then return jsonb_build_object('ok',false,'code','PERCENTUAL','message','Informe o percentual gerencial.'); end if;
    v_valor := round(coalesce(p_base,0) * p_percentual / 100, 2);
  else
    if coalesce(p_valor,0) <= 0 then return jsonb_build_object('ok',false,'code','VALOR','message','Informe o valor do tributo.'); end if;
    v_valor := round(p_valor,2);
  end if;

  if p_id is null then
    if exists (select 1 from public.tributos t where t.competencia = date_trunc('month',p_competencia)::date and t.tipo = v_tipo and t.status <> 'cancelado') then
      return jsonb_build_object('ok',false,'code','DUPLICADO','message','Já existe tributo ativo para esta competência.');
    end if;
    insert into public.tributos (competencia, tipo, metodo, base_calculo, percentual, valor, observacao, responsavel_id, created_by, updated_by)
    values (date_trunc('month',p_competencia)::date, v_tipo, p_metodo, round(coalesce(p_base,0),2),
            case when p_metodo='percentual' then p_percentual end, v_valor,
            nullif(btrim(coalesce(p_observacao,'')),''), v_uid, v_uid, v_uid)
    returning id into v_id;
    perform public.registrar_auditoria('financeiro_tributos','criar',null,(select to_jsonb(t) from public.tributos t where t.id=v_id));
  else
    select to_jsonb(t) into v_old from public.tributos t where t.id = p_id;
    if v_old is null then return jsonb_build_object('ok',false,'code','NAO_ENCONTRADO','message','Tributo não encontrado.'); end if;
    if (v_old->>'status') in ('pago','cancelado') then
      return jsonb_build_object('ok',false,'code','STATUS_FINAL','message','Tributo pago ou cancelado não pode ser alterado.');
    end if;
    update public.tributos set
      competencia = date_trunc('month',p_competencia)::date, tipo = v_tipo, metodo = p_metodo,
      base_calculo = round(coalesce(p_base,0),2),
      percentual = case when p_metodo='percentual' then p_percentual end,
      valor = v_valor, observacao = nullif(btrim(coalesce(p_observacao,'')),''), updated_by = v_uid
    where id = p_id returning id into v_id;
    perform public.registrar_auditoria('financeiro_tributos','editar',v_old,(select to_jsonb(t) from public.tributos t where t.id=v_id));
  end if;
  return jsonb_build_object('ok',true,'id',v_id,'valor',v_valor);
end; $$;
revoke execute on function public.tributos_salvar(uuid,date,text,public.tributo_metodo,numeric,numeric,numeric,text) from public;
grant execute on function public.tributos_salvar(uuid,date,text,public.tributo_metodo,numeric,numeric,numeric,text) to authenticated;

create or replace function public.tributos_status(p_id uuid, p_status public.tributo_status, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_old jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO'); end if;
  if not public.has_permission(v_uid,'financeiro_tributos','editar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para alterar tributos.');
  end if;
  select to_jsonb(t) into v_old from public.tributos t where t.id = p_id;
  if v_old is null then return jsonb_build_object('ok',false,'code','NAO_ENCONTRADO','message','Tributo não encontrado.'); end if;
  if p_status = 'cancelado' and nullif(btrim(coalesce(p_motivo,'')),'') is null then
    return jsonb_build_object('ok',false,'code','MOTIVO','message','Informe o motivo do cancelamento.');
  end if;
  update public.tributos set
    status = p_status,
    confirmado_em = case when p_status='confirmado' then now() else confirmado_em end,
    pago_em = case when p_status='pago' then now() else pago_em end,
    cancelado_em = case when p_status='cancelado' then now() else null end,
    motivo_cancelamento = case when p_status='cancelado' then btrim(p_motivo) else motivo_cancelamento end,
    updated_by = v_uid
  where id = p_id;
  perform public.registrar_auditoria('financeiro_tributos', p_status::text, v_old, (select to_jsonb(t) from public.tributos t where t.id=p_id));
  return jsonb_build_object('ok',true);
end; $$;
revoke execute on function public.tributos_status(uuid,public.tributo_status,text) from public;
grant execute on function public.tributos_status(uuid,public.tributo_status,text) to authenticated;

-- ---------- RPC: CAIXA FÍSICO ----------
create or replace function public.caixa_movimento_registrar(
  p_data date, p_tipo public.caixa_movimento_tipo, p_valor numeric, p_motivo text, p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_mod text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO','message','Sua sessão expirou.'); end if;
  v_mod := case p_tipo when 'sangria' then 'caixa_sangria' else 'caixa_suprimento' end;
  if not public.has_permission(v_uid, v_mod, 'criar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para este movimento de caixa.');
  end if;
  if p_data is null then return jsonb_build_object('ok',false,'code','DATA','message','Informe a data.'); end if;
  if coalesce(p_valor,0) <= 0 then return jsonb_build_object('ok',false,'code','VALOR','message','Informe um valor maior que zero.'); end if;
  if nullif(btrim(coalesce(p_motivo,'')),'') is null then return jsonb_build_object('ok',false,'code','MOTIVO','message','Informe o motivo.'); end if;
  if public.caixa_periodo_fechado(p_data) and not public.has_permission(v_uid,'caixa','administrar') then
    return jsonb_build_object('ok',false,'code','PERIODO_FECHADO','message','O caixa desta data já foi fechado.');
  end if;
  if p_tipo = 'saldo_inicial' and exists (select 1 from public.caixa_movimentos m where m.data_movimento = p_data and m.tipo='saldo_inicial') then
    return jsonb_build_object('ok',false,'code','SALDO_JA_INFORMADO','message','O saldo inicial desta data já foi informado.');
  end if;

  insert into public.caixa_movimentos (data_movimento, tipo, valor, motivo, observacao, responsavel_id)
  values (p_data, p_tipo, round(p_valor,2), btrim(p_motivo), nullif(btrim(coalesce(p_observacao,'')),''), v_uid)
  returning id into v_id;

  perform public.registrar_auditoria('caixa', p_tipo::text, null, (select to_jsonb(m) from public.caixa_movimentos m where m.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id);
end; $$;
revoke execute on function public.caixa_movimento_registrar(date,public.caixa_movimento_tipo,numeric,text,text) from public;
grant execute on function public.caixa_movimento_registrar(date,public.caixa_movimento_tipo,numeric,text,text) to authenticated;

create or replace function public.caixa_fisico_resumo(p_data date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
  v_ini numeric(12,2); v_sup numeric(12,2); v_san numeric(12,2); v_ent numeric(12,2);
begin
  if v_uid is null or not public.has_permission(v_uid,'caixa','visualizar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO');
  end if;
  select coalesce(sum(valor) filter (where tipo='saldo_inicial'),0),
         coalesce(sum(valor) filter (where tipo='suprimento'),0),
         coalesce(sum(valor) filter (where tipo='sangria'),0)
    into v_ini, v_sup, v_san
    from public.caixa_movimentos where data_movimento = p_data;

  select coalesce(sum(p.valor),0) into v_ent
    from public.caixa_pagamentos p
    join public.caixa_lancamentos l on l.id = p.lancamento_id
    join public.formas_pagamento f on f.id = p.forma_pagamento_id
   where l.status='ativo' and l.data_lancamento = p_data and f.eh_dinheiro;

  return jsonb_build_object('ok',true,
    'saldo_inicial',v_ini,'entradas_dinheiro',v_ent,'suprimentos',v_sup,'sangrias',v_san,
    'saldo_esperado', v_ini + v_ent + v_sup - v_san);
end; $$;
revoke execute on function public.caixa_fisico_resumo(date) from public;
grant execute on function public.caixa_fisico_resumo(date) to authenticated;

-- fechamento com caixa físico
create or replace function public.caixa_fechar(p_data_referencia date, p_dinheiro_informado numeric, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_faturamento numeric(12,2); v_taxas numeric(12,2); v_liquida numeric(12,2);
  v_ini numeric(12,2); v_sup numeric(12,2); v_san numeric(12,2); v_ent numeric(12,2);
  v_esperado numeric(12,2); v_diferenca numeric(12,2); v_resumo jsonb; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO','message','Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid,'caixa','fechar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para fechar o caixa.');
  end if;
  if p_data_referencia is null then return jsonb_build_object('ok',false,'code','DATA_OBRIGATORIA','message','Informe a data do fechamento.'); end if;
  if exists (select 1 from public.caixa_fechamentos f where f.data_referencia=p_data_referencia and f.status='fechado') then
    return jsonb_build_object('ok',false,'code','JA_FECHADO','message','Este dia já está fechado. Reabra o caixa para ajustar.');
  end if;
  if p_dinheiro_informado is null or p_dinheiro_informado < 0 then
    return jsonb_build_object('ok',false,'code','DINHEIRO_INVALIDO','message','Informe o saldo físico contado no caixa.');
  end if;

  select coalesce(sum(l.valor_final),0), coalesce(sum(l.taxas_total),0), coalesce(sum(l.receita_liquida),0)
    into v_faturamento, v_taxas, v_liquida
    from public.caixa_lancamentos l
   where l.status='ativo' and l.data_lancamento = p_data_referencia;

  select coalesce(sum(valor) filter (where tipo='saldo_inicial'),0),
         coalesce(sum(valor) filter (where tipo='suprimento'),0),
         coalesce(sum(valor) filter (where tipo='sangria'),0)
    into v_ini, v_sup, v_san
    from public.caixa_movimentos where data_movimento = p_data_referencia;

  select coalesce(sum(p.valor),0) into v_ent
    from public.caixa_pagamentos p
    join public.caixa_lancamentos l on l.id = p.lancamento_id
    join public.formas_pagamento f on f.id = p.forma_pagamento_id
   where l.status='ativo' and l.data_lancamento = p_data_referencia and f.eh_dinheiro;

  v_esperado := v_ini + v_ent + v_sup - v_san;
  v_diferenca := round(p_dinheiro_informado,2) - v_esperado;

  if v_diferenca <> 0 and nullif(btrim(coalesce(p_observacao,'')),'') is null then
    return jsonb_build_object('ok',false,'code','OBSERVACAO_OBRIGATORIA',
      'message','Há divergência no dinheiro físico. Informe a justificativa para concluir o fechamento.',
      'dinheiro_esperado', v_esperado, 'diferenca', v_diferenca);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('forma',t.nome,'total',t.total,'taxas',t.taxas) order by t.ordem),'[]'::jsonb)
    into v_resumo
    from (select f.nome, f.ordem, sum(p.valor) as total, sum(p.taxa_valor) as taxas
            from public.caixa_pagamentos p
            join public.caixa_lancamentos l on l.id=p.lancamento_id
            join public.formas_pagamento f on f.id=p.forma_pagamento_id
           where l.status='ativo' and l.data_lancamento=p_data_referencia
           group by f.nome, f.ordem) t;

  insert into public.caixa_fechamentos (
    data_referencia, responsavel_id, faturamento_total, taxas_total, receita_liquida,
    dinheiro_esperado, dinheiro_informado, resumo_pagamentos, observacao,
    saldo_inicial, entradas_dinheiro, suprimentos, sangrias, motivo_diferenca
  ) values (
    p_data_referencia, v_uid, v_faturamento, v_taxas, v_liquida,
    v_esperado, round(p_dinheiro_informado,2), v_resumo, nullif(btrim(coalesce(p_observacao,'')),''),
    v_ini, v_ent, v_sup, v_san, case when v_diferenca <> 0 then nullif(btrim(coalesce(p_observacao,'')),'') end
  ) returning id into v_id;

  perform public.registrar_auditoria('caixa','fechar',null,(select to_jsonb(f) from public.caixa_fechamentos f where f.id=v_id));

  return jsonb_build_object('ok',true,'id',v_id,'faturamento_total',v_faturamento,'receita_liquida',v_liquida,
    'saldo_inicial',v_ini,'entradas_dinheiro',v_ent,'suprimentos',v_sup,'sangrias',v_san,
    'dinheiro_esperado',v_esperado,'dinheiro_informado',round(p_dinheiro_informado,2),'diferenca',v_diferenca);
end; $$;
revoke execute on function public.caixa_fechar(date,numeric,text) from public;
grant execute on function public.caixa_fechar(date,numeric,text) to authenticated;

-- ---------- RPC: ALÇADA DE DESCONTO ----------
create or replace function public.desconto_solicitar(
  p_os text, p_cliente text, p_valor_original numeric, p_valor_desconto numeric, p_motivo text
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_pct numeric; v_lim numeric; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO'); end if;
  if not public.has_permission(v_uid,'caixa','criar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para lançar no caixa.');
  end if;
  if coalesce(p_valor_original,0) <= 0 or coalesce(p_valor_desconto,0) <= 0 then
    return jsonb_build_object('ok',false,'code','VALOR','message','Informe o valor original e o desconto.');
  end if;
  if nullif(btrim(coalesce(p_motivo,'')),'') is null then
    return jsonb_build_object('ok',false,'code','MOTIVO','message','Informe o motivo da solicitação.');
  end if;
  v_pct := round(p_valor_desconto / p_valor_original * 100, 4);
  v_lim := public.desconto_limite(v_uid);
  insert into public.descontos_autorizacoes (os, cliente, valor_original, valor_desconto, percentual, limite_perfil, motivo, solicitado_por)
  values (nullif(btrim(coalesce(p_os,'')),''), nullif(btrim(coalesce(p_cliente,'')),''),
          round(p_valor_original,2), round(p_valor_desconto,2), v_pct, v_lim, btrim(p_motivo), v_uid)
  returning id into v_id;
  perform public.registrar_auditoria('caixa_desconto','criar',null,(select to_jsonb(d) from public.descontos_autorizacoes d where d.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id,'percentual',v_pct);
end; $$;
revoke execute on function public.desconto_solicitar(text,text,numeric,numeric,text) from public;
grant execute on function public.desconto_solicitar(text,text,numeric,numeric,text) to authenticated;

create or replace function public.desconto_decidir(p_id uuid, p_aprovar boolean, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_old jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO'); end if;
  if not public.has_permission(v_uid,'caixa_desconto','aprovar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para aprovar descontos.');
  end if;
  select to_jsonb(d) into v_old from public.descontos_autorizacoes d where d.id = p_id;
  if v_old is null then return jsonb_build_object('ok',false,'code','NAO_ENCONTRADO','message','Solicitação não encontrada.'); end if;
  if (v_old->>'status') <> 'pendente' then
    return jsonb_build_object('ok',false,'code','JA_DECIDIDO','message','Esta solicitação já foi decidida.');
  end if;
  if (v_old->>'solicitado_por')::uuid = v_uid and not public.has_role(v_uid,'administrador') then
    return jsonb_build_object('ok',false,'code','AUTO_APROVACAO','message','Não é permitido aprovar a própria solicitação.');
  end if;
  if not coalesce(p_aprovar,false) and nullif(btrim(coalesce(p_comentario,'')),'') is null then
    return jsonb_build_object('ok',false,'code','COMENTARIO','message','Informe o motivo da rejeição.');
  end if;
  update public.descontos_autorizacoes
     set status = case when p_aprovar then 'aprovado' else 'rejeitado' end::public.desconto_autorizacao_status,
         decidido_por = v_uid, decidido_em = now(), comentario = nullif(btrim(coalesce(p_comentario,'')),'')
   where id = p_id;
  perform public.registrar_auditoria('caixa_desconto', case when p_aprovar then 'aprovar' else 'rejeitar' end,
    v_old, (select to_jsonb(d) from public.descontos_autorizacoes d where d.id=p_id));
  return jsonb_build_object('ok',true);
end; $$;
revoke execute on function public.desconto_decidir(uuid,boolean,text) from public;
grant execute on function public.desconto_decidir(uuid,boolean,text) to authenticated;

-- ---------- RPC: BACKUP ----------
create or replace function public.backup_registrar(
  p_data date, p_tipo text, p_local text, p_status text, p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO'); end if;
  if not (public.has_permission(v_uid,'admin_backup','exportar') or public.has_role(v_uid,'administrador')) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para registrar backups.');
  end if;
  if p_data is null or nullif(btrim(coalesce(p_tipo,'')),'') is null or nullif(btrim(coalesce(p_local,'')),'') is null then
    return jsonb_build_object('ok',false,'code','CAMPOS','message','Informe data, tipo e local de armazenamento.');
  end if;
  insert into public.backup_registros (data_backup, tipo, local_armazenamento, status, observacao, responsavel_id)
  values (p_data, btrim(p_tipo), btrim(p_local), coalesce(nullif(btrim(coalesce(p_status,'')),''),'concluido'),
          nullif(btrim(coalesce(p_observacao,'')),''), v_uid)
  returning id into v_id;
  perform public.registrar_auditoria('admin_backup','criar',null,(select to_jsonb(b) from public.backup_registros b where b.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id);
end; $$;
revoke execute on function public.backup_registrar(date,text,text,text,text) from public;
grant execute on function public.backup_registrar(date,text,text,text,text) to authenticated;

-- ---------- DRE GERENCIAL ----------
create or replace function public.dre_gerencial(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_bruto numeric(12,2); v_desc numeric(12,2); v_taxas numeric(12,2); v_liquida numeric(12,2);
  v_custos numeric(12,2); v_comis numeric(12,2); v_entrega numeric(12,2); v_trib numeric(12,2);
  v_desp numeric(12,2); v_folha numeric(12,2); v_margem numeric(12,2); v_result numeric(12,2);
  v_reconhecimento text;
begin
  if v_uid is null or not public.has_permission(v_uid,'financeiro','visualizar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para visualizar o Financeiro.');
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    return jsonb_build_object('ok',false,'code','PERIODO_INVALIDO','message','Período inválido.');
  end if;

  select coalesce(sum(l.valor_bruto),0), coalesce(sum(l.desconto),0), coalesce(sum(l.taxas_total),0), coalesce(sum(l.receita_liquida),0)
    into v_bruto, v_desc, v_taxas, v_liquida
    from public.caixa_lancamentos l
   where l.status='ativo' and l.data_lancamento between p_from and p_to;

  select coalesce(sum(c.custo_total - c.devolvido_total),0) into v_custos
    from public.custos_os c
   where c.status in ('registrado','confirmado') and c.data_lancamento between p_from and p_to;

  select coalesce(sum(c.valor_final),0) into v_comis
    from public.comissoes c
   where c.status <> 'cancelada' and c.data_referencia between p_from and p_to;

  v_reconhecimento := coalesce((select value->>'comissao_entrega_reconhecimento' from public.settings where key='governanca'),'validada');

  select coalesce(sum(ce.valor),0) into v_entrega
    from public.comissoes_entrega ce
    join public.caixa_lancamentos l on l.id = ce.caixa_lancamento_id
   where l.data_lancamento between p_from and p_to
     and ce.status = any (case when v_reconhecimento = 'paga' then array['paga'] else array['validada','paga'] end);

  select coalesce(sum(t.valor),0) into v_trib
    from public.tributos t
   where t.status in ('previsto','confirmado','pago')
     and t.competencia between date_trunc('month',p_from)::date and date_trunc('month',p_to)::date;

  select coalesce(sum(d.valor),0) into v_desp
    from public.despesas d
   where d.status <> 'cancelada' and d.competencia between p_from and p_to;

  select coalesce(sum(case when l.natureza='provento' then l.valor else -l.valor end),0) into v_folha
    from public.folha_lancamentos l
    join public.folha_competencias fc on fc.id = l.competencia_id
   where l.cancelado_em is null and fc.status in ('aprovada','paga','fechada')
     and fc.competencia between p_from and p_to;

  v_margem := v_liquida - v_custos - v_comis - v_entrega - v_trib;
  v_result := v_margem - v_desp - v_folha;

  return jsonb_build_object('ok',true,
    'faturamento_bruto',v_bruto,'descontos',v_desc,'taxas_recebimento',v_taxas,'receita_liquida',v_liquida,
    'custos_diretos',v_custos,'comissoes_tecnicas',v_comis,'comissoes_entrega',v_entrega,
    'comissoes_total', v_comis + v_entrega,
    'comissao_sobre_receita', case when v_liquida>0 then round((v_comis+v_entrega)/v_liquida*100,2) else 0 end,
    'desconto_sobre_faturamento', case when v_bruto>0 then round(v_desc/v_bruto*100,2) else 0 end,
    'tributos',v_trib,'margem_contribuicao',v_margem,'despesas_operacionais',v_desp,'folha_gerencial',v_folha,
    'resultado_operacional',v_result,
    'margem_operacional', case when v_liquida>0 then round(v_result/v_liquida*100,2) else 0 end,
    'reconhecimento_entrega', v_reconhecimento);
end; $$;
revoke execute on function public.dre_gerencial(date,date) from public;
grant execute on function public.dre_gerencial(date,date) to authenticated;

-- indicadores financeiros com tributos e comissão de entrega
create or replace function public.financeiro_indicadores(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Manaus')::date;
  v_dre jsonb;
  v_folha_pend numeric(12,2); v_cp_pend numeric(12,2); v_cr_pend numeric(12,2);
  v_cp_venc numeric(12,2); v_cr_venc numeric(12,2); v_ent30 numeric(12,2); v_sai30 numeric(12,2);
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO','message','Sua sessão expirou. Entre novamente.'); end if;
  v_dre := public.dre_gerencial(p_from, p_to);
  if not coalesce((v_dre->>'ok')::boolean,false) then return v_dre; end if;

  select coalesce(sum(s.t),0)::numeric(12,2) into v_folha_pend
    from (select public.folha_item_total(fc.competencia_id, fc.colaborador_id)
               - coalesce((select sum(p.valor) from public.folha_pagamentos p
                           where p.competencia_id=fc.competencia_id and p.colaborador_id=fc.colaborador_id),0) as t
            from public.folha_colaboradores fc
            join public.folha_competencias comp on comp.id=fc.competencia_id
           where comp.status in ('aprovada','paga')) s where s.t > 0;

  select coalesce(sum(c.valor_original - coalesce(m.pago,0)),0)::numeric(12,2),
         coalesce(sum(case when c.vencimento < v_hoje then c.valor_original - coalesce(m.pago,0) else 0 end),0)::numeric(12,2)
    into v_cp_pend, v_cp_venc
    from public.contas_pagar c
    left join lateral (select sum(pg.valor) as pago from public.contas_pagar_pagamentos pg where pg.conta_pagar_id=c.id) m on true
   where c.status in ('pendente','parcialmente_pago');

  select coalesce(sum(c.valor_original - coalesce(m.rec,0)),0)::numeric(12,2),
         coalesce(sum(case when c.vencimento < v_hoje then c.valor_original - coalesce(m.rec,0) else 0 end),0)::numeric(12,2)
    into v_cr_pend, v_cr_venc
    from public.contas_receber c
    left join lateral (select sum(r.valor) as rec from public.contas_receber_recebimentos r where r.conta_receber_id=c.id) m on true
   where c.status in ('pendente','parcialmente_recebido');

  select coalesce(sum(c.valor_original - coalesce(m.rec,0)),0)::numeric(12,2) into v_ent30
    from public.contas_receber c
    left join lateral (select sum(r.valor) as rec from public.contas_receber_recebimentos r where r.conta_receber_id=c.id) m on true
   where c.status in ('pendente','parcialmente_recebido') and c.vencimento between v_hoje and v_hoje + 30;

  select coalesce(sum(c.valor_original - coalesce(m.pago,0)),0)::numeric(12,2) into v_sai30
    from public.contas_pagar c
    left join lateral (select sum(pg.valor) as pago from public.contas_pagar_pagamentos pg where pg.conta_pagar_id=c.id) m on true
   where c.status in ('pendente','parcialmente_pago') and c.vencimento between v_hoje and v_hoje + 30;

  return v_dre || jsonb_build_object(
    'comissoes', (v_dre->>'comissoes_tecnicas')::numeric,
    'resultado_antes_folha', (v_dre->>'margem_contribuicao')::numeric - (v_dre->>'despesas_operacionais')::numeric,
    'folha_pendente', v_folha_pend,
    'contas_pagar_pendente', v_cp_pend, 'contas_receber_pendente', v_cr_pend,
    'contas_pagar_vencido', v_cp_venc, 'contas_receber_vencido', v_cr_venc,
    'entradas_previstas_30d', v_ent30, 'saidas_previstas_30d', v_sai30,
    'saldo_projetado_30d', v_ent30 - v_sai30);
end; $$;
revoke execute on function public.financeiro_indicadores(date,date) from public;
grant execute on function public.financeiro_indicadores(date,date) to authenticated;

-- ---------- INDICADORES DE DESCONTO ----------
create or replace function public.descontos_indicadores(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_bruto numeric(12,2); v_desc numeric(12,2); v_qtd int;
  v_por_usuario jsonb; v_acima int; v_aprovado numeric(12,2); v_limite numeric;
begin
  if v_uid is null or not public.has_permission(v_uid,'caixa','visualizar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO');
  end if;
  select coalesce(sum(l.valor_bruto),0), coalesce(sum(l.desconto),0), count(*) filter (where l.desconto > 0)
    into v_bruto, v_desc, v_qtd
    from public.caixa_lancamentos l
   where l.status='ativo' and l.data_lancamento between p_from and p_to;

  select coalesce(jsonb_agg(x order by x->>'usuario'),'[]'::jsonb) into v_por_usuario from (
    select jsonb_build_object('usuario', coalesce(pr.full_name,'—'), 'total', sum(l.desconto), 'lancamentos', count(*)) as x
      from public.caixa_lancamentos l
      left join public.profiles pr on pr.id = l.responsavel_id
     where l.status='ativo' and l.desconto > 0 and l.data_lancamento between p_from and p_to
     group by pr.full_name) t;

  select count(*), coalesce(sum(d.valor_desconto) filter (where d.status='aprovado'),0)
    into v_acima, v_aprovado
    from public.descontos_autorizacoes d
   where d.solicitado_em::date between p_from and p_to;

  v_limite := coalesce((select (value->>'alerta_desconto_pct')::numeric from public.settings where key='governanca'), 5);

  return jsonb_build_object('ok',true,
    'faturamento_bruto',v_bruto,'total_descontos',v_desc,'lancamentos_com_desconto',v_qtd,
    'desconto_percentual', case when v_bruto>0 then round(v_desc/v_bruto*100,2) else 0 end,
    'desconto_medio', case when v_qtd>0 then round(v_desc/v_qtd,2) else 0 end,
    'por_usuario', v_por_usuario,
    'solicitacoes_acima_alcada', v_acima, 'valor_aprovado_gestor', v_aprovado,
    'limite_alerta_pct', v_limite,
    'alerta', (v_bruto > 0 and (v_desc/v_bruto*100) > v_limite));
end; $$;
revoke execute on function public.descontos_indicadores(date,date) from public;
grant execute on function public.descontos_indicadores(date,date) to authenticated;

-- ---------- LANÇAMENTO COM ALÇADA ----------
create or replace function public.caixa_registrar_lancamento(
  p_data date, p_os text default null, p_cliente text default null, p_tipo_receita_id uuid default null,
  p_descricao text default null, p_tecnico_id uuid default null, p_valor_bruto numeric default null,
  p_desconto numeric default 0, p_observacao text default null, p_pagamentos jsonb default '[]'::jsonb,
  p_confirmar_duplicidade boolean default false, p_desconto_autorizacao_id uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os,'')),'');
  v_valor_final numeric(12,2); v_soma numeric(12,2); v_id uuid; v_dup record; v_pg jsonb;
  v_pct numeric; v_lim numeric; v_aut record;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO','message','Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid,'caixa','criar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para criar lançamentos.');
  end if;
  if p_data is null then return jsonb_build_object('ok',false,'code','DATA_OBRIGATORIA','message','Informe a data do lançamento.'); end if;
  if p_data > ((now() at time zone 'America/Manaus')::date) and not public.has_permission(v_uid,'caixa','administrar') then
    return jsonb_build_object('ok',false,'code','DATA_FUTURA','message','Não é permitido lançar em data futura.');
  end if;
  if public.caixa_periodo_fechado(p_data) and not public.has_permission(v_uid,'caixa','administrar') then
    return jsonb_build_object('ok',false,'code','PERIODO_FECHADO','message','O caixa desta data já foi fechado. Fale com um administrador.');
  end if;
  if p_tipo_receita_id is null or not exists (select 1 from public.tipos_receita t where t.id=p_tipo_receita_id and t.ativo) then
    return jsonb_build_object('ok',false,'code','TIPO_INVALIDO','message','Selecione o tipo de receita.');
  end if;
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    return jsonb_build_object('ok',false,'code','VALOR_OBRIGATORIO','message','Informe o valor bruto.');
  end if;
  if coalesce(p_desconto,0) < 0 then
    return jsonb_build_object('ok',false,'code','DESCONTO_INVALIDO','message','O desconto não pode ser negativo.');
  end if;
  v_valor_final := round(p_valor_bruto,2) - round(coalesce(p_desconto,0),2);
  if v_valor_final < 0 then
    return jsonb_build_object('ok',false,'code','VALOR_FINAL_NEGATIVO','message','O desconto não pode ser maior que o valor bruto.');
  end if;

  -- Alçada de desconto
  if coalesce(p_desconto,0) > 0 then
    v_pct := round(round(coalesce(p_desconto,0),2) / round(p_valor_bruto,2) * 100, 4);
    v_lim := public.desconto_limite(v_uid);
    if v_lim is not null and v_pct > v_lim then
      if p_desconto_autorizacao_id is null then
        return jsonb_build_object('ok',false,'code','DESCONTO_ACIMA_ALCADA',
          'message','Desconto acima da sua alçada. Solicite autorização de um gestor.',
          'percentual', v_pct, 'limite', v_lim);
      end if;
      select * into v_aut from public.descontos_autorizacoes d where d.id = p_desconto_autorizacao_id;
      if v_aut is null or v_aut.status <> 'aprovado' or v_aut.lancamento_id is not null then
        return jsonb_build_object('ok',false,'code','AUTORIZACAO_INVALIDA','message','Autorização de desconto inválida, já utilizada ou não aprovada.');
      end if;
      if round(coalesce(p_desconto,0),2) > v_aut.valor_desconto then
        return jsonb_build_object('ok',false,'code','AUTORIZACAO_VALOR','message','O desconto informado é maior que o valor autorizado.');
      end if;
    end if;
  end if;

  if p_tecnico_id is not null and not exists (select 1 from public.profiles pr where pr.id=p_tecnico_id and pr.active) then
    return jsonb_build_object('ok',false,'code','TECNICO_INVALIDO','message','Técnico não encontrado ou inativo.');
  end if;

  if v_os is not null and not p_confirmar_duplicidade then
    select l.id, l.data_lancamento, l.cliente, l.valor_final, pr.full_name as responsavel
      into v_dup
      from public.caixa_lancamentos l
      left join public.profiles pr on pr.id = l.responsavel_id
     where l.os = v_os and l.status='ativo'
     order by l.created_at desc limit 1;
    if v_dup.id is not null then
      return jsonb_build_object('ok',false,'code','OS_DUPLICADA',
        'message','Já existe lançamento ativo para esta OS. Confirme para prosseguir.',
        'existente', jsonb_build_object('os',v_os,'data',v_dup.data_lancamento,'cliente',v_dup.cliente,
                                        'valor',v_dup.valor_final,'responsavel',v_dup.responsavel));
    end if;
  end if;

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos)=0 then
    return jsonb_build_object('ok',false,'code','PAGAMENTO_OBRIGATORIO','message','Informe ao menos uma forma de pagamento.');
  end if;

  select coalesce(sum(round((pg->>'valor')::numeric,2)),0) into v_soma from jsonb_array_elements(p_pagamentos) as pg;
  if v_soma <> v_valor_final then
    return jsonb_build_object('ok',false,'code','SOMA_PAGAMENTOS','message','A soma dos pagamentos não corresponde ao valor final.',
      'valor_final',v_valor_final,'total_informado',v_soma,'diferenca',v_valor_final - v_soma);
  end if;

  for v_pg in select * from jsonb_array_elements(p_pagamentos) loop
    if not exists (select 1 from public.formas_pagamento f where f.id=(v_pg->>'forma_pagamento_id')::uuid and f.ativo) then
      return jsonb_build_object('ok',false,'code','FORMA_INVALIDA','message','Forma de pagamento inválida ou inativa.');
    end if;
    if coalesce((v_pg->>'valor')::numeric,0) <= 0 then
      return jsonb_build_object('ok',false,'code','PAGAMENTO_VALOR','message','Todo pagamento deve ter valor maior que zero.');
    end if;
    if coalesce((v_pg->>'taxa_valor')::numeric,0) < 0 or coalesce((v_pg->>'taxa_valor')::numeric,0) > (v_pg->>'valor')::numeric then
      return jsonb_build_object('ok',false,'code','TAXA_INVALIDA','message','A taxa não pode ser negativa nem maior que o pagamento.');
    end if;
  end loop;

  insert into public.caixa_lancamentos (
    data_lancamento, os, cliente, tipo_receita_id, descricao, tecnico_id,
    responsavel_id, valor_bruto, desconto, receita_liquida, observacao,
    alerta_duplicidade, desconto_autorizacao_id, created_by, updated_by
  ) values (
    p_data, v_os, nullif(btrim(coalesce(p_cliente,'')),''), p_tipo_receita_id,
    nullif(btrim(coalesce(p_descricao,'')),''), p_tecnico_id,
    v_uid, round(p_valor_bruto,2), round(coalesce(p_desconto,0),2), v_valor_final,
    nullif(btrim(coalesce(p_observacao,'')),''),
    (v_os is not null and p_confirmar_duplicidade), p_desconto_autorizacao_id, v_uid, v_uid
  ) returning id into v_id;

  insert into public.caixa_pagamentos (lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor)
  select v_id, (pg->>'forma_pagamento_id')::uuid, round((pg->>'valor')::numeric,2),
         greatest(coalesce((pg->>'parcelas')::integer,1),1),
         round(coalesce((pg->>'taxa_percentual')::numeric,0),2),
         round(coalesce((pg->>'taxa_valor')::numeric,0),2)
    from jsonb_array_elements(p_pagamentos) as pg;

  if p_desconto_autorizacao_id is not null then
    update public.descontos_autorizacoes set lancamento_id = v_id, utilizado_em = now()
     where id = p_desconto_autorizacao_id and lancamento_id is null;
  end if;

  perform public.registrar_auditoria('caixa','criar',null,(select to_jsonb(l) from public.caixa_lancamentos l where l.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id,'valor_final',v_valor_final);
end; $$;
revoke execute on function public.caixa_registrar_lancamento(date,text,text,uuid,text,uuid,numeric,numeric,text,jsonb,boolean,uuid) from public;
grant execute on function public.caixa_registrar_lancamento(date,text,text,uuid,text,uuid,numeric,numeric,text,jsonb,boolean,uuid) to authenticated;

drop function if exists public.caixa_registrar_lancamento(date,text,text,uuid,text,uuid,numeric,numeric,text,jsonb,boolean);

-- ---------- BACKUP INFO (alerta) ----------
create or replace function public.admin_backup_status()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_ultimo date; v_dias int; v_intervalo int;
begin
  if v_uid is null or not (public.has_permission(v_uid,'admin_backup','visualizar') or public.has_role(v_uid,'administrador')) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO');
  end if;
  select max(data_backup) into v_ultimo from public.backup_registros where status <> 'falhou';
  v_intervalo := coalesce((select (value->>'backup_intervalo_dias')::int from public.settings where key='governanca'), 7);
  v_dias := case when v_ultimo is null then null else ((now() at time zone 'America/Manaus')::date - v_ultimo) end;
  return jsonb_build_object('ok',true,'ultimo',v_ultimo,'dias',v_dias,'intervalo',v_intervalo,
    'pendente', (v_ultimo is null or v_dias > v_intervalo));
end; $$;
revoke execute on function public.admin_backup_status() from public;
grant execute on function public.admin_backup_status() to authenticated;

-- permitir salvar parâmetros de governança
create or replace function public.admin_config_salvar(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
DECLARE v_uid uuid := auth.uid(); v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF p_key NOT IN ('organization','identidade','financeiro','custos','metas','planejamento','comissao_entrega','governanca') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA');
  END IF;
  SELECT value INTO v_old FROM public.settings WHERE key = p_key;
  INSERT INTO public.settings (key, value) VALUES (p_key, coalesce(v_old,'{}'::jsonb) || p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin_parametros', 'configurar', jsonb_build_object('key', p_key, 'value', v_old),
          jsonb_build_object('key', p_key, 'value', coalesce(v_old,'{}'::jsonb) || p_value));
  RETURN jsonb_build_object('ok', true);
END; $$;
