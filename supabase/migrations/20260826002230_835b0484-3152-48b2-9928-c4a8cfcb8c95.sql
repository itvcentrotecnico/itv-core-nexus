-- ============================================================
-- MÓDULO CAIXA DIÁRIO — GESTÃO ITV CENTRO TÉCNICO (etapa 2)
-- ============================================================

-- 1. Enums de status do caixa
create type public.caixa_lancamento_status as enum ('ativo', 'cancelado', 'estornado');
create type public.caixa_fechamento_status as enum ('fechado', 'reaberto');

-- 2. Catálogos configuráveis
create table public.tipos_receita (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tipos_receita to authenticated;
grant all on public.tipos_receita to service_role;
alter table public.tipos_receita enable row level security;
create policy tipos_receita_select on public.tipos_receita
  for select to authenticated using (true);
create policy tipos_receita_manage on public.tipos_receita
  for all to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'administrar'))
  with check (public.has_permission(auth.uid(), 'caixa', 'administrar'));

create table public.formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ordem integer not null default 0,
  eh_dinheiro boolean not null default false,
  taxa_padrao_percentual numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.formas_pagamento to authenticated;
grant all on public.formas_pagamento to service_role;
alter table public.formas_pagamento enable row level security;
create policy formas_pagamento_select on public.formas_pagamento
  for select to authenticated using (true);
create policy formas_pagamento_manage on public.formas_pagamento
  for all to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'administrar'))
  with check (public.has_permission(auth.uid(), 'caixa', 'administrar'));

-- 3. Lançamentos do caixa
create table public.caixa_lancamentos (
  id uuid primary key default gen_random_uuid(),
  data_lancamento date not null default ((now() at time zone 'America/Manaus')::date),
  os text,
  cliente text,
  tipo_receita_id uuid not null references public.tipos_receita(id),
  descricao text,
  tecnico_id uuid references public.profiles(id),
  responsavel_id uuid not null references public.profiles(id),
  valor_bruto numeric(12,2) not null check (valor_bruto > 0),
  desconto numeric(12,2) not null default 0 check (desconto >= 0),
  valor_final numeric(12,2) generated always as (valor_bruto - desconto) stored,
  taxas_total numeric(12,2) not null default 0,
  receita_liquida numeric(12,2) not null default 0,
  status public.caixa_lancamento_status not null default 'ativo',
  observacao text,
  alerta_duplicidade boolean not null default false,
  cancelado_em timestamptz,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  check (desconto <= valor_bruto)
);
create index caixa_lancamentos_data_idx on public.caixa_lancamentos (data_lancamento);
create index caixa_lancamentos_os_idx on public.caixa_lancamentos (os) where os is not null;
create index caixa_lancamentos_status_idx on public.caixa_lancamentos (status);
grant select, insert, update on public.caixa_lancamentos to authenticated;
grant all on public.caixa_lancamentos to service_role;
alter table public.caixa_lancamentos enable row level security;

-- 4. Pagamentos (pagamento misto — 1 lançamento, N pagamentos)
create table public.caixa_pagamentos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.caixa_lancamentos(id) on delete cascade,
  forma_pagamento_id uuid not null references public.formas_pagamento(id),
  valor numeric(12,2) not null check (valor > 0),
  parcelas integer not null default 1 check (parcelas >= 1),
  taxa_percentual numeric(5,2) not null default 0 check (taxa_percentual >= 0),
  taxa_valor numeric(12,2) not null default 0 check (taxa_valor >= 0),
  valor_liquido numeric(12,2) generated always as (valor - taxa_valor) stored,
  created_at timestamptz not null default now()
);
create index caixa_pagamentos_lancamento_idx on public.caixa_pagamentos (lancamento_id);
create index caixa_pagamentos_forma_idx on public.caixa_pagamentos (forma_pagamento_id);
grant select, insert, update, delete on public.caixa_pagamentos to authenticated;
grant all on public.caixa_pagamentos to service_role;
alter table public.caixa_pagamentos enable row level security;

-- 5. Fechamentos diários
create table public.caixa_fechamentos (
  id uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  responsavel_id uuid not null references public.profiles(id),
  faturamento_total numeric(12,2) not null default 0,
  taxas_total numeric(12,2) not null default 0,
  receita_liquida numeric(12,2) not null default 0,
  dinheiro_esperado numeric(12,2) not null default 0,
  dinheiro_informado numeric(12,2) not null default 0,
  diferenca numeric(12,2) generated always as (dinheiro_informado - dinheiro_esperado) stored,
  resumo_pagamentos jsonb not null default '[]'::jsonb,
  observacao text,
  status public.caixa_fechamento_status not null default 'fechado',
  fechado_em timestamptz not null default now(),
  reaberto_em timestamptz,
  reaberto_por uuid references public.profiles(id),
  motivo_reabertura text
);
create unique index caixa_fechamentos_unico_fechado_idx
  on public.caixa_fechamentos (data_referencia) where status = 'fechado';
grant select, insert, update on public.caixa_fechamentos to authenticated;
grant all on public.caixa_fechamentos to service_role;
alter table public.caixa_fechamentos enable row level security;

-- 6. Estornos (rastreabilidade completa — nunca zera o lançamento original)
create table public.caixa_estornos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.caixa_lancamentos(id),
  valor numeric(12,2) not null check (valor > 0),
  motivo text not null,
  forma_estorno text,
  observacao text,
  responsavel_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index caixa_estornos_lancamento_idx on public.caixa_estornos (lancamento_id);
grant select, insert on public.caixa_estornos to authenticated;
grant all on public.caixa_estornos to service_role;
alter table public.caixa_estornos enable row level security;

-- 7. Funções auxiliares
create or replace function public.caixa_periodo_fechado(p_data date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.caixa_fechamentos f
    where f.data_referencia = p_data and f.status = 'fechado'
  )
$$;

create or replace function public.usuarios_basicos()
returns table (id uuid, full_name text, email text, roles text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.email,
         coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}'::text[]) as roles
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  where p.active
  group by p.id, p.full_name, p.email
  order by p.full_name
$$;

create or replace function public.registrar_auditoria(
  p_module text,
  p_action text,
  p_old jsonb default null,
  p_new jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (user_id, module_key, action, old_value, new_value)
  values (auth.uid(), p_module, p_action, p_old, p_new);
end;
$$;

-- Recalcula taxas e receita líquida do lançamento quando pagamentos mudam
create or replace function public.caixa_recalc_totais()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lancamento uuid;
begin
  v_lancamento := coalesce(new.lancamento_id, old.lancamento_id);
  update public.caixa_lancamentos l
     set taxas_total = coalesce((
           select sum(p.taxa_valor) from public.caixa_pagamentos p where p.lancamento_id = v_lancamento
         ), 0),
         receita_liquida = l.valor_final - coalesce((
           select sum(p.taxa_valor) from public.caixa_pagamentos p where p.lancamento_id = v_lancamento
         ), 0),
         updated_at = now()
   where l.id = v_lancamento;
  return coalesce(new, old);
end;
$$;

create trigger caixa_pagamentos_recalc
  after insert or update or delete on public.caixa_pagamentos
  for each row execute function public.caixa_recalc_totais();

create trigger update_caixa_lancamentos_updated_at
  before update on public.caixa_lancamentos
  for each row execute function public.update_updated_at_column();

-- 8. Políticas RLS — caixa_lancamentos (exclusão física negada para todos)
create policy caixa_lancamentos_select on public.caixa_lancamentos
  for select to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'visualizar'));

create policy caixa_lancamentos_insert on public.caixa_lancamentos
  for insert to authenticated
  with check (
    public.has_permission(auth.uid(), 'caixa', 'criar')
    and (responsavel_id = auth.uid() or public.has_role(auth.uid(), 'administrador'))
    and (not public.caixa_periodo_fechado(data_lancamento)
         or public.has_permission(auth.uid(), 'caixa', 'administrar'))
  );

create policy caixa_lancamentos_update on public.caixa_lancamentos
  for update to authenticated
  using (
    (public.has_permission(auth.uid(), 'caixa', 'editar')
     or public.has_permission(auth.uid(), 'caixa', 'cancelar')
     or public.has_permission(auth.uid(), 'caixa', 'estornar'))
    and (not public.caixa_periodo_fechado(data_lancamento)
         or public.has_permission(auth.uid(), 'caixa', 'administrar'))
  )
  with check (
    (public.has_permission(auth.uid(), 'caixa', 'editar')
     or public.has_permission(auth.uid(), 'caixa', 'cancelar')
     or public.has_permission(auth.uid(), 'caixa', 'estornar'))
    and (not public.caixa_periodo_fechado(data_lancamento)
         or public.has_permission(auth.uid(), 'caixa', 'administrar'))
  );

-- 9. Políticas RLS — caixa_pagamentos
create policy caixa_pagamentos_select on public.caixa_pagamentos
  for select to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'visualizar'));

create policy caixa_pagamentos_insert on public.caixa_pagamentos
  for insert to authenticated
  with check (public.has_permission(auth.uid(), 'caixa', 'criar')
              or public.has_permission(auth.uid(), 'caixa', 'editar'));

create policy caixa_pagamentos_update on public.caixa_pagamentos
  for update to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'editar'))
  with check (public.has_permission(auth.uid(), 'caixa', 'editar'));

create policy caixa_pagamentos_delete on public.caixa_pagamentos
  for delete to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'editar'));

-- 10. Políticas RLS — caixa_fechamentos
create policy caixa_fechamentos_select on public.caixa_fechamentos
  for select to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'visualizar'));

create policy caixa_fechamentos_insert on public.caixa_fechamentos
  for insert to authenticated
  with check (responsavel_id = auth.uid()
              and public.has_permission(auth.uid(), 'caixa', 'fechar'));

create policy caixa_fechamentos_update on public.caixa_fechamentos
  for update to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'reabrir'))
  with check (public.has_permission(auth.uid(), 'caixa', 'reabrir'));

-- 11. Políticas RLS — caixa_estornos
create policy caixa_estornos_select on public.caixa_estornos
  for select to authenticated
  using (public.has_permission(auth.uid(), 'caixa', 'visualizar'));

create policy caixa_estornos_insert on public.caixa_estornos
  for insert to authenticated
  with check (responsavel_id = auth.uid()
              and public.has_permission(auth.uid(), 'caixa', 'estornar'));

-- 12. Registrar lançamento (validações de negócio no banco)
create or replace function public.caixa_registrar_lancamento(
  p_data date,
  p_os text default null,
  p_cliente text default null,
  p_tipo_receita_id uuid default null,
  p_descricao text default null,
  p_tecnico_id uuid default null,
  p_valor_bruto numeric default null,
  p_desconto numeric default 0,
  p_observacao text default null,
  p_pagamentos jsonb default '[]'::jsonb,
  p_confirmar_duplicidade boolean default false
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_valor_final numeric(12,2);
  v_soma numeric(12,2);
  v_id uuid;
  v_dup record;
  v_pg jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para criar lançamentos.');
  end if;

  if p_data is null then
    return jsonb_build_object('ok', false, 'code', 'DATA_OBRIGATORIA', 'message', 'Informe a data do lançamento.');
  end if;

  if p_data > ((now() at time zone 'America/Manaus')::date)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'DATA_FUTURA', 'message', 'Não é permitido lançar em data futura.');
  end if;

  if public.caixa_periodo_fechado(p_data)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO', 'message', 'O caixa desta data já foi fechado. Fale com um administrador.');
  end if;

  if p_tipo_receita_id is null
     or not exists (select 1 from public.tipos_receita t where t.id = p_tipo_receita_id and t.ativo) then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Selecione o tipo de receita.');
  end if;

  if p_valor_bruto is null or p_valor_bruto <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_OBRIGATORIO', 'message', 'Informe o valor bruto.');
  end if;

  if coalesce(p_desconto, 0) < 0 then
    return jsonb_build_object('ok', false, 'code', 'DESCONTO_INVALIDO', 'message', 'O desconto não pode ser negativo.');
  end if;

  v_valor_final := round(p_valor_bruto, 2) - round(coalesce(p_desconto, 0), 2);
  if v_valor_final < 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_FINAL_NEGATIVO', 'message', 'O desconto não pode ser maior que o valor bruto.');
  end if;

  if p_tecnico_id is not null
     and not exists (select 1 from public.profiles pr where pr.id = p_tecnico_id and pr.active) then
    return jsonb_build_object('ok', false, 'code', 'TECNICO_INVALIDO', 'message', 'Técnico não encontrado ou inativo.');
  end if;

  -- Alerta de OS duplicada: não bloqueia, exige confirmação explícita
  if v_os is not null and not p_confirmar_duplicidade then
    select l.id, l.data_lancamento, l.cliente, l.valor_final, pr.full_name as responsavel
      into v_dup
      from public.caixa_lancamentos l
      left join public.profiles pr on pr.id = l.responsavel_id
     where l.os = v_os and l.status = 'ativo'
     order by l.created_at desc
     limit 1;
    if found then
      return jsonb_build_object(
        'ok', false,
        'code', 'OS_DUPLICADA',
        'message', 'Atenção — esta OS já possui lançamento financeiro.',
        'existente', jsonb_build_object(
          'os', v_os,
          'data', v_dup.data_lancamento,
          'cliente', v_dup.cliente,
          'valor', v_dup.valor_final,
          'responsavel', v_dup.responsavel
        )
      );
    end if;
  end if;

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    return jsonb_build_object('ok', false, 'code', 'PAGAMENTO_OBRIGATORIO', 'message', 'Informe ao menos uma forma de pagamento.');
  end if;

  select coalesce(sum(round((pg ->> 'valor')::numeric, 2)), 0)
    into v_soma
    from jsonb_array_elements(p_pagamentos) as pg;

  if v_soma <> v_valor_final then
    return jsonb_build_object(
      'ok', false,
      'code', 'SOMA_PAGAMENTOS',
      'message', 'A soma dos pagamentos não corresponde ao valor final.',
      'valor_final', v_valor_final,
      'total_informado', v_soma,
      'diferenca', v_valor_final - v_soma
    );
  end if;

  for v_pg in select * from jsonb_array_elements(p_pagamentos) loop
    if not exists (
      select 1 from public.formas_pagamento f
      where f.id = (v_pg ->> 'forma_pagamento_id')::uuid and f.ativo
    ) then
      return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Forma de pagamento inválida ou inativa.');
    end if;
    if coalesce((v_pg ->> 'valor')::numeric, 0) <= 0 then
      return jsonb_build_object('ok', false, 'code', 'PAGAMENTO_VALOR', 'message', 'Todo pagamento deve ter valor maior que zero.');
    end if;
    if coalesce((v_pg ->> 'taxa_valor')::numeric, 0) < 0
       or coalesce((v_pg ->> 'taxa_valor')::numeric, 0) > (v_pg ->> 'valor')::numeric then
      return jsonb_build_object('ok', false, 'code', 'TAXA_INVALIDA', 'message', 'A taxa não pode ser negativa nem maior que o pagamento.');
    end if;
  end loop;

  insert into public.caixa_lancamentos (
    data_lancamento, os, cliente, tipo_receita_id, descricao, tecnico_id,
    responsavel_id, valor_bruto, desconto, receita_liquida, observacao,
    alerta_duplicidade, created_by, updated_by
  ) values (
    p_data, v_os, nullif(btrim(coalesce(p_cliente, '')), ''), p_tipo_receita_id,
    nullif(btrim(coalesce(p_descricao, '')), ''), p_tecnico_id,
    v_uid, round(p_valor_bruto, 2), round(coalesce(p_desconto, 0), 2), v_valor_final,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    (v_os is not null and p_confirmar_duplicidade), v_uid, v_uid
  )
  returning id into v_id;

  insert into public.caixa_pagamentos (lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor)
  select v_id,
         (pg ->> 'forma_pagamento_id')::uuid,
         round((pg ->> 'valor')::numeric, 2),
         greatest(coalesce((pg ->> 'parcelas')::integer, 1), 1),
         round(coalesce((pg ->> 'taxa_percentual')::numeric, 0), 2),
         round(coalesce((pg ->> 'taxa_valor')::numeric, 0), 2)
    from jsonb_array_elements(p_pagamentos) as pg;

  perform public.registrar_auditoria('caixa', 'criar', null,
    (select to_jsonb(l) from public.caixa_lancamentos l where l.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'valor_final', v_valor_final);
end;
$$;

-- 13. Editar lançamento
create or replace function public.caixa_atualizar_lancamento(
  p_id uuid,
  p_data date,
  p_os text default null,
  p_cliente text default null,
  p_tipo_receita_id uuid default null,
  p_descricao text default null,
  p_tecnico_id uuid default null,
  p_valor_bruto numeric default null,
  p_desconto numeric default 0,
  p_observacao text default null,
  p_pagamentos jsonb default '[]'::jsonb,
  p_confirmar_duplicidade boolean default false
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_antigo public.caixa_lancamentos%rowtype;
  v_valor_final numeric(12,2);
  v_soma numeric(12,2);
  v_dup record;
  v_pg jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar lançamentos.');
  end if;

  select * into v_antigo from public.caixa_lancamentos l where l.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Lançamento não encontrado.');
  end if;

  if v_antigo.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'code', 'NAO_EDITAVEL', 'message', 'Somente lançamentos ativos podem ser editados.');
  end if;

  if p_data is null then
    return jsonb_build_object('ok', false, 'code', 'DATA_OBRIGATORIA', 'message', 'Informe a data do lançamento.');
  end if;

  if (public.caixa_periodo_fechado(v_antigo.data_lancamento) or public.caixa_periodo_fechado(p_data))
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO', 'message', 'Este lançamento pertence a um período já fechado. Fale com um administrador.');
  end if;

  if p_data > ((now() at time zone 'America/Manaus')::date)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'DATA_FUTURA', 'message', 'Não é permitido lançar em data futura.');
  end if;

  if p_tipo_receita_id is null
     or not exists (select 1 from public.tipos_receita t where t.id = p_tipo_receita_id and t.ativo) then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Selecione o tipo de receita.');
  end if;

  if p_valor_bruto is null or p_valor_bruto <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_OBRIGATORIO', 'message', 'Informe o valor bruto.');
  end if;

  if coalesce(p_desconto, 0) < 0 then
    return jsonb_build_object('ok', false, 'code', 'DESCONTO_INVALIDO', 'message', 'O desconto não pode ser negativo.');
  end if;

  v_valor_final := round(p_valor_bruto, 2) - round(coalesce(p_desconto, 0), 2);
  if v_valor_final < 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_FINAL_NEGATIVO', 'message', 'O desconto não pode ser maior que o valor bruto.');
  end if;

  if p_tecnico_id is not null
     and not exists (select 1 from public.profiles pr where pr.id = p_tecnico_id and pr.active) then
    return jsonb_build_object('ok', false, 'code', 'TECNICO_INVALIDO', 'message', 'Técnico não encontrado ou inativo.');
  end if;

  if v_os is not null and not p_confirmar_duplicidade then
    select l.id, l.data_lancamento, l.cliente, l.valor_final, pr.full_name as responsavel
      into v_dup
      from public.caixa_lancamentos l
      left join public.profiles pr on pr.id = l.responsavel_id
     where l.os = v_os and l.status = 'ativo' and l.id <> p_id
     order by l.created_at desc
     limit 1;
    if found then
      return jsonb_build_object(
        'ok', false,
        'code', 'OS_DUPLICADA',
        'message', 'Atenção — esta OS já possui lançamento financeiro.',
        'existente', jsonb_build_object(
          'os', v_os,
          'data', v_dup.data_lancamento,
          'cliente', v_dup.cliente,
          'valor', v_dup.valor_final,
          'responsavel', v_dup.responsavel
        )
      );
    end if;
  end if;

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    return jsonb_build_object('ok', false, 'code', 'PAGAMENTO_OBRIGATORIO', 'message', 'Informe ao menos uma forma de pagamento.');
  end if;

  select coalesce(sum(round((pg ->> 'valor')::numeric, 2)), 0)
    into v_soma
    from jsonb_array_elements(p_pagamentos) as pg;

  if v_soma <> v_valor_final then
    return jsonb_build_object(
      'ok', false,
      'code', 'SOMA_PAGAMENTOS',
      'message', 'A soma dos pagamentos não corresponde ao valor final.',
      'valor_final', v_valor_final,
      'total_informado', v_soma,
      'diferenca', v_valor_final - v_soma
    );
  end if;

  for v_pg in select * from jsonb_array_elements(p_pagamentos) loop
    if not exists (
      select 1 from public.formas_pagamento f
      where f.id = (v_pg ->> 'forma_pagamento_id')::uuid and f.ativo
    ) then
      return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Forma de pagamento inválida ou inativa.');
    end if;
    if coalesce((v_pg ->> 'valor')::numeric, 0) <= 0 then
      return jsonb_build_object('ok', false, 'code', 'PAGAMENTO_VALOR', 'message', 'Todo pagamento deve ter valor maior que zero.');
    end if;
    if coalesce((v_pg ->> 'taxa_valor')::numeric, 0) < 0
       or coalesce((v_pg ->> 'taxa_valor')::numeric, 0) > (v_pg ->> 'valor')::numeric then
      return jsonb_build_object('ok', false, 'code', 'TAXA_INVALIDA', 'message', 'A taxa não pode ser negativa nem maior que o pagamento.');
    end if;
  end loop;

  update public.caixa_lancamentos set
    data_lancamento = p_data,
    os = v_os,
    cliente = nullif(btrim(coalesce(p_cliente, '')), ''),
    tipo_receita_id = p_tipo_receita_id,
    descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
    tecnico_id = p_tecnico_id,
    valor_bruto = round(p_valor_bruto, 2),
    desconto = round(coalesce(p_desconto, 0), 2),
    receita_liquida = v_valor_final,
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    alerta_duplicidade = (v_os is not null and p_confirmar_duplicidade),
    updated_by = v_uid
  where id = p_id;

  delete from public.caixa_pagamentos where lancamento_id = p_id;

  insert into public.caixa_pagamentos (lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor)
  select p_id,
         (pg ->> 'forma_pagamento_id')::uuid,
         round((pg ->> 'valor')::numeric, 2),
         greatest(coalesce((pg ->> 'parcelas')::integer, 1), 1),
         round(coalesce((pg ->> 'taxa_percentual')::numeric, 0), 2),
         round(coalesce((pg ->> 'taxa_valor')::numeric, 0), 2)
    from jsonb_array_elements(p_pagamentos) as pg;

  perform public.registrar_auditoria('caixa', 'editar', to_jsonb(v_antigo),
    (select to_jsonb(l) from public.caixa_lancamentos l where l.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'valor_final', v_valor_final);
end;
$$;

-- 14. Cancelar lançamento (motivo obrigatório, histórico preservado)
create or replace function public.caixa_cancelar_lancamento(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.caixa_lancamentos%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar lançamentos.');
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;

  select * into v_antigo from public.caixa_lancamentos l where l.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Lançamento não encontrado.');
  end if;

  if v_antigo.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'code', 'JA_INATIVO', 'message', 'Este lançamento já não está ativo.');
  end if;

  if public.caixa_periodo_fechado(v_antigo.data_lancamento)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO', 'message', 'Este lançamento pertence a um período já fechado. Fale com um administrador.');
  end if;

  update public.caixa_lancamentos set
    status = 'cancelado',
    cancelado_em = now(),
    cancelado_por = v_uid,
    motivo_cancelamento = btrim(p_motivo),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('caixa', 'cancelar', to_jsonb(v_antigo),
    (select to_jsonb(l) from public.caixa_lancamentos l where l.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- 15. Estornar lançamento (registro separado, valor original preservado)
create or replace function public.caixa_estornar_lancamento(
  p_id uuid,
  p_motivo text,
  p_forma_estorno text default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.caixa_lancamentos%rowtype;
  v_estorno_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'estornar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para estornar lançamentos.');
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do estorno.');
  end if;

  select * into v_antigo from public.caixa_lancamentos l where l.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Lançamento não encontrado.');
  end if;

  if v_antigo.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'code', 'JA_INATIVO', 'message', 'Somente lançamentos ativos podem ser estornados.');
  end if;

  if public.caixa_periodo_fechado(v_antigo.data_lancamento)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO', 'message', 'Este lançamento pertence a um período já fechado. Fale com um administrador.');
  end if;

  insert into public.caixa_estornos (lancamento_id, valor, motivo, forma_estorno, observacao, responsavel_id)
  values (p_id, v_antigo.valor_final, btrim(p_motivo),
          nullif(btrim(coalesce(p_forma_estorno, '')), ''),
          nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_estorno_id;

  update public.caixa_lancamentos set
    status = 'estornado',
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('caixa', 'estornar', to_jsonb(v_antigo),
    (select to_jsonb(e) from public.caixa_estornos e where e.id = v_estorno_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'estorno_id', v_estorno_id, 'valor', v_antigo.valor_final);
end;
$$;

-- 16. Fechar caixa (conferência financeira do dia)
create or replace function public.caixa_fechar(
  p_data_referencia date,
  p_dinheiro_informado numeric,
  p_observacao text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_faturamento numeric(12,2);
  v_taxas numeric(12,2);
  v_liquida numeric(12,2);
  v_esperado numeric(12,2);
  v_diferenca numeric(12,2);
  v_resumo jsonb;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'fechar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para fechar o caixa.');
  end if;

  if p_data_referencia is null then
    return jsonb_build_object('ok', false, 'code', 'DATA_OBRIGATORIA', 'message', 'Informe a data do fechamento.');
  end if;

  if exists (
    select 1 from public.caixa_fechamentos f
    where f.data_referencia = p_data_referencia and f.status = 'fechado'
  ) then
    return jsonb_build_object('ok', false, 'code', 'JA_FECHADO', 'message', 'Este dia já está fechado. Reabra o caixa para ajustar.');
  end if;

  if p_dinheiro_informado is null or p_dinheiro_informado < 0 then
    return jsonb_build_object('ok', false, 'code', 'DINHEIRO_INVALIDO', 'message', 'Informe o valor em dinheiro contado no caixa.');
  end if;

  select coalesce(sum(l.valor_final), 0),
         coalesce(sum(l.taxas_total), 0),
         coalesce(sum(l.receita_liquida), 0)
    into v_faturamento, v_taxas, v_liquida
    from public.caixa_lancamentos l
   where l.status = 'ativo' and l.data_lancamento = p_data_referencia;

  select coalesce(sum(p.valor), 0)
    into v_esperado
    from public.caixa_pagamentos p
    join public.caixa_lancamentos l on l.id = p.lancamento_id
    join public.formas_pagamento f on f.id = p.forma_pagamento_id
   where l.status = 'ativo' and l.data_lancamento = p_data_referencia and f.eh_dinheiro;

  v_diferenca := round(p_dinheiro_informado, 2) - v_esperado;

  if v_diferenca <> 0 and nullif(btrim(coalesce(p_observacao, '')), '') is null then
    return jsonb_build_object(
      'ok', false,
      'code', 'OBSERVACAO_OBRIGATORIA',
      'message', 'Há divergência no dinheiro. Informe uma observação para concluir o fechamento.',
      'dinheiro_esperado', v_esperado,
      'diferenca', v_diferenca
    );
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('forma', t.nome, 'total', t.total, 'taxas', t.taxas) order by t.ordem
         ), '[]'::jsonb)
    into v_resumo
    from (
      select f.nome, f.ordem, sum(p.valor) as total, sum(p.taxa_valor) as taxas
        from public.caixa_pagamentos p
        join public.caixa_lancamentos l on l.id = p.lancamento_id
        join public.formas_pagamento f on f.id = p.forma_pagamento_id
       where l.status = 'ativo' and l.data_lancamento = p_data_referencia
       group by f.nome, f.ordem
    ) t;

  insert into public.caixa_fechamentos (
    data_referencia, responsavel_id, faturamento_total, taxas_total, receita_liquida,
    dinheiro_esperado, dinheiro_informado, resumo_pagamentos, observacao
  ) values (
    p_data_referencia, v_uid, v_faturamento, v_taxas, v_liquida,
    v_esperado, round(p_dinheiro_informado, 2), v_resumo,
    nullif(btrim(coalesce(p_observacao, '')), '')
  )
  returning id into v_id;

  perform public.registrar_auditoria('caixa', 'fechar', null,
    (select to_jsonb(f) from public.caixa_fechamentos f where f.id = v_id));

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'faturamento_total', v_faturamento,
    'receita_liquida', v_liquida,
    'dinheiro_esperado', v_esperado,
    'dinheiro_informado', round(p_dinheiro_informado, 2),
    'diferenca', v_diferenca
  );
end;
$$;

-- 17. Reabrir caixa (somente perfil autorizado, justificativa obrigatória)
create or replace function public.caixa_reabrir(p_fechamento_id uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_fechamento public.caixa_fechamentos%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'reabrir') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para reabrir o caixa.');
  end if;

  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe a justificativa da reabertura.');
  end if;

  select * into v_fechamento from public.caixa_fechamentos f where f.id = p_fechamento_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Fechamento não encontrado.');
  end if;

  if v_fechamento.status <> 'fechado' then
    return jsonb_build_object('ok', false, 'code', 'JA_REABERTO', 'message', 'Este caixa já está reaberto.');
  end if;

  update public.caixa_fechamentos set
    status = 'reaberto',
    reaberto_em = now(),
    reaberto_por = v_uid,
    motivo_reabertura = btrim(p_motivo)
  where id = p_fechamento_id;

  perform public.registrar_auditoria('caixa', 'reabrir', to_jsonb(v_fechamento),
    (select to_jsonb(f) from public.caixa_fechamentos f where f.id = p_fechamento_id));

  return jsonb_build_object('ok', true, 'id', p_fechamento_id);
end;
$$;

-- 18. Indicadores agregados para o Dashboard (não expõe linhas, somente totais)
create or replace function public.caixa_indicadores(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
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
         count(distinct l.os) filter (where l.os is not null) as os_faturadas
    into v
    from public.caixa_lancamentos l
   where l.status = 'ativo'
     and l.data_lancamento between p_from and p_to;

  return jsonb_build_object(
    'ok', true,
    'quantidade', v.qtd,
    'faturamento_bruto', v.bruto,
    'descontos', v.descontos,
    'faturamento_final', v.faturamento,
    'taxas', v.taxas,
    'receita_liquida', v.liquida,
    'os_faturadas', v.os_faturadas,
    'ticket_medio', case when v.qtd > 0 then round(v.faturamento / v.qtd, 2) else 0 end
  );
end;
$$;

-- 19. Privilégios de execução das funções
revoke all on function public.caixa_periodo_fechado(date) from public, anon;
grant execute on function public.caixa_periodo_fechado(date) to authenticated;

revoke all on function public.usuarios_basicos() from public, anon;
grant execute on function public.usuarios_basicos() to authenticated;

revoke all on function public.registrar_auditoria(text, text, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_auditoria(text, text, jsonb, jsonb) to authenticated;

revoke all on function public.caixa_recalc_totais() from public, anon, authenticated;

revoke all on function public.caixa_registrar_lancamento(date, text, text, uuid, text, uuid, numeric, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.caixa_registrar_lancamento(date, text, text, uuid, text, uuid, numeric, numeric, text, jsonb, boolean) to authenticated;

revoke all on function public.caixa_atualizar_lancamento(uuid, date, text, text, uuid, text, uuid, numeric, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.caixa_atualizar_lancamento(uuid, date, text, text, uuid, text, uuid, numeric, numeric, text, jsonb, boolean) to authenticated;

revoke all on function public.caixa_cancelar_lancamento(uuid, text) from public, anon;
grant execute on function public.caixa_cancelar_lancamento(uuid, text) to authenticated;

revoke all on function public.caixa_estornar_lancamento(uuid, text, text, text) from public, anon;
grant execute on function public.caixa_estornar_lancamento(uuid, text, text, text) to authenticated;

revoke all on function public.caixa_fechar(date, numeric, text) from public, anon;
grant execute on function public.caixa_fechar(date, numeric, text) to authenticated;

revoke all on function public.caixa_reabrir(uuid, text) from public, anon;
grant execute on function public.caixa_reabrir(uuid, text) to authenticated;

revoke all on function public.caixa_indicadores(date, date) from public, anon;
grant execute on function public.caixa_indicadores(date, date) to authenticated;