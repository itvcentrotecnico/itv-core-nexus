-- ============ MÓDULO COLABORADORES E FOLHA GERENCIAL ============

create type public.colaborador_status as enum ('ativo', 'ferias', 'afastado', 'desligado');
create type public.folha_competencia_status as enum ('aberta', 'em_conferencia', 'aprovada', 'paga', 'fechada');
create type public.folha_natureza as enum ('provento', 'desconto');
create type public.folha_item_status as enum ('pendente', 'conferido', 'aprovado', 'parcialmente_pago', 'pago');
create type public.adiantamento_status as enum ('pendente', 'descontado', 'cancelado');

insert into public.modules (key, label, sort_order) values
  ('colaboradores', 'Colaboradores', 30),
  ('folha', 'Folha Gerencial', 31)
on conflict (key) do nothing;

-- ============ TABELAS DE APOIO ============

create table public.setores (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.setores to authenticated;
grant insert, update on public.setores to authenticated;
grant all on public.setores to service_role;
alter table public.setores enable row level security;
create policy "setores_select" on public.setores for select to authenticated
  using (public.has_permission(auth.uid(), 'colaboradores', 'visualizar') or public.has_permission(auth.uid(), 'folha', 'visualizar'));
create policy "setores_write" on public.setores for insert to authenticated
  with check (public.has_permission(auth.uid(), 'colaboradores', 'editar'));
create policy "setores_update" on public.setores for update to authenticated
  using (public.has_permission(auth.uid(), 'colaboradores', 'editar'));

create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  setor_id uuid references public.setores(id),
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.cargos to authenticated;
grant insert, update on public.cargos to authenticated;
grant all on public.cargos to service_role;
alter table public.cargos enable row level security;
create policy "cargos_select" on public.cargos for select to authenticated
  using (public.has_permission(auth.uid(), 'colaboradores', 'visualizar') or public.has_permission(auth.uid(), 'folha', 'visualizar'));
create policy "cargos_write" on public.cargos for insert to authenticated
  with check (public.has_permission(auth.uid(), 'colaboradores', 'editar'));
create policy "cargos_update" on public.cargos for update to authenticated
  using (public.has_permission(auth.uid(), 'colaboradores', 'editar'));

create table public.folha_tipos_lancamento (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  natureza public.folha_natureza not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.folha_tipos_lancamento to authenticated;
grant insert, update on public.folha_tipos_lancamento to authenticated;
grant all on public.folha_tipos_lancamento to service_role;
alter table public.folha_tipos_lancamento enable row level security;
create policy "ftl_select" on public.folha_tipos_lancamento for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar') or public.has_permission(auth.uid(), 'colaboradores', 'visualizar'));
create policy "ftl_write" on public.folha_tipos_lancamento for insert to authenticated
  with check (public.has_permission(auth.uid(), 'folha', 'configurar'));
create policy "ftl_update" on public.folha_tipos_lancamento for update to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'configurar'));

-- ============ COLABORADORES ============

create table public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nome_exibicao text,
  cargo_id uuid references public.cargos(id),
  setor_id uuid references public.setores(id),
  data_admissao date,
  tipo_vinculo text,
  status public.colaborador_status not null default 'ativo',
  telefone text,
  email text,
  observacao text,
  user_id uuid,
  desligado_em date,
  motivo_desligamento text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
grant select on public.colaboradores to authenticated;
grant all on public.colaboradores to service_role;
alter table public.colaboradores enable row level security;
create policy "colaboradores_select" on public.colaboradores for select to authenticated
  using (public.has_permission(auth.uid(), 'colaboradores', 'visualizar') or public.has_permission(auth.uid(), 'folha', 'visualizar'));
create index colaboradores_status_idx on public.colaboradores (status);
create index colaboradores_setor_idx on public.colaboradores (setor_id);
create index colaboradores_cargo_idx on public.colaboradores (cargo_id);
create trigger update_colaboradores_updated_at before update on public.colaboradores
  for each row execute function public.update_updated_at_column();

create table public.colaborador_salarios (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  valor numeric(12,2) not null check (valor >= 0),
  inicio_vigencia date not null,
  fim_vigencia date,
  motivo text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
grant select on public.colaborador_salarios to authenticated;
grant all on public.colaborador_salarios to service_role;
alter table public.colaborador_salarios enable row level security;
create policy "salarios_select" on public.colaborador_salarios for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create index salarios_colaborador_idx on public.colaborador_salarios (colaborador_id, inicio_vigencia);

create table public.colaborador_beneficios (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  tipo text not null check (tipo in ('vale_transporte', 'vale_alimentacao', 'ajuda_custo', 'outros')),
  descricao text,
  valor numeric(12,2) not null check (valor >= 0),
  inicio_vigencia date not null,
  fim_vigencia date,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
grant select on public.colaborador_beneficios to authenticated;
grant insert, update on public.colaborador_beneficios to authenticated;
grant all on public.colaborador_beneficios to service_role;
alter table public.colaborador_beneficios enable row level security;
create policy "beneficios_select" on public.colaborador_beneficios for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create policy "beneficios_write" on public.colaborador_beneficios for insert to authenticated
  with check (public.has_permission(auth.uid(), 'folha', 'editar'));
create policy "beneficios_update" on public.colaborador_beneficios for update to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'editar'));
create index beneficios_colaborador_idx on public.colaborador_beneficios (colaborador_id);

create table public.colaborador_adiantamentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  data date not null,
  valor numeric(12,2) not null check (valor > 0),
  competencia_desconto date not null,
  motivo text not null,
  status public.adiantamento_status not null default 'pendente',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
grant select on public.colaborador_adiantamentos to authenticated;
grant insert on public.colaborador_adiantamentos to authenticated;
grant all on public.colaborador_adiantamentos to service_role;
alter table public.colaborador_adiantamentos enable row level security;
create policy "adiant_select" on public.colaborador_adiantamentos for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create policy "adiant_write" on public.colaborador_adiantamentos for insert to authenticated
  with check (public.has_permission(auth.uid(), 'folha', 'criar'));
create index adiant_colaborador_idx on public.colaborador_adiantamentos (colaborador_id);
create index adiant_competencia_idx on public.colaborador_adiantamentos (competencia_desconto);

-- ============ FOLHA ============

create table public.folha_competencias (
  id uuid primary key default gen_random_uuid(),
  competencia date not null unique,
  status public.folha_competencia_status not null default 'aberta',
  aprovada_por uuid references public.profiles(id),
  aprovada_em timestamptz,
  fechada_por uuid references public.profiles(id),
  fechada_em timestamptz,
  reaberta_por uuid references public.profiles(id),
  reaberta_em timestamptz,
  motivo_reabertura text,
  observacao text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.folha_competencias to authenticated;
grant all on public.folha_competencias to service_role;
alter table public.folha_competencias enable row level security;
create policy "folha_comp_select" on public.folha_competencias for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create index folha_comp_status_idx on public.folha_competencias (status);
create trigger update_folha_competencias_updated_at before update on public.folha_competencias
  for each row execute function public.update_updated_at_column();

create table public.folha_colaboradores (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references public.folha_competencias(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  status public.folha_item_status not null default 'pendente',
  conferida_por uuid references public.profiles(id),
  conferida_em timestamptz,
  created_at timestamptz not null default now(),
  unique (competencia_id, colaborador_id)
);
grant select on public.folha_colaboradores to authenticated;
grant all on public.folha_colaboradores to service_role;
alter table public.folha_colaboradores enable row level security;
create policy "folha_colab_select" on public.folha_colaboradores for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create index folha_colab_comp_idx on public.folha_colaboradores (competencia_id);
create index folha_colab_colab_idx on public.folha_colaboradores (colaborador_id);

create table public.folha_lancamentos (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references public.folha_competencias(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  tipo_lancamento_id uuid not null references public.folha_tipos_lancamento(id),
  natureza public.folha_natureza not null,
  descricao text,
  valor numeric(12,2) not null check (valor >= 0),
  origem text not null default 'manual',
  referencia_id uuid,
  observacao text,
  cancelado_em timestamptz,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelamento text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.folha_lancamentos to authenticated;
grant all on public.folha_lancamentos to service_role;
alter table public.folha_lancamentos enable row level security;
create policy "folha_lanc_select" on public.folha_lancamentos for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create index folha_lanc_comp_idx on public.folha_lancamentos (competencia_id);
create index folha_lanc_colab_idx on public.folha_lancamentos (colaborador_id);
create unique index folha_lanc_comissao_uniq on public.folha_lancamentos (referencia_id)
  where origem = 'comissao_tecnica';
create trigger update_folha_lancamentos_updated_at before update on public.folha_lancamentos
  for each row execute function public.update_updated_at_column();

create table public.folha_pagamentos (
  id uuid primary key default gen_random_uuid(),
  competencia_id uuid not null references public.folha_competencias(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  data_pagamento date not null,
  valor numeric(12,2) not null,
  forma_pagamento_id uuid references public.formas_pagamento(id),
  comprovante_path text,
  observacao text,
  estorno_de_id uuid references public.folha_pagamentos(id),
  motivo_estorno text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
grant select on public.folha_pagamentos to authenticated;
grant all on public.folha_pagamentos to service_role;
alter table public.folha_pagamentos enable row level security;
create policy "folha_pag_select" on public.folha_pagamentos for select to authenticated
  using (public.has_permission(auth.uid(), 'folha', 'visualizar'));
create index folha_pag_comp_idx on public.folha_pagamentos (competencia_id);
create index folha_pag_colab_idx on public.folha_pagamentos (colaborador_id);

-- ============ VISÕES (totais derivados dos lançamentos) ============

create view public.folha_resumo_colaborador with (security_invoker = true) as
select
  fc.id as folha_colaborador_id,
  fc.competencia_id,
  comp.competencia,
  comp.status as competencia_status,
  fc.colaborador_id,
  c.nome as colaborador_nome,
  cg.nome as cargo_nome,
  st.nome as setor_nome,
  fc.status,
  coalesce(sum(case when l.natureza = 'provento' and l.cancelado_em is null then l.valor end), 0)::numeric(12,2) as proventos,
  coalesce(sum(case when l.natureza = 'desconto' and l.cancelado_em is null then l.valor end), 0)::numeric(12,2) as descontos,
  (coalesce(sum(case when l.natureza = 'provento' and l.cancelado_em is null then l.valor end), 0)
   - coalesce(sum(case when l.natureza = 'desconto' and l.cancelado_em is null then l.valor end), 0))::numeric(12,2) as total,
  coalesce((select sum(p.valor) from public.folha_pagamentos p
            where p.competencia_id = fc.competencia_id and p.colaborador_id = fc.colaborador_id), 0)::numeric(12,2) as pago
from public.folha_colaboradores fc
join public.folha_competencias comp on comp.id = fc.competencia_id
join public.colaboradores c on c.id = fc.colaborador_id
left join public.cargos cg on cg.id = c.cargo_id
left join public.setores st on st.id = c.setor_id
left join public.folha_lancamentos l on l.competencia_id = fc.competencia_id and l.colaborador_id = fc.colaborador_id
group by fc.id, fc.competencia_id, comp.competencia, comp.status, fc.colaborador_id, c.nome, cg.nome, st.nome, fc.status;
grant select on public.folha_resumo_colaborador to authenticated;

create view public.colaboradores_view with (security_invoker = true) as
select
  c.*,
  cg.nome as cargo_nome,
  st.nome as setor_nome,
  (select s.valor from public.colaborador_salarios s
    where s.colaborador_id = c.id
      and s.inicio_vigencia <= (now() at time zone 'America/Manaus')::date
      and (s.fim_vigencia is null or s.fim_vigencia >= (now() at time zone 'America/Manaus')::date)
    order by s.inicio_vigencia desc limit 1) as salario_atual
from public.colaboradores c
left join public.cargos cg on cg.id = c.cargo_id
left join public.setores st on st.id = c.setor_id;
grant select on public.colaboradores_view to authenticated;

-- ============ FUNÇÕES AUXILIARES ============

create or replace function public.folha_item_total(p_competencia_id uuid, p_colaborador_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select (coalesce(sum(case when natureza = 'provento' and cancelado_em is null then valor end), 0)
        - coalesce(sum(case when natureza = 'desconto' and cancelado_em is null then valor end), 0))::numeric(12,2)
    from public.folha_lancamentos
   where competencia_id = p_competencia_id and colaborador_id = p_colaborador_id
$$;
revoke execute on function public.folha_item_total(uuid, uuid) from public, anon, authenticated;

create or replace function public.folha_competencia_total(p_competencia_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(public.folha_item_total(p_competencia_id, colaborador_id)), 0)::numeric(12,2)
    from public.folha_colaboradores where competencia_id = p_competencia_id
$$;
revoke execute on function public.folha_competencia_total(uuid) from public, anon, authenticated;

-- ============ RPCs: COLABORADORES ============

create or replace function public.colaboradores_registrar(
  p_nome text, p_nome_exibicao text, p_cargo_id uuid, p_setor_id uuid,
  p_data_admissao date, p_salario_base numeric, p_tipo_vinculo text,
  p_telefone text, p_email text, p_observacao text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cadastrar colaboradores.');
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    return jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO', 'message', 'Informe o nome completo.');
  end if;
  if p_salario_base is null or p_salario_base < 0 then
    return jsonb_build_object('ok', false, 'code', 'SALARIO_INVALIDO', 'message', 'Salário base inválido.');
  end if;

  insert into public.colaboradores (nome, nome_exibicao, cargo_id, setor_id, data_admissao, tipo_vinculo, telefone, email, observacao, created_by)
  values (btrim(p_nome), nullif(btrim(coalesce(p_nome_exibicao, '')), ''), p_cargo_id, p_setor_id, p_data_admissao,
          nullif(btrim(coalesce(p_tipo_vinculo, '')), ''), nullif(btrim(coalesce(p_telefone, '')), ''),
          nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_id;

  insert into public.colaborador_salarios (colaborador_id, valor, inicio_vigencia, motivo, created_by)
  values (v_id, p_salario_base, coalesce(p_data_admissao, (now() at time zone 'America/Manaus')::date), 'Salário inicial de admissão', v_uid);

  perform public.registrar_auditoria('colaboradores', 'criar', null, jsonb_build_object('id', v_id, 'nome', p_nome, 'salario_base', p_salario_base));
  return jsonb_build_object('ok', true, 'id', v_id);
end;$$;

create or replace function public.colaboradores_atualizar(
  p_id uuid, p_nome text, p_nome_exibicao text, p_cargo_id uuid, p_setor_id uuid,
  p_data_admissao date, p_tipo_vinculo text, p_telefone text, p_email text, p_observacao text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old public.colaboradores%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar colaboradores.');
  end if;
  select * into v_old from public.colaboradores where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Colaborador não encontrado.'); end if;
  if p_nome is null or btrim(p_nome) = '' then
    return jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO', 'message', 'Informe o nome completo.');
  end if;

  update public.colaboradores set
    nome = btrim(p_nome),
    nome_exibicao = nullif(btrim(coalesce(p_nome_exibicao, '')), ''),
    cargo_id = p_cargo_id, setor_id = p_setor_id, data_admissao = p_data_admissao,
    tipo_vinculo = nullif(btrim(coalesce(p_tipo_vinculo, '')), ''),
    telefone = nullif(btrim(coalesce(p_telefone, '')), ''),
    email = nullif(btrim(coalesce(p_email, '')), ''),
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('colaboradores', 'editar', to_jsonb(v_old), jsonb_build_object('id', p_id, 'nome', p_nome));
  return jsonb_build_object('ok', true, 'id', p_id);
end;$$;

create or replace function public.colaboradores_alterar_salario(
  p_colaborador_id uuid, p_valor numeric, p_inicio_vigencia date, p_motivo text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_atual public.colaborador_salarios%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para alterar salários.');
  end if;
  if p_valor is null or p_valor < 0 then
    return jsonb_build_object('ok', false, 'code', 'SALARIO_INVALIDO', 'message', 'Novo salário inválido.');
  end if;
  if p_inicio_vigencia is null then
    return jsonb_build_object('ok', false, 'code', 'VIGENCIA_OBRIGATORIA', 'message', 'Informe o início da vigência.');
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo da alteração salarial.');
  end if;

  select * into v_atual from public.colaborador_salarios
   where colaborador_id = p_colaborador_id and fim_vigencia is null
   order by inicio_vigencia desc limit 1;

  if found then
    if p_inicio_vigencia <= v_atual.inicio_vigencia then
      return jsonb_build_object('ok', false, 'code', 'VIGENCIA_INVALIDA', 'message', 'A vigência deve ser posterior ao início do salário vigente.');
    end if;
    update public.colaborador_salarios set fim_vigencia = p_inicio_vigencia - 1 where id = v_atual.id;
  end if;

  insert into public.colaborador_salarios (colaborador_id, valor, inicio_vigencia, motivo, created_by)
  values (p_colaborador_id, p_valor, p_inicio_vigencia, btrim(p_motivo), v_uid);

  perform public.registrar_auditoria('colaboradores', 'alteracao_salarial',
    case when v_atual.id is not null then jsonb_build_object('salario_anterior', v_atual.valor) end,
    jsonb_build_object('colaborador_id', p_colaborador_id, 'novo_salario', p_valor, 'inicio_vigencia', p_inicio_vigencia, 'motivo', p_motivo));
  return jsonb_build_object('ok', true, 'salario_anterior', v_atual.valor, 'novo_salario', p_valor);
end;$$;

create or replace function public.colaboradores_alterar_status(
  p_id uuid, p_status public.colaborador_status, p_motivo text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_old public.colaborador_status;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'desativar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para alterar o status de colaboradores.');
  end if;
  select status into v_old from public.colaboradores where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Colaborador não encontrado.'); end if;

  update public.colaboradores set status = p_status, updated_by = v_uid where id = p_id;
  perform public.registrar_auditoria('colaboradores', 'alteracao_status',
    jsonb_build_object('status', v_old),
    jsonb_build_object('colaborador_id', p_id, 'status', p_status, 'motivo', p_motivo));
  return jsonb_build_object('ok', true);
end;$$;

create or replace function public.colaboradores_desligar(
  p_id uuid, p_data_desligamento date, p_motivo text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_colab public.colaboradores%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'desativar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para desligar colaboradores.');
  end if;
  select * into v_colab from public.colaboradores where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Colaborador não encontrado.'); end if;
  if v_colab.status = 'desligado' then
    return jsonb_build_object('ok', false, 'code', 'JA_DESLIGADO', 'message', 'Colaborador já está desligado.');
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do desligamento.');
  end if;

  update public.colaboradores set
    status = 'desligado',
    desligado_em = coalesce(p_data_desligamento, (now() at time zone 'America/Manaus')::date),
    motivo_desligamento = btrim(p_motivo),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('colaboradores', 'desligamento',
    jsonb_build_object('status', v_colab.status),
    jsonb_build_object('colaborador_id', p_id, 'nome', v_colab.nome, 'data', p_data_desligamento, 'motivo', p_motivo));
  return jsonb_build_object('ok', true);
end;$$;

-- ============ RPCs: FOLHA ============

create or replace function public.folha_importar_automaticos(p_competencia_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_comp public.folha_competencias%rowtype;
  v_colab record;
  v_salario numeric(12,2);
  v_tipo_salario uuid;
  v_ben record;
  v_tipo_ben uuid;
  v_adi record;
  v_tipo_adi uuid;
  v_com record;
  v_tipo_com uuid;
  v_importados int := 0;
  v_fim_mes date;
begin
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aberta', 'em_conferencia') then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_BLOQUEADA', 'message', 'A competência não permite mais alterações automáticas.');
  end if;
  v_fim_mes := (date_trunc('month', v_comp.competencia) + interval '1 month - 1 day')::date;

  select id into v_tipo_salario from public.folha_tipos_lancamento where nome = 'Salário' limit 1;
  select id into v_tipo_adi from public.folha_tipos_lancamento where nome = 'Adiantamento' limit 1;
  select id into v_tipo_com from public.folha_tipos_lancamento where nome = 'Comissão' limit 1;

  for v_colab in
    select c.* from public.colaboradores c
    where c.status in ('ativo', 'ferias')
      and (c.data_admissao is null or c.data_admissao <= v_fim_mes)
      and (c.desligado_em is null or c.desligado_em >= v_comp.competencia)
  loop
    insert into public.folha_colaboradores (competencia_id, colaborador_id)
    values (p_competencia_id, v_colab.id)
    on conflict (competencia_id, colaborador_id) do nothing;

    -- Salário vigente na competência
    select s.valor into v_salario from public.colaborador_salarios s
     where s.colaborador_id = v_colab.id
       and s.inicio_vigencia <= v_fim_mes
       and (s.fim_vigencia is null or s.fim_vigencia >= v_comp.competencia)
     order by s.inicio_vigencia desc limit 1;
    if v_salario is not null and v_salario > 0 and not exists (
      select 1 from public.folha_lancamentos l
       where l.competencia_id = p_competencia_id and l.colaborador_id = v_colab.id
         and l.origem = 'salario' and l.cancelado_em is null
    ) then
      insert into public.folha_lancamentos (competencia_id, colaborador_id, tipo_lancamento_id, natureza, descricao, valor, origem, created_by)
      values (p_competencia_id, v_colab.id, v_tipo_salario, 'provento', 'Salário base da competência', v_salario, 'salario', auth.uid());
      v_importados := v_importados + 1;
    end if;

    -- Benefícios recorrentes ativos na competência
    for v_ben in
      select * from public.colaborador_beneficios b
       where b.colaborador_id = v_colab.id and b.ativo
         and b.inicio_vigencia <= v_fim_mes
         and (b.fim_vigencia is null or b.fim_vigencia >= v_comp.competencia)
    loop
      select id into v_tipo_ben from public.folha_tipos_lancamento
       where nome = case v_ben.tipo
         when 'vale_transporte' then 'Vale Transporte'
         when 'vale_alimentacao' then 'Vale Alimentação'
         when 'ajuda_custo' then 'Ajuda de Custo'
         else 'Outros Proventos' end
       limit 1;
      if not exists (
        select 1 from public.folha_lancamentos l
         where l.competencia_id = p_competencia_id and l.colaborador_id = v_colab.id
           and l.origem = 'beneficio' and l.referencia_id = v_ben.id and l.cancelado_em is null
      ) then
        insert into public.folha_lancamentos (competencia_id, colaborador_id, tipo_lancamento_id, natureza, descricao, valor, origem, referencia_id, created_by)
        values (p_competencia_id, v_colab.id, v_tipo_ben, 'provento', coalesce(v_ben.descricao, initcap(replace(v_ben.tipo, '_', ' '))), v_ben.valor, 'beneficio', v_ben.id, auth.uid());
        v_importados := v_importados + 1;
      end if;
    end loop;

    -- Adiantamentos com desconto nesta competência
    for v_adi in
      select * from public.colaborador_adiantamentos a
       where a.colaborador_id = v_colab.id and a.status = 'pendente' and a.competencia_desconto = v_comp.competencia
    loop
      if not exists (
        select 1 from public.folha_lancamentos l
         where l.competencia_id = p_competencia_id and l.origem = 'adiantamento' and l.referencia_id = v_adi.id and l.cancelado_em is null
      ) then
        insert into public.folha_lancamentos (competencia_id, colaborador_id, tipo_lancamento_id, natureza, descricao, valor, origem, referencia_id, created_by)
        values (p_competencia_id, v_colab.id, v_tipo_adi, 'desconto', 'Desconto de adiantamento: ' || v_adi.motivo, v_adi.valor, 'adiantamento', v_adi.id, auth.uid());
        update public.colaborador_adiantamentos set status = 'descontado' where id = v_adi.id;
        v_importados := v_importados + 1;
      end if;
    end loop;

    -- Comissões técnicas aprovadas/pagas do mês (por referência, sem duplicar)
    if v_colab.user_id is not null then
      for v_com in
        select cm.id, coalesce(cm.valor_aprovado, cm.valor_final, 0) as valor from public.comissoes cm
         where cm.tecnico_id = v_colab.user_id
           and cm.status in ('aprovada', 'paga')
           and cm.data_referencia between v_comp.competencia and v_fim_mes
      loop
        if not exists (
          select 1 from public.folha_lancamentos l
           where l.origem = 'comissao_tecnica' and l.referencia_id = v_com.id
        ) then
          insert into public.folha_lancamentos (competencia_id, colaborador_id, tipo_lancamento_id, natureza, descricao, valor, origem, referencia_id, created_by)
          values (p_competencia_id, v_colab.id, v_tipo_com, 'provento', 'Comissão técnica (importada do módulo Comissões)', v_com.valor, 'comissao_tecnica', v_com.id, auth.uid());
          v_importados := v_importados + 1;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'importados', v_importados);
end;$$;
revoke execute on function public.folha_importar_automaticos(uuid) from public, anon, authenticated;

create or replace function public.folha_abrir_competencia(p_competencia date, p_observacao text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_imp jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para criar a folha.');
  end if;
  if p_competencia is null or p_competencia <> date_trunc('month', p_competencia)::date then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_INVALIDA', 'message', 'Competência inválida.');
  end if;
  if exists (select 1 from public.folha_competencias where competencia = p_competencia) then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_EXISTENTE', 'message', 'Já existe folha para esta competência.');
  end if;

  insert into public.folha_competencias (competencia, observacao, created_by)
  values (p_competencia, nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_id;

  v_imp := public.folha_importar_automaticos(v_id);

  perform public.registrar_auditoria('folha', 'criar', null, jsonb_build_object('competencia_id', v_id, 'competencia', p_competencia));
  return jsonb_build_object('ok', true, 'id', v_id, 'importados', v_imp->'importados');
end;$$;

create or replace function public.folha_reimportar(p_competencia_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar a folha.');
  end if;
  return public.folha_importar_automaticos(p_competencia_id);
end;$$;

create or replace function public.folha_lancar(
  p_competencia_id uuid, p_colaborador_id uuid, p_tipo_lancamento_id uuid,
  p_descricao text, p_valor numeric, p_observacao text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
  v_tipo public.folha_tipos_lancamento%rowtype;
  v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para lançar na folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aberta', 'em_conferencia') then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_BLOQUEADA', 'message', 'Competência aprovada/paga/fechada não aceita novos lançamentos. Reabra-a se necessário.');
  end if;
  select * into v_tipo from public.folha_tipos_lancamento where id = p_tipo_lancamento_id and ativo;
  if not found then return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Tipo de lançamento inválido.'); end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;
  if not exists (select 1 from public.colaboradores where id = p_colaborador_id) then
    return jsonb_build_object('ok', false, 'code', 'COLABORADOR_INVALIDO', 'message', 'Colaborador não encontrado.');
  end if;

  insert into public.folha_colaboradores (competencia_id, colaborador_id)
  values (p_competencia_id, p_colaborador_id)
  on conflict (competencia_id, colaborador_id) do nothing;

  insert into public.folha_lancamentos (competencia_id, colaborador_id, tipo_lancamento_id, natureza, descricao, valor, origem, observacao, created_by)
  values (p_competencia_id, p_colaborador_id, p_tipo_lancamento_id, v_tipo.natureza,
          nullif(btrim(coalesce(p_descricao, '')), ''), p_valor, 'manual',
          nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_id;

  perform public.registrar_auditoria('folha', 'lancamento', null,
    jsonb_build_object('id', v_id, 'competencia_id', p_competencia_id, 'colaborador_id', p_colaborador_id, 'tipo', v_tipo.nome, 'valor', p_valor));
  return jsonb_build_object('ok', true, 'id', v_id);
end;$$;

create or replace function public.folha_cancelar_lancamento(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lanc public.folha_lancamentos%rowtype;
  v_comp public.folha_competencias%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar lançamentos.');
  end if;
  select * into v_lanc from public.folha_lancamentos where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Lançamento não encontrado.'); end if;
  select * into v_comp from public.folha_competencias where id = v_lanc.competencia_id;
  if v_comp.status not in ('aberta', 'em_conferencia') then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_BLOQUEADA', 'message', 'Competência aprovada/paga/fechada não permite cancelamentos. Reabra-a se necessário.');
  end if;
  if v_lanc.cancelado_em is not null then
    return jsonb_build_object('ok', false, 'code', 'JA_CANCELADO', 'message', 'Lançamento já cancelado.');
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;

  update public.folha_lancamentos set cancelado_em = now(), cancelado_por = v_uid, motivo_cancelamento = btrim(p_motivo)
  where id = p_id;

  if v_lanc.origem = 'adiantamento' and v_lanc.referencia_id is not null then
    update public.colaborador_adiantamentos set status = 'pendente' where id = v_lanc.referencia_id;
  end if;

  perform public.registrar_auditoria('folha', 'cancelar_lancamento', to_jsonb(v_lanc), jsonb_build_object('id', p_id, 'motivo', p_motivo));
  return jsonb_build_object('ok', true);
end;$$;

create or replace function public.folha_conferir_item(p_competencia_id uuid, p_colaborador_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para conferir a folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aberta', 'em_conferencia') then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_BLOQUEADA', 'message', 'A competência não está em conferência.');
  end if;

  update public.folha_colaboradores set status = 'conferido', conferida_por = v_uid, conferida_em = now()
   where competencia_id = p_competencia_id and colaborador_id = p_colaborador_id and status = 'pendente';
  if v_comp.status = 'aberta' then
    update public.folha_competencias set status = 'em_conferencia' where id = p_competencia_id;
  end if;
  return jsonb_build_object('ok', true);
end;$$;

create or replace function public.folha_aprovar(p_competencia_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
  v_total numeric(12,2);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'aprovar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para aprovar a folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aberta', 'em_conferencia') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente competências abertas ou em conferência podem ser aprovadas.');
  end if;
  if not exists (select 1 from public.folha_colaboradores where competencia_id = p_competencia_id) then
    return jsonb_build_object('ok', false, 'code', 'FOLHA_VAZIA', 'message', 'A folha não possui colaboradores.');
  end if;

  v_total := public.folha_competencia_total(p_competencia_id);
  update public.folha_competencias set status = 'aprovada', aprovada_por = v_uid, aprovada_em = now()
   where id = p_competencia_id;
  update public.folha_colaboradores set status = 'aprovado'
   where competencia_id = p_competencia_id and status in ('pendente', 'conferido');

  perform public.registrar_auditoria('folha', 'aprovar',
    jsonb_build_object('status', v_comp.status),
    jsonb_build_object('competencia_id', p_competencia_id, 'valor_total', v_total));
  return jsonb_build_object('ok', true, 'valor_total', v_total);
end;$$;

create or replace function public.folha_registrar_pagamento(
  p_competencia_id uuid, p_colaborador_id uuid, p_data_pagamento date, p_valor numeric,
  p_forma_pagamento_id uuid, p_observacao text, p_comprovante_path text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
  v_item public.folha_colaboradores%rowtype;
  v_total numeric(12,2);
  v_pago numeric(12,2);
  v_pendentes int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'pagar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar pagamentos da folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aprovada', 'paga') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'A folha precisa estar aprovada para registrar pagamentos.');
  end if;
  select * into v_item from public.folha_colaboradores
   where competencia_id = p_competencia_id and colaborador_id = p_colaborador_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'ITEM_INVALIDO', 'message', 'Colaborador não participa desta folha.'); end if;
  if v_item.status not in ('aprovado', 'parcialmente_pago') then
    return jsonb_build_object('ok', false, 'code', 'ITEM_STATUS_INVALIDO', 'message', 'O colaborador não está aprovado para pagamento.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor maior que zero.');
  end if;

  v_total := public.folha_item_total(p_competencia_id, p_colaborador_id);
  select coalesce(sum(valor), 0) into v_pago from public.folha_pagamentos
   where competencia_id = p_competencia_id and colaborador_id = p_colaborador_id;

  if v_pago + p_valor > v_total + 0.009 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_EXCEDE_SALDO', 'message',
      'O valor excede o saldo do colaborador na folha (' || to_char(v_total - v_pago, 'FM999G990D00') || ').');
  end if;

  insert into public.folha_pagamentos (competencia_id, colaborador_id, data_pagamento, valor, forma_pagamento_id, observacao, comprovante_path, created_by)
  values (p_competencia_id, p_colaborador_id, coalesce(p_data_pagamento, (now() at time zone 'America/Manaus')::date),
          p_valor, p_forma_pagamento_id, nullif(btrim(coalesce(p_observacao, '')), ''),
          nullif(btrim(coalesce(p_comprovante_path, '')), ''), v_uid);

  update public.folha_colaboradores
     set status = case when v_pago + p_valor >= v_total - 0.009 then 'pago'::public.folha_item_status else 'parcialmente_pago'::public.folha_item_status end
   where id = v_item.id;

  select count(*) into v_pendentes from public.folha_colaboradores
   where competencia_id = p_competencia_id and status <> 'pago';
  if v_pendentes = 0 then
    update public.folha_competencias set status = 'paga' where id = p_competencia_id and status = 'aprovada';
  end if;

  perform public.registrar_auditoria('folha', 'pagamento', null,
    jsonb_build_object('competencia_id', p_competencia_id, 'colaborador_id', p_colaborador_id, 'valor', p_valor));
  return jsonb_build_object('ok', true, 'saldo', v_total - v_pago - p_valor);
end;$$;

create or replace function public.folha_pagar_lote(
  p_competencia_id uuid, p_colaborador_ids uuid[], p_forma_pagamento_id uuid, p_data_pagamento date, p_observacao text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_colab uuid;
  v_total numeric(12,2);
  v_pago numeric(12,2);
  v_saldo numeric(12,2);
  v_count int := 0;
  v_r jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'pagar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar pagamentos da folha.');
  end if;
  if p_colaborador_ids is null or array_length(p_colaborador_ids, 1) is null then
    return jsonb_build_object('ok', false, 'code', 'SELECAO_VAZIA', 'message', 'Selecione ao menos um colaborador.');
  end if;

  foreach v_colab in array p_colaborador_ids loop
    v_total := public.folha_item_total(p_competencia_id, v_colab);
    select coalesce(sum(valor), 0) into v_pago from public.folha_pagamentos
     where competencia_id = p_competencia_id and colaborador_id = v_colab;
    v_saldo := v_total - v_pago;
    if v_saldo > 0.009 then
      v_r := public.folha_registrar_pagamento(p_competencia_id, v_colab, p_data_pagamento, v_saldo, p_forma_pagamento_id, p_observacao, null);
      if (v_r->>'ok')::boolean then v_count := v_count + 1; end if;
    end if;
  end loop;

  if v_count = 0 then
    return jsonb_build_object('ok', false, 'code', 'NADA_A_PAGAR', 'message', 'Nenhum colaborador selecionado possui saldo aprovado a pagar.');
  end if;
  return jsonb_build_object('ok', true, 'pagos', v_count);
end;$$;

create or replace function public.folha_estornar_pagamento(p_pagamento_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_pag public.folha_pagamentos%rowtype;
  v_comp public.folha_competencias%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'estornar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para estornar pagamentos da folha.');
  end if;
  select * into v_pag from public.folha_pagamentos where id = p_pagamento_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Pagamento não encontrado.'); end if;
  if v_pag.estorno_de_id is not null then
    return jsonb_build_object('ok', false, 'code', 'MOVIMENTO_ESTORNO', 'message', 'Este registro já é um estorno.');
  end if;
  if exists (select 1 from public.folha_pagamentos where estorno_de_id = p_pagamento_id) then
    return jsonb_build_object('ok', false, 'code', 'JA_ESTORNADO', 'message', 'Pagamento já estornado.');
  end if;
  select * into v_comp from public.folha_competencias where id = v_pag.competencia_id;
  if v_comp.status = 'fechada' then
    return jsonb_build_object('ok', false, 'code', 'COMPETENCIA_FECHADA', 'message', 'Competência fechada. Reabra-a para estornar.');
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do estorno.');
  end if;

  insert into public.folha_pagamentos (competencia_id, colaborador_id, data_pagamento, valor, forma_pagamento_id, observacao, estorno_de_id, motivo_estorno, created_by)
  values (v_pag.competencia_id, v_pag.colaborador_id, (now() at time zone 'America/Manaus')::date, -v_pag.valor,
          v_pag.forma_pagamento_id, 'Estorno de pagamento', p_pagamento_id, btrim(p_motivo), v_uid);

  update public.folha_colaboradores set status = 'aprovado'
   where competencia_id = v_pag.competencia_id and colaborador_id = v_pag.colaborador_id and status = 'pago';
  update public.folha_competencias set status = 'aprovada' where id = v_pag.competencia_id and status = 'paga';

  perform public.registrar_auditoria('folha', 'estorno_pagamento', to_jsonb(v_pag), jsonb_build_object('motivo', p_motivo));
  return jsonb_build_object('ok', true);
end;$$;

create or replace function public.folha_fechar(p_competencia_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
  v_total numeric(12,2);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'fechar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para fechar a folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aprovada', 'paga') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente folhas aprovadas ou pagas podem ser fechadas.');
  end if;

  v_total := public.folha_competencia_total(p_competencia_id);
  update public.folha_competencias set status = 'fechada', fechada_por = v_uid, fechada_em = now()
   where id = p_competencia_id;

  perform public.registrar_auditoria('folha', 'fechar',
    jsonb_build_object('status', v_comp.status),
    jsonb_build_object('competencia_id', p_competencia_id, 'valor_total', v_total));
  return jsonb_build_object('ok', true, 'valor_total', v_total);
end;$$;

create or replace function public.folha_reabrir(p_competencia_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'reabrir') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para reabrir a folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;
  if v_comp.status not in ('aprovada', 'paga', 'fechada') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'A competência já está aberta.');
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo da reabertura.');
  end if;

  update public.folha_competencias set
    status = 'em_conferencia', reaberta_por = v_uid, reaberta_em = now(), motivo_reabertura = btrim(p_motivo)
   where id = p_competencia_id;
  update public.folha_colaboradores set status = 'conferido'
   where competencia_id = p_competencia_id and status in ('aprovado', 'parcialmente_pago');

  perform public.registrar_auditoria('folha', 'reabrir',
    jsonb_build_object('status', v_comp.status),
    jsonb_build_object('competencia_id', p_competencia_id, 'motivo', p_motivo));
  return jsonb_build_object('ok', true);
end;$$;

create or replace function public.folha_resumo(p_competencia_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_comp public.folha_competencias%rowtype;
  v_por_tipo jsonb;
  v_por_setor jsonb;
  v_por_colab jsonb;
  v_total_prov numeric(12,2);
  v_total_desc numeric(12,2);
  v_total_pago numeric(12,2);
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar a folha.');
  end if;
  select * into v_comp from public.folha_competencias where id = p_competencia_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Competência não encontrada.'); end if;

  select coalesce(jsonb_agg(jsonb_build_object('tipo', t.nome, 'natureza', t.natureza, 'total', t.total) order by t.natureza, t.nome), '[]'::jsonb)
    into v_por_tipo
    from (
      select ft.nome, ft.natureza, sum(l.valor)::numeric(12,2) as total
        from public.folha_lancamentos l
        join public.folha_tipos_lancamento ft on ft.id = l.tipo_lancamento_id
       where l.competencia_id = p_competencia_id and l.cancelado_em is null
       group by ft.nome, ft.natureza
    ) t;

  select coalesce(jsonb_agg(jsonb_build_object('setor', coalesce(s.nome, 'Sem setor'), 'total', s.total) order by s.total desc), '[]'::jsonb)
    into v_por_setor
    from (
      select st.nome, sum(case when l.natureza = 'provento' then l.valor else -l.valor end)::numeric(12,2) as total
        from public.folha_lancamentos l
        join public.colaboradores c on c.id = l.colaborador_id
        left join public.setores st on st.id = c.setor_id
       where l.competencia_id = p_competencia_id and l.cancelado_em is null
       group by st.nome
    ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'folha_colaborador_id', r.folha_colaborador_id, 'colaborador_id', r.colaborador_id,
           'nome', r.colaborador_nome, 'cargo', r.cargo_nome, 'setor', r.setor_nome,
           'status', r.status, 'proventos', r.proventos, 'descontos', r.descontos,
           'total', r.total, 'pago', r.pago, 'saldo', r.total - r.pago) order by r.colaborador_nome), '[]'::jsonb)
    into v_por_colab
    from public.folha_resumo_colaborador r
   where r.competencia_id = p_competencia_id;

  select coalesce(sum(case when l.natureza = 'provento' and l.cancelado_em is null then l.valor end), 0),
         coalesce(sum(case when l.natureza = 'desconto' and l.cancelado_em is null then l.valor end), 0)
    into v_total_prov, v_total_desc
    from public.folha_lancamentos l where l.competencia_id = p_competencia_id;

  select coalesce(sum(p.valor), 0) into v_total_pago from public.folha_pagamentos p where p.competencia_id = p_competencia_id;

  return jsonb_build_object(
    'ok', true,
    'competencia', v_comp.competencia,
    'status', v_comp.status,
    'aprovada_por', (select full_name from public.profiles where id = v_comp.aprovada_por),
    'aprovada_em', v_comp.aprovada_em,
    'fechada_em', v_comp.fechada_em,
    'total_proventos', v_total_prov,
    'total_descontos', v_total_desc,
    'total_folha', v_total_prov - v_total_desc,
    'total_pago', v_total_pago,
    'por_tipo', v_por_tipo,
    'por_setor', v_por_setor,
    'por_colaborador', v_por_colab
  );
end;$$;

create or replace function public.folha_historico_colaborador(p_colaborador_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_competencias jsonb;
  v_salarios jsonb;
  v_pagamentos jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'folha', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para visualizar dados de folha.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'inicio_vigencia', s.inicio_vigencia, 'fim_vigencia', s.fim_vigencia, 'valor', s.valor,
           'motivo', s.motivo, 'responsavel', (select full_name from public.profiles where id = s.created_by),
           'created_at', s.created_at) order by s.inicio_vigencia desc), '[]'::jsonb)
    into v_salarios from public.colaborador_salarios s where s.colaborador_id = p_colaborador_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'competencia', comp.competencia, 'status', comp.status,
           'proventos', r.proventos, 'descontos', r.descontos, 'total', r.total, 'pago', r.pago)
         order by comp.competencia desc), '[]'::jsonb)
    into v_competencias
    from public.folha_resumo_colaborador r
    join public.folha_competencias comp on comp.id = r.competencia_id
   where r.colaborador_id = p_colaborador_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'data', p.data_pagamento, 'valor', p.valor, 'observacao', p.observacao,
           'competencia', comp.competencia) order by p.data_pagamento desc), '[]'::jsonb)
    into v_pagamentos
    from public.folha_pagamentos p
    join public.folha_competencias comp on comp.id = p.competencia_id
   where p.colaborador_id = p_colaborador_id and p.estorno_de_id is null;

  return jsonb_build_object('ok', true, 'salarios', v_salarios, 'competencias', v_competencias, 'pagamentos', v_pagamentos);
end;$$;

-- ============ INTEGRAÇÃO FINANCEIRO ============

create or replace function public.financeiro_indicadores(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Manaus')::date;
  v_receita numeric(12,2);
  v_custos numeric(12,2);
  v_comissoes numeric(12,2);
  v_despesas numeric(12,2);
  v_folha numeric(12,2);
  v_folha_pend numeric(12,2);
  v_cp_pend numeric(12,2);
  v_cr_pend numeric(12,2);
  v_cp_venc numeric(12,2);
  v_cr_venc numeric(12,2);
  v_ent30 numeric(12,2);
  v_sai30 numeric(12,2);
  v_resultado numeric(12,2);
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

  -- Folha gerencial: competências aprovadas/pagas/fechadas no período (totais derivados dos lançamentos)
  select coalesce(sum(case when l.natureza = 'provento' then l.valor else -l.valor end), 0)::numeric(12,2) into v_folha
    from public.folha_lancamentos l
    join public.folha_competencias fc on fc.id = l.competencia_id
   where l.cancelado_em is null
     and fc.status in ('aprovada', 'paga', 'fechada')
     and fc.competencia between p_from and p_to;

  select coalesce(sum(s.t), 0)::numeric(12,2) into v_folha_pend
    from (
      select public.folha_item_total(fc.competencia_id, fc.colaborador_id)
           - coalesce((select sum(p.valor) from public.folha_pagamentos p
                       where p.competencia_id = fc.competencia_id and p.colaborador_id = fc.colaborador_id), 0) as t
        from public.folha_colaboradores fc
        join public.folha_competencias comp on comp.id = fc.competencia_id
       where comp.status in ('aprovada', 'paga')
    ) s where s.t > 0;

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

  v_resultado := v_receita - v_custos - v_comissoes - v_despesas - v_folha;

  return jsonb_build_object(
    'ok', true,
    'receita_liquida', v_receita,
    'custos_diretos', v_custos,
    'comissoes', v_comissoes,
    'despesas_operacionais', v_despesas,
    'folha_gerencial', v_folha,
    'folha_pendente', v_folha_pend,
    'margem_contribuicao', v_receita - v_custos - v_comissoes,
    'resultado_antes_folha', v_receita - v_custos - v_comissoes - v_despesas,
    'resultado_operacional', v_resultado,
    'margem_operacional', case when v_receita > 0 then (v_resultado / v_receita * 100)::numeric(12,2) else 0 end,
    'contas_pagar_pendente', v_cp_pend,
    'contas_receber_pendente', v_cr_pend,
    'contas_pagar_vencido', v_cp_venc,
    'contas_receber_vencido', v_cr_venc,
    'entradas_previstas_30d', v_ent30,
    'saidas_previstas_30d', v_sai30,
    'saldo_projetado_30d', v_ent30 - v_sai30
  );
end;$$;

create or replace function public.financeiro_fluxo(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  select coalesce(sum(l.receita_liquida), 0)::numeric(12,2) into v_saldo_inicial
    from public.caixa_lancamentos l
   where l.status = 'ativo' and l.data_lancamento < p_from;

  select coalesce(jsonb_agg(
           jsonb_build_object('data', t.data, 'entradas', t.entradas, 'saidas', t.saidas + t.folha)
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
        ), 0)::numeric(12,2) as saidas,
        -- Folha aprovada e não paga: saída prevista no dia 5 do mês seguinte à competência
        coalesce((
          select sum(f.saldo)
            from (
              select public.folha_item_total(fc.competencia_id, fc.colaborador_id)
                   - coalesce((select sum(p.valor) from public.folha_pagamentos p
                               where p.competencia_id = fc.competencia_id and p.colaborador_id = fc.colaborador_id), 0) as saldo
                from public.folha_colaboradores fc
                join public.folha_competencias comp on comp.id = fc.competencia_id
               where comp.status in ('aprovada', 'paga')
                 and (date_trunc('month', comp.competencia) + interval '1 month 4 days')::date = g::date
            ) f where f.saldo > 0
        ), 0)::numeric(12,2) as folha
      from generate_series(p_from, p_to, interval '1 day') as g
    ) t;

  return jsonb_build_object('ok', true, 'saldo_inicial', v_saldo_inicial, 'dias', v_dias);
end;$$;

-- ============ SEEDS ============

insert into public.setores (nome, ordem) values
  ('Administração', 1), ('Atendimento / Vendas', 2), ('Laboratório', 3), ('Logística', 4),
  ('Marketing', 5), ('Financeiro', 6), ('Operações', 7), ('Outros', 8);

insert into public.cargos (nome, setor_id, ordem)
select v.nome, s.id, v.ordem from (values
  ('Administrador', 'Administração', 1),
  ('Gerente', 'Administração', 2),
  ('Especialista de Vendas', 'Atendimento / Vendas', 3),
  ('Técnico', 'Laboratório', 4),
  ('Auxiliar Operacional', 'Operações', 5),
  ('Motorista / Entregador', 'Logística', 6),
  ('Marketing', 'Marketing', 7),
  ('Financeiro', 'Financeiro', 8),
  ('Outros', 'Outros', 9)
) as v(nome, setor, ordem)
join public.setores s on s.nome = v.setor;

insert into public.folha_tipos_lancamento (nome, natureza, ordem) values
  ('Salário', 'provento', 1),
  ('Comissão', 'provento', 2),
  ('Bônus', 'provento', 3),
  ('Hora Extra', 'provento', 4),
  ('Vale Transporte', 'provento', 5),
  ('Vale Alimentação', 'provento', 6),
  ('Ajuda de Custo', 'provento', 7),
  ('Gratificação', 'provento', 8),
  ('Férias', 'provento', 9),
  ('13º Salário', 'provento', 10),
  ('Rescisão', 'provento', 11),
  ('Outros Proventos', 'provento', 12),
  ('Adiantamento', 'desconto', 20),
  ('Falta', 'desconto', 21),
  ('Atraso', 'desconto', 22),
  ('Desconto Autorizado', 'desconto', 23),
  ('Ajuste', 'desconto', 24),
  ('Outros Descontos', 'desconto', 25);
