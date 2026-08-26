create type public.custo_os_status as enum ('registrado', 'confirmado', 'cancelado', 'estornado');

create table public.tipos_custo (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  eh_peca boolean not null default false,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.tipos_custo to authenticated;
grant insert, update, delete on public.tipos_custo to authenticated;
grant all on public.tipos_custo to service_role;
alter table public.tipos_custo enable row level security;
create policy tipos_custo_select on public.tipos_custo for select to authenticated using (true);
create policy tipos_custo_manage on public.tipos_custo for all to authenticated
  using (public.has_permission(auth.uid(), 'pecas', 'administrar'))
  with check (public.has_permission(auth.uid(), 'pecas', 'administrar'));

create table public.categorias_pecas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.categorias_pecas to authenticated;
grant insert, update, delete on public.categorias_pecas to authenticated;
grant all on public.categorias_pecas to service_role;
alter table public.categorias_pecas enable row level security;
create policy categorias_pecas_select on public.categorias_pecas for select to authenticated using (true);
create policy categorias_pecas_manage on public.categorias_pecas for all to authenticated
  using (public.has_permission(auth.uid(), 'pecas', 'administrar'))
  with check (public.has_permission(auth.uid(), 'pecas', 'administrar'));

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.fornecedores to authenticated;
grant insert, update, delete on public.fornecedores to authenticated;
grant all on public.fornecedores to service_role;
alter table public.fornecedores enable row level security;
create policy fornecedores_select on public.fornecedores for select to authenticated using (true);
create policy fornecedores_insert on public.fornecedores for insert to authenticated
  with check (public.has_permission(auth.uid(), 'pecas', 'criar') or public.has_permission(auth.uid(), 'pecas', 'editar') or public.has_permission(auth.uid(), 'pecas', 'administrar'));
create policy fornecedores_update on public.fornecedores for update to authenticated
  using (public.has_permission(auth.uid(), 'pecas', 'editar') or public.has_permission(auth.uid(), 'pecas', 'administrar'))
  with check (public.has_permission(auth.uid(), 'pecas', 'editar') or public.has_permission(auth.uid(), 'pecas', 'administrar'));
create trigger update_fornecedores_updated_at before update on public.fornecedores
  for each row execute function public.update_updated_at_column();

create table public.custos_os (
  id uuid primary key default gen_random_uuid(),
  data_lancamento date not null default ((now() at time zone 'America/Manaus')::date),
  os text not null,
  tecnico_id uuid references public.profiles(id),
  tipo_custo_id uuid not null references public.tipos_custo(id),
  descricao text not null,
  categoria_id uuid references public.categorias_pecas(id),
  marca text,
  modelo text,
  compatibilidade text,
  fornecedor_id uuid references public.fornecedores(id),
  quantidade numeric(12,2) not null default 1,
  custo_unitario numeric(12,2) not null,
  custo_total numeric(12,2) not null,
  devolvido_total numeric(12,2) not null default 0,
  status public.custo_os_status not null default 'registrado',
  observacao text,
  cancelado_em timestamptz,
  cancelado_por uuid references public.profiles(id),
  motivo_cancelamento text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.custos_os to authenticated;
grant all on public.custos_os to service_role;
alter table public.custos_os enable row level security;
create policy custos_os_select on public.custos_os for select to authenticated
  using (public.has_permission(auth.uid(), 'pecas', 'visualizar'));
create policy custos_os_insert on public.custos_os for insert to authenticated
  with check (public.has_permission(auth.uid(), 'pecas', 'criar'));
create policy custos_os_update on public.custos_os for update to authenticated
  using (public.has_permission(auth.uid(), 'pecas', 'editar') or public.has_permission(auth.uid(), 'pecas', 'aprovar') or public.has_permission(auth.uid(), 'pecas', 'cancelar') or public.has_permission(auth.uid(), 'pecas', 'estornar'))
  with check (public.has_permission(auth.uid(), 'pecas', 'editar') or public.has_permission(auth.uid(), 'pecas', 'aprovar') or public.has_permission(auth.uid(), 'pecas', 'cancelar') or public.has_permission(auth.uid(), 'pecas', 'estornar'));
create trigger update_custos_os_updated_at before update on public.custos_os
  for each row execute function public.update_updated_at_column();

create index custos_os_os_idx on public.custos_os (os);
create index custos_os_data_idx on public.custos_os (data_lancamento);
create index custos_os_tecnico_idx on public.custos_os (tecnico_id);
create index custos_os_fornecedor_idx on public.custos_os (fornecedor_id);
create index custos_os_status_idx on public.custos_os (status);

create table public.custos_estornos (
  id uuid primary key default gen_random_uuid(),
  custo_os_id uuid not null references public.custos_os(id),
  quantidade numeric(12,2) not null,
  valor numeric(12,2) not null,
  motivo text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
grant select, insert on public.custos_estornos to authenticated;
grant all on public.custos_estornos to service_role;
alter table public.custos_estornos enable row level security;
create policy custos_estornos_select on public.custos_estornos for select to authenticated
  using (public.has_permission(auth.uid(), 'pecas', 'visualizar'));
create policy custos_estornos_insert on public.custos_estornos for insert to authenticated
  with check (public.has_permission(auth.uid(), 'pecas', 'estornar'));
create index custos_estornos_custo_idx on public.custos_estornos (custo_os_id);

create or replace function public.custos_recalc_devolucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_custo uuid;
  v_devolvido numeric(12,2);
  v_total numeric(12,2);
begin
  v_custo := coalesce(new.custo_os_id, old.custo_os_id);
  select c.custo_total into v_total from public.custos_os c where c.id = v_custo;
  select coalesce(sum(e.valor), 0) into v_devolvido from public.custos_estornos e where e.custo_os_id = v_custo;
  update public.custos_os c set
    devolvido_total = v_devolvido,
    status = case
      when c.status = 'cancelado' then 'cancelado'::public.custo_os_status
      when v_devolvido >= v_total then 'estornado'::public.custo_os_status
      when c.status = 'estornado' then 'registrado'::public.custo_os_status
      else c.status
    end,
    updated_at = now()
  where c.id = v_custo;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.custos_recalc_devolucao() from public, anon, authenticated;

create trigger custos_estornos_recalc after insert or delete on public.custos_estornos
  for each row execute function public.custos_recalc_devolucao();

create or replace function public.custos_registrar(
  p_data date,
  p_os text,
  p_tipo_custo_id uuid,
  p_descricao text,
  p_tecnico_id uuid default null,
  p_categoria_id uuid default null,
  p_marca text default null,
  p_modelo text default null,
  p_compatibilidade text default null,
  p_fornecedor_id uuid default null,
  p_quantidade numeric default 1,
  p_custo_unitario numeric default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_total numeric(12,2);
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'pecas', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar custos.');
  end if;
  if p_data is null then
    return jsonb_build_object('ok', false, 'code', 'DATA_OBRIGATORIA', 'message', 'Informe a data do custo.');
  end if;
  if v_os is null then
    return jsonb_build_object('ok', false, 'code', 'OS_OBRIGATORIA', 'message', 'Informe o número da OS.');
  end if;
  if p_tipo_custo_id is null or not exists (select 1 from public.tipos_custo t where t.id = p_tipo_custo_id and t.ativo) then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Selecione o tipo de custo.');
  end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'DESCRICAO_OBRIGATORIA', 'message', 'Informe a descrição do custo.');
  end if;
  if p_categoria_id is not null and not exists (select 1 from public.categorias_pecas c where c.id = p_categoria_id and c.ativo) then
    return jsonb_build_object('ok', false, 'code', 'CATEGORIA_INVALIDA', 'message', 'Categoria de peça inválida ou inativa.');
  end if;
  if p_fornecedor_id is not null and not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id and f.ativo) then
    return jsonb_build_object('ok', false, 'code', 'FORNECEDOR_INVALIDO', 'message', 'Fornecedor não encontrado ou inativo.');
  end if;
  if p_tecnico_id is not null and not exists (select 1 from public.profiles pr where pr.id = p_tecnico_id and pr.active) then
    return jsonb_build_object('ok', false, 'code', 'TECNICO_INVALIDO', 'message', 'Técnico não encontrado ou inativo.');
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA', 'message', 'A quantidade deve ser maior que zero.');
  end if;
  if p_custo_unitario is null or p_custo_unitario <= 0 then
    return jsonb_build_object('ok', false, 'code', 'CUSTO_OBRIGATORIO', 'message', 'Informe o custo unitário.');
  end if;

  v_total := round(round(p_quantidade, 2) * round(p_custo_unitario, 2), 2);

  insert into public.custos_os (
    data_lancamento, os, tecnico_id, tipo_custo_id, descricao, categoria_id,
    marca, modelo, compatibilidade, fornecedor_id, quantidade, custo_unitario,
    custo_total, observacao, created_by, updated_by
  ) values (
    p_data, v_os, p_tecnico_id, p_tipo_custo_id, btrim(p_descricao), p_categoria_id,
    nullif(btrim(coalesce(p_marca, '')), ''), nullif(btrim(coalesce(p_modelo, '')), ''),
    nullif(btrim(coalesce(p_compatibilidade, '')), ''), p_fornecedor_id,
    round(p_quantidade, 2), round(p_custo_unitario, 2), v_total,
    nullif(btrim(coalesce(p_observacao, '')), ''), v_uid, v_uid
  )
  returning id into v_id;

  perform public.registrar_auditoria('pecas', 'criar', null,
    (select to_jsonb(c) from public.custos_os c where c.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'custo_total', v_total);
end;
$$;

create or replace function public.custos_atualizar(
  p_id uuid,
  p_data date,
  p_os text,
  p_tipo_custo_id uuid,
  p_descricao text,
  p_tecnico_id uuid default null,
  p_categoria_id uuid default null,
  p_marca text default null,
  p_modelo text default null,
  p_compatibilidade text default null,
  p_fornecedor_id uuid default null,
  p_quantidade numeric default 1,
  p_custo_unitario numeric default null,
  p_observacao text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_antigo public.custos_os%rowtype;
  v_total numeric(12,2);
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'pecas', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar custos.');
  end if;

  select * into v_antigo from public.custos_os c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Custo não encontrado.');
  end if;
  if v_antigo.status in ('cancelado', 'estornado') then
    return jsonb_build_object('ok', false, 'code', 'NAO_EDITAVEL', 'message', 'Custos cancelados ou estornados não podem ser editados.');
  end if;
  if p_data is null then
    return jsonb_build_object('ok', false, 'code', 'DATA_OBRIGATORIA', 'message', 'Informe a data do custo.');
  end if;
  if v_os is null then
    return jsonb_build_object('ok', false, 'code', 'OS_OBRIGATORIA', 'message', 'Informe o número da OS.');
  end if;
  if p_tipo_custo_id is null or not exists (select 1 from public.tipos_custo t where t.id = p_tipo_custo_id and t.ativo) then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Selecione o tipo de custo.');
  end if;
  if nullif(btrim(coalesce(p_descricao, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'DESCRICAO_OBRIGATORIA', 'message', 'Informe a descrição do custo.');
  end if;
  if p_categoria_id is not null and not exists (select 1 from public.categorias_pecas c where c.id = p_categoria_id and c.ativo) then
    return jsonb_build_object('ok', false, 'code', 'CATEGORIA_INVALIDA', 'message', 'Categoria de peça inválida ou inativa.');
  end if;
  if p_fornecedor_id is not null and not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id and f.ativo) then
    return jsonb_build_object('ok', false, 'code', 'FORNECEDOR_INVALIDO', 'message', 'Fornecedor não encontrado ou inativo.');
  end if;
  if p_tecnico_id is not null and not exists (select 1 from public.profiles pr where pr.id = p_tecnico_id and pr.active) then
    return jsonb_build_object('ok', false, 'code', 'TECNICO_INVALIDO', 'message', 'Técnico não encontrado ou inativo.');
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA', 'message', 'A quantidade deve ser maior que zero.');
  end if;
  if p_custo_unitario is null or p_custo_unitario <= 0 then
    return jsonb_build_object('ok', false, 'code', 'CUSTO_OBRIGATORIO', 'message', 'Informe o custo unitário.');
  end if;
  if v_antigo.devolvido_total > 0 and round(round(p_quantidade, 2) * round(p_custo_unitario, 2), 2) < v_antigo.devolvido_total then
    return jsonb_build_object('ok', false, 'code', 'ABAIXO_DO_DEVOLVIDO', 'message', 'O novo custo total não pode ser menor que o valor já devolvido.');
  end if;

  v_total := round(round(p_quantidade, 2) * round(p_custo_unitario, 2), 2);

  update public.custos_os set
    data_lancamento = p_data,
    os = v_os,
    tecnico_id = p_tecnico_id,
    tipo_custo_id = p_tipo_custo_id,
    descricao = btrim(p_descricao),
    categoria_id = p_categoria_id,
    marca = nullif(btrim(coalesce(p_marca, '')), ''),
    modelo = nullif(btrim(coalesce(p_modelo, '')), ''),
    compatibilidade = nullif(btrim(coalesce(p_compatibilidade, '')), ''),
    fornecedor_id = p_fornecedor_id,
    quantidade = round(p_quantidade, 2),
    custo_unitario = round(p_custo_unitario, 2),
    custo_total = v_total,
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('pecas', 'editar', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.custos_os c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'custo_total', v_total);
end;
$$;

create or replace function public.custos_confirmar(p_id uuid)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.custos_os%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'pecas', 'aprovar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para confirmar custos.');
  end if;
  select * into v_antigo from public.custos_os c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Custo não encontrado.');
  end if;
  if v_antigo.status <> 'registrado' then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente custos registrados podem ser confirmados.');
  end if;
  update public.custos_os set status = 'confirmado', updated_by = v_uid where id = p_id;
  perform public.registrar_auditoria('pecas', 'confirmar', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.custos_os c where c.id = p_id));
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.custos_cancelar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.custos_os%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'pecas', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar custos.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;
  select * into v_antigo from public.custos_os c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Custo não encontrado.');
  end if;
  if v_antigo.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'code', 'JA_CANCELADO', 'message', 'Este custo já está cancelado.');
  end if;
  update public.custos_os set
    status = 'cancelado', cancelado_em = now(), cancelado_por = v_uid,
    motivo_cancelamento = btrim(p_motivo), updated_by = v_uid
  where id = p_id;
  perform public.registrar_auditoria('pecas', 'cancelar', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.custos_os c where c.id = p_id));
  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.custos_devolver(p_id uuid, p_quantidade numeric, p_valor numeric, p_motivo text)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_custo public.custos_os%rowtype;
  v_restante numeric(12,2);
  v_estorno_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'pecas', 'estornar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para estornar/devolver custos.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo da devolução.');
  end if;
  select * into v_custo from public.custos_os c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Custo não encontrado.');
  end if;
  if v_custo.status in ('cancelado', 'estornado') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Este custo não pode receber devolução.');
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA', 'message', 'A quantidade devolvida deve ser maior que zero.');
  end if;
  if p_quantidade > v_custo.quantidade then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_EXCEDENTE', 'message', 'A quantidade devolvida não pode ser maior que a lançada.');
  end if;
  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'O valor devolvido deve ser maior que zero.');
  end if;
  v_restante := v_custo.custo_total - v_custo.devolvido_total;
  if round(p_valor, 2) > v_restante then
    return jsonb_build_object('ok', false, 'code', 'VALOR_EXCEDENTE', 'message', 'O valor devolvido não pode ser maior que o custo restante.', 'restante', v_restante);
  end if;

  insert into public.custos_estornos (custo_os_id, quantidade, valor, motivo, created_by)
  values (p_id, round(p_quantidade, 2), round(p_valor, 2), btrim(p_motivo), v_uid)
  returning id into v_estorno_id;

  perform public.registrar_auditoria('pecas', 'devolver', to_jsonb(v_custo),
    (select to_jsonb(e) from public.custos_estornos e where e.id = v_estorno_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'estorno_id', v_estorno_id,
    'custo_liquido', v_restante - round(p_valor, 2));
end;
$$;

create or replace function public.custos_indicadores(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v record;
  v_receita numeric(12,2);
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'pecas', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(sum(c.custo_total - c.devolvido_total), 0) as custo_total,
         coalesce(sum(c.custo_total - c.devolvido_total) filter (where t.eh_peca), 0) as custo_pecas,
         coalesce(sum(c.custo_total - c.devolvido_total) filter (where not t.eh_peca), 0) as outros_custos,
         count(distinct c.os) as os_com_custos
    into v
    from public.custos_os c
    join public.tipos_custo t on t.id = c.tipo_custo_id
   where c.status in ('registrado', 'confirmado', 'estornado')
     and c.data_lancamento between p_from and p_to;

  select coalesce(sum(l.receita_liquida), 0) into v_receita
    from public.caixa_lancamentos l
   where l.status = 'ativo'
     and l.os is not null
     and exists (
       select 1 from public.custos_os c
       where c.os = l.os and c.status in ('registrado', 'confirmado', 'estornado')
         and c.data_lancamento between p_from and p_to
     );

  return jsonb_build_object(
    'ok', true,
    'custo_total', v.custo_total,
    'custo_pecas', v.custo_pecas,
    'outros_custos', v.outros_custos,
    'os_com_custos', v.os_com_custos,
    'custo_medio', case when v.os_com_custos > 0 then round(v.custo_total / v.os_com_custos, 2) else 0 end,
    'receita_liquida_relacionada', v_receita,
    'custo_sobre_receita_pct', case when v_receita > 0 then round(v.custo_total / v_receita * 100, 1) else null end
  );
end;
$$;
grant execute on function public.custos_indicadores(date, date) to authenticated;

create or replace function public.custos_por_os(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_custo_elevado_pct numeric;
  v_margem_minima_pct numeric;
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'pecas', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce((s.value ->> 'custo_elevado_pct')::numeric, 50),
         coalesce((s.value ->> 'margem_minima_pct')::numeric, 30)
    into v_custo_elevado_pct, v_margem_minima_pct
    from public.settings s where s.key = 'custos';
  v_custo_elevado_pct := coalesce(v_custo_elevado_pct, 50);
  v_margem_minima_pct := coalesce(v_margem_minima_pct, 30);

  return jsonb_build_object(
    'ok', true,
    'custo_elevado_pct', v_custo_elevado_pct,
    'margem_minima_pct', v_margem_minima_pct,
    'os', coalesce((
      select jsonb_agg(jsonb_build_object(
        'os', g.os,
        'itens', g.itens,
        'custo_total', g.custo_total,
        'receita_liquida', rec.receita_liquida,
        'cliente', rec.cliente,
        'tecnico', rec.tecnico,
        'faturado_em', rec.faturado_em,
        'margem_parcial', case when rec.receita_liquida is not null then round(rec.receita_liquida - g.custo_total, 2) else null end,
        'margem_pct', case when rec.receita_liquida > 0 then round((rec.receita_liquida - g.custo_total) / rec.receita_liquida * 100, 1) else null end,
        'alerta_custo_elevado', (rec.receita_liquida is not null and rec.receita_liquida > 0 and g.custo_total / rec.receita_liquida * 100 > v_custo_elevado_pct),
        'alerta_margem_baixa', (rec.receita_liquida is not null and rec.receita_liquida > 0 and (rec.receita_liquida - g.custo_total) / rec.receita_liquida * 100 < v_margem_minima_pct)
      ) order by g.os desc)
      from (
        select c.os,
               sum(c.custo_total - c.devolvido_total) as custo_total,
               jsonb_agg(jsonb_build_object(
                 'id', c.id, 'descricao', c.descricao, 'tipo', t.nome,
                 'valor_liquido', c.custo_total - c.devolvido_total, 'status', c.status
               ) order by c.data_lancamento) as itens
          from public.custos_os c
          join public.tipos_custo t on t.id = c.tipo_custo_id
         where c.status in ('registrado', 'confirmado', 'estornado')
           and c.data_lancamento between p_from and p_to
         group by c.os
      ) g
      left join lateral (
        select sum(l.receita_liquida) as receita_liquida,
               max(l.cliente) as cliente,
               max(pr.full_name) as tecnico,
               max(l.data_lancamento) as faturado_em
          from public.caixa_lancamentos l
          left join public.profiles pr on pr.id = l.tecnico_id
         where l.os = g.os and l.status = 'ativo'
      ) rec on true
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.custos_por_os(date, date) to authenticated;

insert into public.tipos_custo (nome, eh_peca, ordem) values
  ('Peça', true, 1),
  ('Insumo Técnico', false, 2),
  ('Serviço Terceirizado', false, 3),
  ('Recuperação de Componente', false, 4),
  ('Frete de Peça', false, 5),
  ('Outro Custo Direto', false, 6);

insert into public.categorias_pecas (nome, ordem) values
  ('LED', 1), ('Placa Main', 2), ('Placa Fonte', 3), ('T-Con / V-Con', 4),
  ('Display / Painel', 5), ('Controle Remoto', 6), ('Alto-falante', 7), ('Wi-Fi', 8),
  ('Cabos / Flats', 9), ('Componentes', 10), ('Insumos', 11), ('Outros', 12);

insert into public.settings (key, value) values
  ('custos', '{"custo_elevado_pct": 50, "margem_minima_pct": 30}'::jsonb)
on conflict (key) do nothing;

insert into public.role_permissions (role, module_key, action) values
  ('gerente', 'pecas', 'criar'),
  ('gerente', 'pecas', 'editar'),
  ('gerente', 'pecas', 'aprovar')
on conflict do nothing;