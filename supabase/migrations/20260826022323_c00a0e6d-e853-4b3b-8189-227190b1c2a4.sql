create type public.despesa_status as enum ('pendente', 'paga', 'cancelada');
create type public.conta_pagar_status as enum ('pendente', 'parcialmente_pago', 'pago', 'cancelado');
create type public.conta_receber_status as enum ('pendente', 'parcialmente_recebido', 'recebido', 'cancelado');

-- ============ CATEGORIAS / SUBCATEGORIAS / CENTROS DE CUSTO ============

create table public.categorias_financeiras (
  id uuid not null default gen_random_uuid() primary key,
  nome text not null,
  tipo text not null default 'despesa' check (tipo in ('despesa', 'receita', 'ambos')),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamp with time zone not null default now()
);
grant select, insert, update on public.categorias_financeiras to authenticated;
grant all on public.categorias_financeiras to service_role;
alter table public.categorias_financeiras enable row level security;
create policy "categorias_fin_select" on public.categorias_financeiras for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));
create policy "categorias_fin_insert" on public.categorias_financeiras for insert to authenticated
  with check (public.has_permission(auth.uid(), 'financeiro', 'configurar'));
create policy "categorias_fin_update" on public.categorias_financeiras for update to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'configurar'))
  with check (public.has_permission(auth.uid(), 'financeiro', 'configurar'));

create table public.subcategorias_financeiras (
  id uuid not null default gen_random_uuid() primary key,
  categoria_id uuid not null references public.categorias_financeiras(id),
  nome text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamp with time zone not null default now()
);
grant select, insert, update on public.subcategorias_financeiras to authenticated;
grant all on public.subcategorias_financeiras to service_role;
alter table public.subcategorias_financeiras enable row level security;
create policy "subcategorias_fin_select" on public.subcategorias_financeiras for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));
create policy "subcategorias_fin_insert" on public.subcategorias_financeiras for insert to authenticated
  with check (public.has_permission(auth.uid(), 'financeiro', 'configurar'));
create policy "subcategorias_fin_update" on public.subcategorias_financeiras for update to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'configurar'))
  with check (public.has_permission(auth.uid(), 'financeiro', 'configurar'));

create table public.centros_custo (
  id uuid not null default gen_random_uuid() primary key,
  nome text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamp with time zone not null default now()
);
grant select, insert, update on public.centros_custo to authenticated;
grant all on public.centros_custo to service_role;
alter table public.centros_custo enable row level security;
create policy "centros_custo_select" on public.centros_custo for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));
create policy "centros_custo_insert" on public.centros_custo for insert to authenticated
  with check (public.has_permission(auth.uid(), 'financeiro', 'configurar'));
create policy "centros_custo_update" on public.centros_custo for update to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'configurar'))
  with check (public.has_permission(auth.uid(), 'financeiro', 'configurar'));

-- ============ DESPESAS ============

create table public.despesas (
  id uuid not null default gen_random_uuid() primary key,
  descricao text not null,
  categoria_id uuid references public.categorias_financeiras(id),
  subcategoria_id uuid references public.subcategorias_financeiras(id),
  fornecedor_id uuid references public.fornecedores(id),
  centro_custo_id uuid references public.centros_custo(id),
  competencia date not null,
  data_lancamento date not null,
  vencimento date,
  valor numeric(12,2) not null check (valor > 0),
  status public.despesa_status not null default 'pendente',
  recorrente boolean not null default false,
  observacao text,
  comprovante_path text,
  responsavel_id uuid not null references public.profiles(id),
  conta_pagar_id uuid,
  cancelado_em timestamp with time zone,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelamento text,
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamp with time zone not null default now()
);
grant select on public.despesas to authenticated;
grant all on public.despesas to service_role;
alter table public.despesas enable row level security;
create policy "despesas_select" on public.despesas for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));

-- ============ CONTAS A PAGAR ============

create table public.contas_pagar (
  id uuid not null default gen_random_uuid() primary key,
  descricao text not null,
  fornecedor_id uuid references public.fornecedores(id),
  categoria_id uuid references public.categorias_financeiras(id),
  subcategoria_id uuid references public.subcategorias_financeiras(id),
  centro_custo_id uuid references public.centros_custo(id),
  despesa_id uuid references public.despesas(id),
  competencia date,
  data_emissao date not null,
  vencimento date not null,
  valor_original numeric(12,2) not null check (valor_original > 0),
  forma_pagamento_id uuid references public.formas_pagamento(id),
  status public.conta_pagar_status not null default 'pendente',
  recorrente boolean not null default false,
  parcela_atual integer,
  parcela_total integer,
  grupo_parcela uuid,
  observacao text,
  cancelado_em timestamp with time zone,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelamento text,
  responsavel_id uuid not null references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamp with time zone not null default now()
);
grant select on public.contas_pagar to authenticated;
grant all on public.contas_pagar to service_role;
alter table public.contas_pagar enable row level security;
create policy "contas_pagar_select" on public.contas_pagar for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));

alter table public.despesas
  add constraint despesas_conta_pagar_id_fkey foreign key (conta_pagar_id) references public.contas_pagar(id);
create unique index despesas_conta_pagar_uidx on public.despesas(conta_pagar_id) where conta_pagar_id is not null;

create table public.contas_pagar_pagamentos (
  id uuid not null default gen_random_uuid() primary key,
  conta_pagar_id uuid not null references public.contas_pagar(id),
  data_pagamento date not null,
  valor numeric(12,2) not null,
  forma_pagamento_id uuid references public.formas_pagamento(id),
  comprovante_path text,
  observacao text,
  estorno_de_id uuid references public.contas_pagar_pagamentos(id),
  motivo_estorno text,
  pago_por uuid not null references public.profiles(id),
  created_at timestamp with time zone not null default now()
);
grant select on public.contas_pagar_pagamentos to authenticated;
grant all on public.contas_pagar_pagamentos to service_role;
alter table public.contas_pagar_pagamentos enable row level security;
create policy "contas_pagar_pagamentos_select" on public.contas_pagar_pagamentos for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));

-- ============ CONTAS A RECEBER ============

create table public.contas_receber (
  id uuid not null default gen_random_uuid() primary key,
  cliente text not null,
  os text,
  descricao text not null,
  origem text,
  competencia date,
  data_emissao date not null,
  vencimento date not null,
  valor_original numeric(12,2) not null check (valor_original > 0),
  status public.conta_receber_status not null default 'pendente',
  parcela_atual integer,
  parcela_total integer,
  grupo_parcela uuid,
  observacao text,
  cancelado_em timestamp with time zone,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelamento text,
  responsavel_id uuid not null references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamp with time zone not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamp with time zone not null default now()
);
grant select on public.contas_receber to authenticated;
grant all on public.contas_receber to service_role;
alter table public.contas_receber enable row level security;
create policy "contas_receber_select" on public.contas_receber for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));

create table public.contas_receber_recebimentos (
  id uuid not null default gen_random_uuid() primary key,
  conta_receber_id uuid not null references public.contas_receber(id),
  data_recebimento date not null,
  valor numeric(12,2) not null,
  forma_pagamento_id uuid references public.formas_pagamento(id),
  caixa_lancamento_id uuid references public.caixa_lancamentos(id),
  observacao text,
  referencia text,
  estorno_de_id uuid references public.contas_receber_recebimentos(id),
  motivo_estorno text,
  recebido_por uuid not null references public.profiles(id),
  created_at timestamp with time zone not null default now()
);
grant select on public.contas_receber_recebimentos to authenticated;
grant all on public.contas_receber_recebimentos to service_role;
alter table public.contas_receber_recebimentos enable row level security;
create policy "contas_receber_recebimentos_select" on public.contas_receber_recebimentos for select to authenticated
  using (public.has_permission(auth.uid(), 'financeiro', 'visualizar'));
create unique index contas_receber_recebimentos_caixa_uidx
  on public.contas_receber_recebimentos(caixa_lancamento_id) where caixa_lancamento_id is not null;

-- ============ ÍNDICES ============

create index despesas_competencia_idx on public.despesas(competencia);
create index despesas_status_idx on public.despesas(status);
create index despesas_categoria_idx on public.despesas(categoria_id);
create index contas_pagar_vencimento_idx on public.contas_pagar(vencimento);
create index contas_pagar_status_idx on public.contas_pagar(status);
create index contas_pagar_competencia_idx on public.contas_pagar(competencia);
create index contas_pagar_fornecedor_idx on public.contas_pagar(fornecedor_id);
create index contas_pagar_pagamentos_conta_idx on public.contas_pagar_pagamentos(conta_pagar_id);
create index contas_receber_vencimento_idx on public.contas_receber(vencimento);
create index contas_receber_status_idx on public.contas_receber(status);
create index contas_receber_cliente_idx on public.contas_receber(cliente);
create index contas_receber_os_idx on public.contas_receber(os) where os is not null;
create index contas_receber_competencia_idx on public.contas_receber(competencia);
create index contas_receber_recebimentos_conta_idx on public.contas_receber_recebimentos(conta_receber_id);

-- ============ TRIGGERS DE UPDATED_AT ============

create trigger update_despesas_updated_at before update on public.despesas
  for each row execute function public.update_updated_at_column();
create trigger update_contas_pagar_updated_at before update on public.contas_pagar
  for each row execute function public.update_updated_at_column();
create trigger update_contas_receber_updated_at before update on public.contas_receber
  for each row execute function public.update_updated_at_column();

-- ============ TRIGGERS DE STATUS A PARTIR DOS MOVIMENTOS ============

create or replace function public.contas_pagar_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid := coalesce(new.conta_pagar_id, old.conta_pagar_id);
  v_pago numeric(12,2);
  v_valor numeric(12,2);
  v_status text;
  v_despesa uuid;
begin
  select c.valor_original, c.status::text, c.despesa_id
    into v_valor, v_status, v_despesa
    from public.contas_pagar c where c.id = v_conta;
  if not found or v_status = 'cancelado' then
    return coalesce(new, old);
  end if;

  select coalesce(sum(p.valor), 0)::numeric(12,2) into v_pago
    from public.contas_pagar_pagamentos p where p.conta_pagar_id = v_conta;

  update public.contas_pagar set
    status = case
      when v_pago >= v_valor then 'pago'::public.conta_pagar_status
      when v_pago > 0 then 'parcialmente_pago'::public.conta_pagar_status
      else 'pendente'::public.conta_pagar_status
    end,
    updated_at = now()
  where id = v_conta;

  if v_despesa is not null then
    update public.despesas set
      status = case when v_pago >= v_valor then 'paga'::public.despesa_status else 'pendente'::public.despesa_status end,
      updated_at = now()
    where id = v_despesa and status <> 'cancelada';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger contas_pagar_pagamentos_sync after insert on public.contas_pagar_pagamentos
  for each row execute function public.contas_pagar_sync_status();

create or replace function public.contas_receber_sync_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid := coalesce(new.conta_receber_id, old.conta_receber_id);
  v_recebido numeric(12,2);
  v_valor numeric(12,2);
  v_status text;
begin
  select c.valor_original, c.status::text
    into v_valor, v_status
    from public.contas_receber c where c.id = v_conta;
  if not found or v_status = 'cancelado' then
    return coalesce(new, old);
  end if;

  select coalesce(sum(r.valor), 0)::numeric(12,2) into v_recebido
    from public.contas_receber_recebimentos r where r.conta_receber_id = v_conta;

  update public.contas_receber set
    status = case
      when v_recebido >= v_valor then 'recebido'::public.conta_receber_status
      when v_recebido > 0 then 'parcialmente_recebido'::public.conta_receber_status
      else 'pendente'::public.conta_receber_status
    end,
    updated_at = now()
  where id = v_conta;

  return coalesce(new, old);
end;
$$;

create trigger contas_receber_recebimentos_sync after insert on public.contas_receber_recebimentos
  for each row execute function public.contas_receber_sync_status();

-- ============ VISÕES COM SALDO CALCULADO (fonte única: movimentos) ============

create or replace view public.contas_pagar_saldos
with (security_invoker = true) as
select
  c.id,
  c.descricao,
  c.fornecedor_id,
  f.nome as fornecedor_nome,
  c.categoria_id,
  c.subcategoria_id,
  c.centro_custo_id,
  c.despesa_id,
  c.competencia,
  c.data_emissao,
  c.vencimento,
  c.valor_original,
  coalesce(m.valor_pago, 0)::numeric(12,2) as valor_pago,
  (c.valor_original - coalesce(m.valor_pago, 0))::numeric(12,2) as saldo,
  c.forma_pagamento_id,
  c.status,
  c.recorrente,
  c.parcela_atual,
  c.parcela_total,
  c.grupo_parcela,
  c.observacao,
  c.responsavel_id,
  pr.full_name as responsavel_nome,
  c.cancelado_em,
  c.motivo_cancelamento,
  c.created_at,
  (c.status <> 'cancelado'
     and (c.valor_original - coalesce(m.valor_pago, 0)) > 0
     and c.vencimento < (now() at time zone 'America/Manaus')::date) as vencido,
  greatest(((now() at time zone 'America/Manaus')::date - c.vencimento), 0) as dias_atraso
from public.contas_pagar c
left join public.fornecedores f on f.id = c.fornecedor_id
left join public.profiles pr on pr.id = c.responsavel_id
left join lateral (
  select sum(p.valor) as valor_pago from public.contas_pagar_pagamentos p where p.conta_pagar_id = c.id
) m on true;

grant select on public.contas_pagar_saldos to authenticated;
grant select on public.contas_pagar_saldos to service_role;

create or replace view public.contas_receber_saldos
with (security_invoker = true) as
select
  c.id,
  c.cliente,
  c.os,
  c.descricao,
  c.origem,
  c.competencia,
  c.data_emissao,
  c.vencimento,
  c.valor_original,
  coalesce(m.valor_recebido, 0)::numeric(12,2) as valor_recebido,
  (c.valor_original - coalesce(m.valor_recebido, 0))::numeric(12,2) as saldo,
  c.status,
  c.parcela_atual,
  c.parcela_total,
  c.grupo_parcela,
  c.observacao,
  c.responsavel_id,
  pr.full_name as responsavel_nome,
  c.cancelado_em,
  c.motivo_cancelamento,
  c.created_at,
  (c.status <> 'cancelado'
     and (c.valor_original - coalesce(m.valor_recebido, 0)) > 0
     and c.vencimento < (now() at time zone 'America/Manaus')::date) as vencido,
  greatest(((now() at time zone 'America/Manaus')::date - c.vencimento), 0) as dias_atraso
from public.contas_receber c
left join public.profiles pr on pr.id = c.responsavel_id
left join lateral (
  select sum(r.valor) as valor_recebido from public.contas_receber_recebimentos r where r.conta_receber_id = c.id
) m on true;

grant select on public.contas_receber_saldos to authenticated;
grant select on public.contas_receber_saldos to service_role;

-- ============ DESPESAS — RPCs ============

create or replace function public.despesas_registrar(
  p_descricao text,
  p_categoria_id uuid default null,
  p_subcategoria_id uuid default null,
  p_fornecedor_id uuid default null,
  p_centro_custo_id uuid default null,
  p_competencia date default null,
  p_data_lancamento date default null,
  p_vencimento date default null,
  p_valor numeric default null,
  p_recorrente boolean default false,
  p_observacao text default null,
  p_comprovante_path text default null,
  p_paga boolean default false,
  p_forma_pagamento_id uuid default null,
  p_data_pagamento date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_despesa_id uuid;
  v_conta_id uuid;
  v_data date := coalesce(p_data_lancamento, (now() at time zone 'America/Manaus')::date);
  v_competencia date;
  v_venc date;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para criar despesas.');
  end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'DESCRICAO_OBRIGATORIA', 'message', 'Informe a descrição da despesa.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;
  if p_paga and p_forma_pagamento_id is null then
    return jsonb_build_object('ok', false, 'code', 'FORMA_OBRIGATORIA', 'message', 'Informe a forma de pagamento da despesa já paga.');
  end if;
  if p_forma_pagamento_id is not null
     and not exists (select 1 from public.formas_pagamento f where f.id = p_forma_pagamento_id) then
    return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Forma de pagamento não encontrada.');
  end if;

  v_competencia := coalesce(p_competencia, date_trunc('month', v_data)::date);

  insert into public.despesas (
    descricao, categoria_id, subcategoria_id, fornecedor_id, centro_custo_id,
    competencia, data_lancamento, vencimento, valor, status, recorrente,
    observacao, comprovante_path, responsavel_id, created_by, updated_by
  ) values (
    btrim(p_descricao), p_categoria_id, p_subcategoria_id, p_fornecedor_id, p_centro_custo_id,
    v_competencia, v_data, p_vencimento, round(p_valor, 2),
    case when p_paga then 'paga'::public.despesa_status else 'pendente'::public.despesa_status end,
    coalesce(p_recorrente, false),
    nullif(btrim(coalesce(p_observacao, '')), ''), nullif(btrim(coalesce(p_comprovante_path, '')), ''),
    v_uid, v_uid, v_uid
  ) returning id into v_despesa_id;

  -- Despesa paga ou com vencimento gera obrigação financeira vinculada (sem duplicidade: vínculo 1:1)
  if p_paga or p_vencimento is not null then
    v_venc := coalesce(p_vencimento, v_data);
    insert into public.contas_pagar (
      descricao, fornecedor_id, categoria_id, subcategoria_id, centro_custo_id,
      despesa_id, competencia, data_emissao, vencimento, valor_original,
      forma_pagamento_id, status, recorrente, observacao, responsavel_id, created_by, updated_by
    ) values (
      btrim(p_descricao), p_fornecedor_id, p_categoria_id, p_subcategoria_id, p_centro_custo_id,
      v_despesa_id, v_competencia, v_data, v_venc, round(p_valor, 2),
      p_forma_pagamento_id, 'pendente', coalesce(p_recorrente, false),
      nullif(btrim(coalesce(p_observacao, '')), ''), v_uid, v_uid, v_uid
    ) returning id into v_conta_id;

    update public.despesas set conta_pagar_id = v_conta_id where id = v_despesa_id;

    if p_paga then
      insert into public.contas_pagar_pagamentos (
        conta_pagar_id, data_pagamento, valor, forma_pagamento_id, observacao, pago_por
      ) values (
        v_conta_id, coalesce(p_data_pagamento, v_data), round(p_valor, 2), p_forma_pagamento_id,
        'Pagamento registrado na criação da despesa.', v_uid
      );
    end if;
  end if;

  perform public.registrar_auditoria('financeiro', 'despesa_criar', null,
    (select to_jsonb(d) from public.despesas d where d.id = v_despesa_id));

  return jsonb_build_object('ok', true, 'id', v_despesa_id, 'conta_pagar_id', v_conta_id);
end;
$$;

create or replace function public.despesas_atualizar(
  p_id uuid,
  p_descricao text default null,
  p_categoria_id uuid default null,
  p_subcategoria_id uuid default null,
  p_fornecedor_id uuid default null,
  p_centro_custo_id uuid default null,
  p_competencia date default null,
  p_vencimento date default null,
  p_valor numeric default null,
  p_recorrente boolean default null,
  p_observacao text default null,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antiga public.despesas%rowtype;
  v_pago numeric(12,2);
  v_tem_movimento boolean;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar despesas.');
  end if;

  select * into v_antiga from public.despesas d where d.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Despesa não encontrada.');
  end if;
  if v_antiga.status = 'cancelada' then
    return jsonb_build_object('ok', false, 'code', 'CANCELADA', 'message', 'Despesas canceladas não podem ser editadas.');
  end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'DESCRICAO_OBRIGATORIA', 'message', 'Informe a descrição da despesa.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;

  -- Movimento financeiro existente exige justificativa auditada
  v_tem_movimento := false;
  v_pago := 0;
  if v_antiga.conta_pagar_id is not null then
    select coalesce(sum(pg.valor), 0)::numeric(12,2) into v_pago
      from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = v_antiga.conta_pagar_id;
    v_tem_movimento := exists (
      select 1 from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = v_antiga.conta_pagar_id
    );
  end if;

  if v_tem_movimento and nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'JUSTIFICATIVA_OBRIGATORIA',
      'message', 'Esta despesa já possui movimento financeiro. Informe a justificativa da alteração.');
  end if;
  if v_pago > 0 and round(p_valor, 2) < v_pago then
    return jsonb_build_object('ok', false, 'code', 'VALOR_MENOR_QUE_PAGO',
      'message', 'O novo valor não pode ser menor que o total já pago.', 'valor_pago', v_pago);
  end if;

  update public.despesas set
    descricao = btrim(p_descricao),
    categoria_id = p_categoria_id,
    subcategoria_id = p_subcategoria_id,
    fornecedor_id = p_fornecedor_id,
    centro_custo_id = p_centro_custo_id,
    competencia = coalesce(p_competencia, v_antiga.competencia),
    vencimento = p_vencimento,
    valor = round(p_valor, 2),
    recorrente = coalesce(p_recorrente, v_antiga.recorrente),
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_by = v_uid
  where id = p_id;

  if v_antiga.conta_pagar_id is not null then
    update public.contas_pagar set
      descricao = btrim(p_descricao),
      fornecedor_id = p_fornecedor_id,
      categoria_id = p_categoria_id,
      subcategoria_id = p_subcategoria_id,
      centro_custo_id = p_centro_custo_id,
      competencia = coalesce(p_competencia, v_antiga.competencia),
      vencimento = coalesce(p_vencimento, vencimento),
      valor_original = round(p_valor, 2),
      updated_by = v_uid
    where id = v_antiga.conta_pagar_id and status <> 'cancelado';
  end if;

  perform public.registrar_auditoria('financeiro', 'despesa_editar', to_jsonb(v_antiga),
    jsonb_build_object('despesa', (select to_jsonb(d) from public.despesas d where d.id = p_id),
                       'justificativa', nullif(btrim(coalesce(p_justificativa, '')), '')));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.despesas_cancelar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antiga public.despesas%rowtype;
  v_pago numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar despesas.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;

  select * into v_antiga from public.despesas d where d.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Despesa não encontrada.');
  end if;
  if v_antiga.status = 'cancelada' then
    return jsonb_build_object('ok', false, 'code', 'JA_CANCELADA', 'message', 'Esta despesa já está cancelada.');
  end if;

  if v_antiga.conta_pagar_id is not null then
    select coalesce(sum(pg.valor), 0)::numeric(12,2) into v_pago
      from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = v_antiga.conta_pagar_id;
    if v_pago > 0 then
      return jsonb_build_object('ok', false, 'code', 'EXIGE_ESTORNO',
        'message', 'A despesa possui pagamentos. Estorne os pagamentos antes de cancelar.');
    end if;
    update public.contas_pagar set
      status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid,
      motivo_cancelamento = btrim(p_motivo), updated_by = v_uid
    where id = v_antiga.conta_pagar_id;
  end if;

  update public.despesas set
    status = 'cancelada', cancelado_em = now(), cancelado_por = v_uid,
    motivo_cancelamento = btrim(p_motivo), updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('financeiro', 'despesa_cancelar', to_jsonb(v_antiga),
    jsonb_build_object('motivo', btrim(p_motivo)));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ============ CONTAS A PAGAR — RPCs ============

create or replace function public.contas_pagar_registrar(
  p_descricao text,
  p_fornecedor_id uuid default null,
  p_categoria_id uuid default null,
  p_subcategoria_id uuid default null,
  p_centro_custo_id uuid default null,
  p_competencia date default null,
  p_data_emissao date default null,
  p_vencimento date default null,
  p_valor numeric default null,
  p_forma_pagamento_id uuid default null,
  p_recorrente boolean default false,
  p_observacao text default null,
  p_parcelas integer default 1,
  p_intervalo_dias integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emissao date := coalesce(p_data_emissao, (now() at time zone 'America/Manaus')::date);
  v_parcelas int := greatest(1, least(coalesce(p_parcelas, 1), 60));
  v_intervalo int := greatest(1, coalesce(p_intervalo_dias, 30));
  v_grupo uuid;
  v_base numeric(12,2);
  v_valor_parcela numeric(12,2);
  v_ids uuid[] := '{}';
  v_id uuid;
  i int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para criar contas a pagar.');
  end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'DESCRICAO_OBRIGATORIA', 'message', 'Informe a descrição.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;
  if p_vencimento is null then
    return jsonb_build_object('ok', false, 'code', 'VENCIMENTO_OBRIGATORIO', 'message', 'Informe o vencimento.');
  end if;

  if v_parcelas > 1 then
    v_grupo := gen_random_uuid();
  end if;
  v_base := round(p_valor / v_parcelas, 2);

  for i in 1..v_parcelas loop
    v_valor_parcela := case when i = v_parcelas
      then round(p_valor, 2) - v_base * (v_parcelas - 1)
      else v_base end;
    insert into public.contas_pagar (
      descricao, fornecedor_id, categoria_id, subcategoria_id, centro_custo_id,
      competencia, data_emissao, vencimento, valor_original, forma_pagamento_id,
      status, recorrente, parcela_atual, parcela_total, grupo_parcela,
      observacao, responsavel_id, created_by, updated_by
    ) values (
      btrim(p_descricao), p_fornecedor_id, p_categoria_id, p_subcategoria_id, p_centro_custo_id,
      coalesce(p_competencia, date_trunc('month', v_emissao)::date), v_emissao,
      p_vencimento + ((i - 1) * v_intervalo), v_valor_parcela, p_forma_pagamento_id,
      'pendente', coalesce(p_recorrente, false),
      case when v_parcelas > 1 then i end, case when v_parcelas > 1 then v_parcelas end, v_grupo,
      nullif(btrim(coalesce(p_observacao, '')), ''), v_uid, v_uid, v_uid
    ) returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  perform public.registrar_auditoria('financeiro', 'conta_pagar_criar', null,
    jsonb_build_object('descricao', btrim(p_descricao), 'valor', round(p_valor, 2),
                       'parcelas', v_parcelas, 'ids', to_jsonb(v_ids)));

  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'parcelas', v_parcelas);
end;
$$;

create or replace function public.contas_pagar_atualizar(
  p_id uuid,
  p_descricao text default null,
  p_fornecedor_id uuid default null,
  p_categoria_id uuid default null,
  p_subcategoria_id uuid default null,
  p_centro_custo_id uuid default null,
  p_competencia date default null,
  p_vencimento date default null,
  p_valor_original numeric default null,
  p_forma_pagamento_id uuid default null,
  p_observacao text default null,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antiga public.contas_pagar%rowtype;
  v_pago numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar contas a pagar.');
  end if;

  select * into v_antiga from public.contas_pagar c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Conta não encontrada.');
  end if;
  if v_antiga.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'CANCELADA', 'message', 'Contas canceladas não podem ser editadas.');
  end if;

  select coalesce(sum(pg.valor), 0)::numeric(12,2) into v_pago
    from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = p_id;

  if v_pago > 0 and nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'JUSTIFICATIVA_OBRIGATORIA',
      'message', 'Esta conta já possui pagamentos. Informe a justificativa da alteração.');
  end if;
  if p_valor_original is not null then
    if p_valor_original <= 0 then
      return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
    end if;
    if round(p_valor_original, 2) < v_pago then
      return jsonb_build_object('ok', false, 'code', 'VALOR_MENOR_QUE_PAGO',
        'message', 'O novo valor não pode ser menor que o total já pago.', 'valor_pago', v_pago);
    end if;
  end if;

  update public.contas_pagar set
    descricao = coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), v_antiga.descricao),
    fornecedor_id = p_fornecedor_id,
    categoria_id = p_categoria_id,
    subcategoria_id = p_subcategoria_id,
    centro_custo_id = p_centro_custo_id,
    competencia = coalesce(p_competencia, v_antiga.competencia),
    vencimento = coalesce(p_vencimento, v_antiga.vencimento),
    valor_original = coalesce(round(p_valor_original, 2), v_antiga.valor_original),
    forma_pagamento_id = p_forma_pagamento_id,
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('financeiro', 'conta_pagar_editar', to_jsonb(v_antiga),
    jsonb_build_object('conta', (select to_jsonb(c) from public.contas_pagar c where c.id = p_id),
                       'justificativa', nullif(btrim(coalesce(p_justificativa, '')), '')));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.contas_pagar_pagar(
  p_conta_id uuid,
  p_data_pagamento date default null,
  p_valor numeric default null,
  p_forma_pagamento_id uuid default null,
  p_observacao text default null,
  p_comprovante_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conta public.contas_pagar%rowtype;
  v_pago numeric(12,2);
  v_saldo numeric(12,2);
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'pagar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar pagamentos.');
  end if;

  select * into v_conta from public.contas_pagar c where c.id = p_conta_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Conta não encontrada.');
  end if;
  if v_conta.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'CANCELADA', 'message', 'Contas canceladas não podem receber pagamentos.');
  end if;
  if v_conta.status = 'pago' then
    return jsonb_build_object('ok', false, 'code', 'JA_PAGA', 'message', 'Esta conta já está quitada.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;

  select coalesce(sum(pg.valor), 0)::numeric(12,2) into v_pago
    from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = p_conta_id;
  v_saldo := v_conta.valor_original - v_pago;

  if round(p_valor, 2) > v_saldo then
    return jsonb_build_object('ok', false, 'code', 'VALOR_MAIOR_QUE_SALDO',
      'message', 'O valor informado é maior que o saldo da conta.', 'saldo', v_saldo);
  end if;

  insert into public.contas_pagar_pagamentos (
    conta_pagar_id, data_pagamento, valor, forma_pagamento_id, comprovante_path, observacao, pago_por
  ) values (
    p_conta_id, coalesce(p_data_pagamento, (now() at time zone 'America/Manaus')::date),
    round(p_valor, 2), p_forma_pagamento_id,
    nullif(btrim(coalesce(p_comprovante_path, '')), ''),
    nullif(btrim(coalesce(p_observacao, '')), ''), v_uid
  ) returning id into v_id;

  perform public.registrar_auditoria('financeiro',
    case when round(p_valor, 2) = v_saldo then 'conta_pagar_pagar' else 'conta_pagar_pagamento_parcial' end,
    to_jsonb(v_conta),
    (select to_jsonb(pg) from public.contas_pagar_pagamentos pg where pg.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'saldo', v_saldo - round(p_valor, 2));
end;
$$;

create or replace function public.contas_pagar_estornar_pagamento(p_pagamento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mov public.contas_pagar_pagamentos%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'reabrir') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para estornar pagamentos.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do estorno.');
  end if;

  select * into v_mov from public.contas_pagar_pagamentos pg where pg.id = p_pagamento_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Pagamento não encontrado.');
  end if;
  if v_mov.estorno_de_id is not null then
    return jsonb_build_object('ok', false, 'code', 'MOVIMENTO_ESTORNO', 'message', 'Movimentos de estorno não podem ser estornados.');
  end if;
  if exists (select 1 from public.contas_pagar_pagamentos e where e.estorno_de_id = p_pagamento_id) then
    return jsonb_build_object('ok', false, 'code', 'JA_ESTORNADO', 'message', 'Este pagamento já foi estornado.');
  end if;
  if exists (select 1 from public.contas_pagar c where c.id = v_mov.conta_pagar_id and c.status = 'cancelado') then
    return jsonb_build_object('ok', false, 'code', 'CONTA_CANCELADA', 'message', 'A conta está cancelada.');
  end if;

  -- Movimento reverso: o original é preservado no histórico
  insert into public.contas_pagar_pagamentos (
    conta_pagar_id, data_pagamento, valor, forma_pagamento_id, observacao, estorno_de_id, motivo_estorno, pago_por
  ) values (
    v_mov.conta_pagar_id, (now() at time zone 'America/Manaus')::date, -v_mov.valor,
    v_mov.forma_pagamento_id,
    'Estorno do pagamento de ' || to_char(v_mov.data_pagamento, 'DD/MM/YYYY'),
    p_pagamento_id, btrim(p_motivo), v_uid
  ) returning id into v_id;

  perform public.registrar_auditoria('financeiro', 'conta_pagar_estornar_pagamento', to_jsonb(v_mov),
    (select to_jsonb(pg) from public.contas_pagar_pagamentos pg where pg.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'estorno_de', p_pagamento_id);
end;
$$;

create or replace function public.contas_pagar_cancelar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antiga public.contas_pagar%rowtype;
  v_pago numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar contas a pagar.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;

  select * into v_antiga from public.contas_pagar c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Conta não encontrada.');
  end if;
  if v_antiga.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'JA_CANCELADA', 'message', 'Esta conta já está cancelada.');
  end if;
  if v_antiga.despesa_id is not null then
    return jsonb_build_object('ok', false, 'code', 'VINCULADA_DESPESA',
      'message', 'Esta conta está vinculada a uma despesa. Cancele pela aba Despesas.');
  end if;

  select coalesce(sum(pg.valor), 0)::numeric(12,2) into v_pago
    from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = p_id;
  if v_pago > 0 then
    return jsonb_build_object('ok', false, 'code', 'EXIGE_ESTORNO',
      'message', 'A conta possui pagamentos. Estorne os pagamentos antes de cancelar.');
  end if;

  update public.contas_pagar set
    status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid,
    motivo_cancelamento = btrim(p_motivo), updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('financeiro', 'conta_pagar_cancelar', to_jsonb(v_antiga),
    jsonb_build_object('motivo', btrim(p_motivo)));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ============ CONTAS A RECEBER — RPCs ============

create or replace function public.contas_receber_registrar(
  p_cliente text,
  p_descricao text,
  p_os text default null,
  p_origem text default null,
  p_competencia date default null,
  p_data_emissao date default null,
  p_vencimento date default null,
  p_valor numeric default null,
  p_observacao text default null,
  p_parcelas integer default 1,
  p_intervalo_dias integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emissao date := coalesce(p_data_emissao, (now() at time zone 'America/Manaus')::date);
  v_parcelas int := greatest(1, least(coalesce(p_parcelas, 1), 60));
  v_intervalo int := greatest(1, coalesce(p_intervalo_dias, 30));
  v_grupo uuid;
  v_base numeric(12,2);
  v_valor_parcela numeric(12,2);
  v_ids uuid[] := '{}';
  v_id uuid;
  i int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para criar contas a receber.');
  end if;
  if nullif(btrim(coalesce(p_cliente, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'CLIENTE_OBRIGATORIO', 'message', 'Informe o cliente.');
  end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'DESCRICAO_OBRIGATORIA', 'message', 'Informe a descrição.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;
  if p_vencimento is null then
    return jsonb_build_object('ok', false, 'code', 'VENCIMENTO_OBRIGATORIO', 'message', 'Informe o vencimento.');
  end if;

  if v_parcelas > 1 then
    v_grupo := gen_random_uuid();
  end if;
  v_base := round(p_valor / v_parcelas, 2);

  for i in 1..v_parcelas loop
    v_valor_parcela := case when i = v_parcelas
      then round(p_valor, 2) - v_base * (v_parcelas - 1)
      else v_base end;
    insert into public.contas_receber (
      cliente, os, descricao, origem, competencia, data_emissao, vencimento, valor_original,
      status, parcela_atual, parcela_total, grupo_parcela, observacao, responsavel_id, created_by, updated_by
    ) values (
      btrim(p_cliente), nullif(btrim(coalesce(p_os, '')), ''), btrim(p_descricao),
      nullif(btrim(coalesce(p_origem, '')), ''),
      coalesce(p_competencia, date_trunc('month', v_emissao)::date), v_emissao,
      p_vencimento + ((i - 1) * v_intervalo), v_valor_parcela,
      'pendente', case when v_parcelas > 1 then i end, case when v_parcelas > 1 then v_parcelas end, v_grupo,
      nullif(btrim(coalesce(p_observacao, '')), ''), v_uid, v_uid, v_uid
    ) returning id into v_id;
    v_ids := array_append(v_ids, v_id);
  end loop;

  perform public.registrar_auditoria('financeiro', 'conta_receber_criar', null,
    jsonb_build_object('cliente', btrim(p_cliente), 'descricao', btrim(p_descricao),
                       'valor', round(p_valor, 2), 'parcelas', v_parcelas, 'ids', to_jsonb(v_ids)));

  return jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'parcelas', v_parcelas);
end;
$$;

create or replace function public.contas_receber_atualizar(
  p_id uuid,
  p_cliente text default null,
  p_descricao text default null,
  p_os text default null,
  p_origem text default null,
  p_competencia date default null,
  p_vencimento date default null,
  p_valor_original numeric default null,
  p_observacao text default null,
  p_justificativa text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antiga public.contas_receber%rowtype;
  v_recebido numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar contas a receber.');
  end if;

  select * into v_antiga from public.contas_receber c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Conta não encontrada.');
  end if;
  if v_antiga.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'CANCELADA', 'message', 'Contas canceladas não podem ser editadas.');
  end if;

  select coalesce(sum(r.valor), 0)::numeric(12,2) into v_recebido
    from public.contas_receber_recebimentos r where r.conta_receber_id = p_id;

  if v_recebido > 0 and nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'JUSTIFICATIVA_OBRIGATORIA',
      'message', 'Esta conta já possui recebimentos. Informe a justificativa da alteração.');
  end if;
  if p_valor_original is not null then
    if p_valor_original <= 0 then
      return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
    end if;
    if round(p_valor_original, 2) < v_recebido then
      return jsonb_build_object('ok', false, 'code', 'VALOR_MENOR_QUE_RECEBIDO',
        'message', 'O novo valor não pode ser menor que o total já recebido.', 'valor_recebido', v_recebido);
    end if;
  end if;

  update public.contas_receber set
    cliente = coalesce(nullif(btrim(coalesce(p_cliente, '')), ''), v_antiga.cliente),
    descricao = coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), v_antiga.descricao),
    os = nullif(btrim(coalesce(p_os, '')), ''),
    origem = nullif(btrim(coalesce(p_origem, '')), ''),
    competencia = coalesce(p_competencia, v_antiga.competencia),
    vencimento = coalesce(p_vencimento, v_antiga.vencimento),
    valor_original = coalesce(round(p_valor_original, 2), v_antiga.valor_original),
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('financeiro', 'conta_receber_editar', to_jsonb(v_antiga),
    jsonb_build_object('conta', (select to_jsonb(c) from public.contas_receber c where c.id = p_id),
                       'justificativa', nullif(btrim(coalesce(p_justificativa, '')), '')));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.contas_receber_receber(
  p_conta_id uuid,
  p_data_recebimento date default null,
  p_valor numeric default null,
  p_forma_pagamento_id uuid default null,
  p_observacao text default null,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_conta public.contas_receber%rowtype;
  v_recebido numeric(12,2);
  v_saldo numeric(12,2);
  v_id uuid;
  v_data date;
  v_tipo uuid;
  v_forma record;
  v_taxa numeric(12,2);
  v_lanc_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'receber') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar recebimentos.');
  end if;

  select * into v_conta from public.contas_receber c where c.id = p_conta_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Conta não encontrada.');
  end if;
  if v_conta.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'CANCELADA', 'message', 'Contas canceladas não podem receber valores.');
  end if;
  if v_conta.status = 'recebido' then
    return jsonb_build_object('ok', false, 'code', 'JA_RECEBIDA', 'message', 'Esta conta já foi recebida integralmente.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;
  if p_forma_pagamento_id is null
     or not exists (select 1 from public.formas_pagamento f where f.id = p_forma_pagamento_id) then
    return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Selecione a forma de pagamento.');
  end if;

  select coalesce(sum(r.valor), 0)::numeric(12,2) into v_recebido
    from public.contas_receber_recebimentos r where r.conta_receber_id = p_conta_id;
  v_saldo := v_conta.valor_original - v_recebido;

  if round(p_valor, 2) > v_saldo then
    return jsonb_build_object('ok', false, 'code', 'VALOR_MAIOR_QUE_SALDO',
      'message', 'O valor informado é maior que o saldo da conta.', 'saldo', v_saldo);
  end if;

  v_data := coalesce(p_data_recebimento, (now() at time zone 'America/Manaus')::date);

  -- Integração com o Caixa: respeita período fechado
  if public.caixa_periodo_fechado(v_data)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO',
      'message', 'O caixa desta data já foi fechado. Fale com um administrador.');
  end if;

  select t.id into v_tipo from public.tipos_receita t
    where t.nome = 'Recebimento de Conta a Receber' and t.ativo;
  if v_tipo is null then
    return jsonb_build_object('ok', false, 'code', 'TIPO_RECEITA_AUSENTE',
      'message', 'Tipo de receita "Recebimento de Conta a Receber" não configurado.');
  end if;

  select f.taxa_padrao_percentual into v_forma from public.formas_pagamento f where f.id = p_forma_pagamento_id;
  v_taxa := round(round(p_valor, 2) * coalesce(v_forma.taxa_padrao_percentual, 0) / 100, 2);

  -- Lançamento único no Caixa, vinculado ao recebimento (sem dupla contabilização)
  insert into public.caixa_lancamentos (
    data_lancamento, os, cliente, tipo_receita_id, descricao, tecnico_id, responsavel_id,
    valor_bruto, desconto, valor_final, taxas_total, receita_liquida, status,
    observacao, alerta_duplicidade, created_by, updated_by
  ) values (
    v_data, v_conta.os, v_conta.cliente, v_tipo,
    'Recebimento: ' || v_conta.descricao, null, v_uid,
    round(p_valor, 2), 0, round(p_valor, 2), v_taxa, round(p_valor, 2) - v_taxa, 'ativo',
    nullif(btrim(coalesce(p_observacao, '')), ''), false, v_uid, v_uid
  ) returning id into v_lanc_id;

  insert into public.caixa_pagamentos (
    lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor, valor_liquido
  ) values (
    v_lanc_id, p_forma_pagamento_id, round(p_valor, 2), 1,
    coalesce(v_forma.taxa_padrao_percentual, 0), v_taxa, round(p_valor, 2) - v_taxa
  );

  insert into public.contas_receber_recebimentos (
    conta_receber_id, data_recebimento, valor, forma_pagamento_id, caixa_lancamento_id,
    observacao, referencia, recebido_por
  ) values (
    p_conta_id, v_data, round(p_valor, 2), p_forma_pagamento_id, v_lanc_id,
    nullif(btrim(coalesce(p_observacao, '')), ''),
    nullif(btrim(coalesce(p_referencia, '')), ''), v_uid
  ) returning id into v_id;

  perform public.registrar_auditoria('financeiro',
    case when round(p_valor, 2) = v_saldo then 'conta_receber_receber' else 'conta_receber_recebimento_parcial' end,
    to_jsonb(v_conta),
    (select to_jsonb(r) from public.contas_receber_recebimentos r where r.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'caixa_lancamento_id', v_lanc_id,
    'saldo', v_saldo - round(p_valor, 2));
end;
$$;

create or replace function public.contas_receber_estornar_recebimento(p_recebimento_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mov public.contas_receber_recebimentos%rowtype;
  v_lanc public.caixa_lancamentos%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'reabrir') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para estornar recebimentos.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do estorno.');
  end if;

  select * into v_mov from public.contas_receber_recebimentos r where r.id = p_recebimento_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Recebimento não encontrado.');
  end if;
  if v_mov.estorno_de_id is not null then
    return jsonb_build_object('ok', false, 'code', 'MOVIMENTO_ESTORNO', 'message', 'Movimentos de estorno não podem ser estornados.');
  end if;
  if exists (select 1 from public.contas_receber_recebimentos e where e.estorno_de_id = p_recebimento_id) then
    return jsonb_build_object('ok', false, 'code', 'JA_ESTORNADO', 'message', 'Este recebimento já foi estornado.');
  end if;
  if exists (select 1 from public.contas_receber c where c.id = v_mov.conta_receber_id and c.status = 'cancelado') then
    return jsonb_build_object('ok', false, 'code', 'CONTA_CANCELADA', 'message', 'A conta está cancelada.');
  end if;

  -- Estorna o lançamento vinculado no Caixa (movimento original preservado)
  if v_mov.caixa_lancamento_id is not null then
    select * into v_lanc from public.caixa_lancamentos l where l.id = v_mov.caixa_lancamento_id;
    if found and v_lanc.status = 'ativo' then
      if public.caixa_periodo_fechado(v_lanc.data_lancamento)
         and not public.has_permission(v_uid, 'caixa', 'administrar') then
        return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO',
          'message', 'O lançamento no caixa pertence a um período já fechado. Fale com um administrador.');
      end if;
      insert into public.caixa_estornos (lancamento_id, valor, motivo, forma_estorno, observacao, responsavel_id)
      values (v_lanc.id, v_lanc.valor_final, btrim(p_motivo), 'Estorno de recebimento',
              'Estorno originado pelo módulo Financeiro.', v_uid);
      update public.caixa_lancamentos set status = 'estornado', updated_by = v_uid where id = v_lanc.id;
    end if;
  end if;

  -- Movimento reverso no financeiro
  insert into public.contas_receber_recebimentos (
    conta_receber_id, data_recebimento, valor, forma_pagamento_id, observacao, estorno_de_id, motivo_estorno, recebido_por
  ) values (
    v_mov.conta_receber_id, (now() at time zone 'America/Manaus')::date, -v_mov.valor,
    v_mov.forma_pagamento_id,
    'Estorno do recebimento de ' || to_char(v_mov.data_recebimento, 'DD/MM/YYYY'),
    p_recebimento_id, btrim(p_motivo), v_uid
  ) returning id into v_id;

  perform public.registrar_auditoria('financeiro', 'conta_receber_estornar_recebimento', to_jsonb(v_mov),
    (select to_jsonb(r) from public.contas_receber_recebimentos r where r.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'estorno_de', p_recebimento_id);
end;
$$;

create or replace function public.contas_receber_cancelar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antiga public.contas_receber%rowtype;
  v_recebido numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar contas a receber.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;

  select * into v_antiga from public.contas_receber c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADA', 'message', 'Conta não encontrada.');
  end if;
  if v_antiga.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'JA_CANCELADA', 'message', 'Esta conta já está cancelada.');
  end if;

  select coalesce(sum(r.valor), 0)::numeric(12,2) into v_recebido
    from public.contas_receber_recebimentos r where r.conta_receber_id = p_id;
  if v_recebido > 0 then
    return jsonb_build_object('ok', false, 'code', 'EXIGE_ESTORNO',
      'message', 'A conta possui recebimentos. Estorne os recebimentos antes de cancelar.');
  end if;

  update public.contas_receber set
    status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid,
    motivo_cancelamento = btrim(p_motivo), updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('financeiro', 'conta_receber_cancelar', to_jsonb(v_antiga),
    jsonb_build_object('motivo', btrim(p_motivo)));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

-- ============ INDICADORES E FLUXO FINANCEIRO ============

create or replace function public.financeiro_indicadores(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Manaus')::date;
  v_receita numeric(12,2);
  v_custos numeric(12,2);
  v_comissoes numeric(12,2);
  v_despesas numeric(12,2);
  v_cp_pend numeric(12,2);
  v_cr_pend numeric(12,2);
  v_cp_venc numeric(12,2);
  v_cr_venc numeric(12,2);
  v_ent30 numeric(12,2);
  v_sai30 numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar o Financeiro.');
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Período inválido.');
  end if;

  -- Competência (despesas) × Caixa (receita): conceitos mantidos separados
  select coalesce(sum(l.receita_liquida), 0)::numeric(12,2) into v_receita
    from public.caixa_lancamentos l
   where l.status = 'ativo' and l.data_lancamento between p_from and p_to;

  select coalesce(sum(c.custo_total - c.devolvido_total), 0)::numeric(12,2) into v_custos
    from public.custos_os c
   where c.status in ('registrado', 'confirmado') and c.data_lancamento between p_from and p_to;

  select coalesce(sum(c.valor_final), 0)::numeric(12,2) into v_comissoes
    from public.comissoes c
   where c.status <> 'cancelada' and c.data_referencia between p_from and p_to;

  select coalesce(sum(d.valor), 0)::numeric(12,2) into v_despesas
    from public.despesas d
   where d.status <> 'cancelada' and d.competencia between p_from and p_to;

  select coalesce(sum(c.valor_original - coalesce(m.pago, 0)), 0)::numeric(12,2),
         coalesce(sum(case when c.vencimento < v_hoje then c.valor_original - coalesce(m.pago, 0) else 0 end), 0)::numeric(12,2)
    into v_cp_pend, v_cp_venc
    from public.contas_pagar c
    left join lateral (select sum(pg.valor) as pago from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = c.id) m on true
   where c.status in ('pendente', 'parcialmente_pago');

  select coalesce(sum(c.valor_original - coalesce(m.rec, 0)), 0)::numeric(12,2),
         coalesce(sum(case when c.vencimento < v_hoje then c.valor_original - coalesce(m.rec, 0) else 0 end), 0)::numeric(12,2)
    into v_cr_pend, v_cr_venc
    from public.contas_receber c
    left join lateral (select sum(r.valor) as rec from public.contas_receber_recebimentos r where r.conta_receber_id = c.id) m on true
   where c.status in ('pendente', 'parcialmente_recebido');

  select coalesce(sum(c.valor_original - coalesce(m.rec, 0)), 0)::numeric(12,2) into v_ent30
    from public.contas_receber c
    left join lateral (select sum(r.valor) as rec from public.contas_receber_recebimentos r where r.conta_receber_id = c.id) m on true
   where c.status in ('pendente', 'parcialmente_recebido') and c.vencimento between v_hoje and v_hoje + 30;

  select coalesce(sum(c.valor_original - coalesce(m.pago, 0)), 0)::numeric(12,2) into v_sai30
    from public.contas_pagar c
    left join lateral (select sum(pg.valor) as pago from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = c.id) m on true
   where c.status in ('pendente', 'parcialmente_pago') and c.vencimento between v_hoje and v_hoje + 30;

  return jsonb_build_object(
    'ok', true,
    'receita_liquida', v_receita,
    'custos_diretos', v_custos,
    'comissoes', v_comissoes,
    'despesas_operacionais', v_despesas,
    'margem_contribuicao', v_receita - v_custos - v_comissoes,
    'resultado_antes_folha', v_receita - v_custos - v_comissoes - v_despesas,
    'contas_pagar_pendente', v_cp_pend,
    'contas_receber_pendente', v_cr_pend,
    'contas_pagar_vencido', v_cp_venc,
    'contas_receber_vencido', v_cr_venc,
    'entradas_previstas_30d', v_ent30,
    'saidas_previstas_30d', v_sai30,
    'saldo_projetado_30d', v_ent30 - v_sai30
  );
end;
$$;

create or replace function public.financeiro_fluxo(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_saldo_inicial numeric(12,2);
  v_dias jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'financeiro', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar o Financeiro.');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to > p_from + 93 then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Período inválido (máximo de 93 dias).');
  end if;

  -- Saldo inicial: receita líquida acumulada no Caixa até a véspera do período
  select coalesce(sum(l.receita_liquida), 0)::numeric(12,2) into v_saldo_inicial
    from public.caixa_lancamentos l
   where l.status = 'ativo' and l.data_lancamento < p_from;

  select coalesce(jsonb_agg(
           jsonb_build_object('data', t.data, 'entradas', t.entradas, 'saidas', t.saidas)
           order by t.data), '[]'::jsonb)
    into v_dias
    from (
      select
        g::date as data,
        coalesce((
          select sum(c.valor_original - coalesce(m.rec, 0))
            from public.contas_receber c
            left join lateral (select sum(r.valor) as rec from public.contas_receber_recebimentos r where r.conta_receber_id = c.id) m on true
           where c.status in ('pendente', 'parcialmente_recebido') and c.vencimento = g::date
        ), 0)::numeric(12,2) as entradas,
        coalesce((
          select sum(c.valor_original - coalesce(m.pago, 0))
            from public.contas_pagar c
            left join lateral (select sum(pg.valor) as pago from public.contas_pagar_pagamentos pg where pg.conta_pagar_id = c.id) m on true
           where c.status in ('pendente', 'parcialmente_pago') and c.vencimento = g::date
        ), 0)::numeric(12,2) as saidas
      from generate_series(p_from, p_to, interval '1 day') as g
    ) t;

  return jsonb_build_object('ok', true, 'saldo_inicial', v_saldo_inicial, 'dias', v_dias);
end;
$$;