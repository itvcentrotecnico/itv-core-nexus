-- ============================================================
-- GESTÃO ITV CENTRO TÉCNICO — Fundação (Fase 1)
-- Perfis, papéis, permissões, configurações e auditoria
-- ============================================================

create type public.app_role as enum ('administrador', 'gerente', 'vendas', 'tecnico');
create type public.permission_action as enum ('visualizar', 'criar', 'editar', 'aprovar', 'pagar', 'cancelar', 'exportar', 'administrar');

-- Perfis de usuário
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Papéis por usuário
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- Catálogo de módulos
create table public.modules (
  key text primary key,
  label text not null,
  sort_order integer not null default 0
);

grant select on public.modules to authenticated;
grant all on public.modules to service_role;

-- Permissões por perfil
create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  module_key text not null references public.modules(key) on delete cascade,
  action public.permission_action not null,
  unique (role, module_key, action)
);

grant select, insert, update, delete on public.role_permissions to authenticated;
grant all on public.role_permissions to service_role;

-- Exceções individuais por usuário
create table public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null references public.modules(key) on delete cascade,
  action public.permission_action not null,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, module_key, action)
);

grant select, insert, update, delete on public.user_permissions to authenticated;
grant all on public.user_permissions to service_role;

-- Configurações básicas
create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

grant select on public.settings to authenticated;
grant insert, update, delete on public.settings to authenticated;
grant all on public.settings to service_role;

-- Auditoria (estrutura preparatória)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  module_key text,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

-- Funções de verificação (security definer, sem recursão de RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create or replace function public.has_permission(_user_id uuid, _module text, _action public.permission_action)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.has_role(_user_id, 'administrador')
    or coalesce(
      (
        select up.allowed from public.user_permissions up
        where up.user_id = _user_id and up.module_key = _module and up.action = _action
      ),
      (
        select true from public.role_permissions rp
        join public.user_roles ur on ur.role = rp.role and ur.user_id = _user_id
        where rp.module_key = _module and rp.action = _action
        limit 1
      ),
      false
    )
$$;

-- Criação automática de perfil no cadastro + bootstrap do administrador principal
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  );

  -- Bootstrap do administrador principal da operação
  if new.email = 'scaiofabio@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'administrador')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automático
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();

create trigger update_settings_updated_at before update on public.settings
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Row Level Security — deny by default
-- ============================================================

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.modules enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;
alter table public.settings enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'administrador'));

create policy "profiles_update_own_or_admin" on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(), 'administrador'))
  with check (auth.uid() = id or public.has_role(auth.uid(), 'administrador'));

create policy "user_roles_select_own_or_admin" on public.user_roles
  for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'administrador'));

create policy "user_roles_admin_manage" on public.user_roles
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

create policy "modules_select_authenticated" on public.modules
  for select to authenticated using (true);

create policy "role_permissions_select_authenticated" on public.role_permissions
  for select to authenticated using (true);

create policy "role_permissions_admin_manage" on public.role_permissions
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

create policy "user_permissions_select_own_or_admin" on public.user_permissions
  for select to authenticated
  using (auth.uid() = user_id or public.has_role(auth.uid(), 'administrador'));

create policy "user_permissions_admin_manage" on public.user_permissions
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

create policy "settings_select_authenticated" on public.settings
  for select to authenticated using (true);

create policy "settings_admin_manage" on public.settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador'))
  with check (public.has_role(auth.uid(), 'administrador'));

create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.has_role(auth.uid(), 'administrador'));

create policy "audit_logs_insert_authenticated" on public.audit_logs
  for insert to authenticated
  with check (auth.uid() = user_id);

-- ============================================================
-- Catálogo inicial de módulos
-- ============================================================

insert into public.modules (key, label, sort_order) values
  ('dashboard',        'Dashboard',        1),
  ('caixa',            'Caixa Diário',     2),
  ('pecas',            'Peças e Custos',   3),
  ('comissoes',        'Comissões',        4),
  ('despesas',         'Despesas',         5),
  ('financeiro',       'Financeiro',       6),
  ('contas-pagar',     'Contas a Pagar',   7),
  ('contas-receber',   'Contas a Receber', 8),
  ('producao',         'Produção',         9),
  ('tecnicos',         'Técnicos',         10),
  ('colaboradores',    'Colaboradores',    11),
  ('metas',            'Metas',            12),
  ('entregas',         'Entregas',         13),
  ('logistica',        'Logística',        14),
  ('relatorios',       'Relatórios',       15),
  ('configuracoes',    'Configurações',    16),
  ('admin-usuarios',   'Usuários',         17),
  ('admin-permissoes', 'Permissões',       18),
  ('admin-auditoria',  'Auditoria',        19);

-- ============================================================
-- Permissões iniciais por perfil (visualização dos módulos)
-- O perfil Administrador possui acesso total via has_permission().
-- ============================================================

-- Gerente: acesso gerencial e operacional, sem administração do sistema
insert into public.role_permissions (role, module_key, action)
select 'gerente', m.key, 'visualizar'
from public.modules m
where m.key not in ('admin-usuarios', 'admin-permissoes', 'admin-auditoria');

insert into public.role_permissions (role, module_key, action) values
  ('gerente', 'caixa',          'criar'),
  ('gerente', 'caixa',          'editar'),
  ('gerente', 'caixa',          'aprovar'),
  ('gerente', 'despesas',       'criar'),
  ('gerente', 'despesas',       'editar'),
  ('gerente', 'contas-pagar',   'criar'),
  ('gerente', 'contas-pagar',   'editar'),
  ('gerente', 'contas-receber', 'criar'),
  ('gerente', 'contas-receber', 'editar'),
  ('gerente', 'relatorios',     'exportar');

-- Vendas: principalmente Caixa Diário e áreas comerciais
insert into public.role_permissions (role, module_key, action) values
  ('vendas', 'dashboard',  'visualizar'),
  ('vendas', 'caixa',      'visualizar'),
  ('vendas', 'caixa',      'criar'),
  ('vendas', 'comissoes',  'visualizar'),
  ('vendas', 'entregas',   'visualizar'),
  ('vendas', 'logistica',  'visualizar');

-- Técnico: restrito às próprias informações, produção e comissões
insert into public.role_permissions (role, module_key, action) values
  ('tecnico', 'dashboard', 'visualizar'),
  ('tecnico', 'producao',  'visualizar'),
  ('tecnico', 'comissoes', 'visualizar');

-- Configuração institucional básica
insert into public.settings (key, value) values
  ('organization', '{"name": "GESTÃO ITV", "subtitle": "CENTRO TÉCNICO", "timezone": "America/Manaus", "currency": "BRL"}'::jsonb);