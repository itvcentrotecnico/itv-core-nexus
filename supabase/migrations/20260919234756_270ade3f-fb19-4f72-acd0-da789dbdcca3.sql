
-- ============ ESTOQUE TÉCNICO — PARTE 1 ============

create or replace function public.estoque_norm(p text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p,''), '[^a-zA-Z0-9]', '', 'g'))
$$;

-- 1. Marcas
create table public.estoque_marcas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users
);
create unique index estoque_marcas_nome_uk on public.estoque_marcas (public.estoque_norm(nome));
grant select, insert, update on public.estoque_marcas to authenticated;
grant all on public.estoque_marcas to service_role;
alter table public.estoque_marcas enable row level security;
create policy estoque_marcas_select on public.estoque_marcas for select to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'visualizar'));
create policy estoque_marcas_insert on public.estoque_marcas for insert to authenticated
  with check (public.has_permission(auth.uid(), 'estoque', 'administrar'));
create policy estoque_marcas_update on public.estoque_marcas for update to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'administrar'))
  with check (public.has_permission(auth.uid(), 'estoque', 'administrar'));

-- 2. Localizações (gavetas)
create table public.estoque_localizacoes (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('LED','MAIN')),
  numero integer not null check (numero between 1 and 999),
  codigo text not null,
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  unique (grupo, numero),
  unique (codigo)
);
grant select, insert, update on public.estoque_localizacoes to authenticated;
grant all on public.estoque_localizacoes to service_role;
alter table public.estoque_localizacoes enable row level security;
create policy estoque_loc_select on public.estoque_localizacoes for select to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'visualizar'));
create policy estoque_loc_insert on public.estoque_localizacoes for insert to authenticated
  with check (public.has_permission(auth.uid(), 'estoque', 'administrar'));
create policy estoque_loc_update on public.estoque_localizacoes for update to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'administrar'))
  with check (public.has_permission(auth.uid(), 'estoque', 'administrar'));

-- 3. Itens
create table public.estoque_itens (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('kit_led','placa_main')),
  marca_id uuid not null references public.estoque_marcas(id),
  polegada text,
  modelo text not null,
  codigo_placa text,
  localizacao_id uuid not null references public.estoque_localizacoes(id),
  quantidade integer not null default 0 check (quantidade >= 0),
  quantidade_reservada integer not null default 0 check (quantidade_reservada >= 0),
  estoque_minimo integer not null default 0 check (estoque_minimo >= 0),
  observacao text,
  ativo boolean not null default true,
  teste boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users,
  constraint estoque_itens_led_polegada check (tipo <> 'kit_led' or polegada is not null),
  constraint estoque_itens_main_codigo check (tipo <> 'placa_main' or codigo_placa is not null)
);
create index estoque_itens_modelo_idx on public.estoque_itens (public.estoque_norm(modelo));
create index estoque_itens_placa_idx on public.estoque_itens (public.estoque_norm(codigo_placa));
create index estoque_itens_tipo_idx on public.estoque_itens (tipo, marca_id);
grant select, insert, update on public.estoque_itens to authenticated;
grant all on public.estoque_itens to service_role;
alter table public.estoque_itens enable row level security;
create policy estoque_itens_select on public.estoque_itens for select to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'visualizar'));
create policy estoque_itens_insert on public.estoque_itens for insert to authenticated
  with check (public.has_permission(auth.uid(), 'estoque', 'criar'));
create policy estoque_itens_update on public.estoque_itens for update to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'editar'))
  with check (public.has_permission(auth.uid(), 'estoque', 'editar'));

-- 4. Compatibilidades
create table public.estoque_compatibilidades (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_itens(id) on delete cascade,
  modelo text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);
create unique index estoque_compat_uk on public.estoque_compatibilidades (item_id, public.estoque_norm(modelo));
create index estoque_compat_modelo_idx on public.estoque_compatibilidades (public.estoque_norm(modelo));
grant select, insert, delete on public.estoque_compatibilidades to authenticated;
grant all on public.estoque_compatibilidades to service_role;
alter table public.estoque_compatibilidades enable row level security;
create policy estoque_compat_select on public.estoque_compatibilidades for select to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'visualizar'));
create policy estoque_compat_insert on public.estoque_compatibilidades for insert to authenticated
  with check (public.has_permission(auth.uid(), 'estoque', 'editar'));
create policy estoque_compat_delete on public.estoque_compatibilidades for delete to authenticated
  using (public.has_permission(auth.uid(), 'estoque', 'editar'));

create trigger update_estoque_marcas_updated_at before update on public.estoque_marcas
  for each row execute function public.update_updated_at_column();
create trigger update_estoque_loc_updated_at before update on public.estoque_localizacoes
  for each row execute function public.update_updated_at_column();
create trigger update_estoque_itens_updated_at before update on public.estoque_itens
  for each row execute function public.update_updated_at_column();

-- 5. Módulo e permissões
insert into public.modules (key, label, sort_order)
values ('estoque', 'Estoque Técnico', 60)
on conflict (key) do nothing;

insert into public.role_permissions (role, module_key, action) values
  ('adm_operacional','estoque','visualizar'),
  ('adm_operacional','estoque','criar'),
  ('adm_operacional','estoque','editar'),
  ('adm_operacional','estoque','administrar'),
  ('tecnico','estoque','visualizar')
on conflict do nothing;

-- 6. Dados iniciais
insert into public.estoque_marcas (nome) values
  ('Samsung'),('LG'),('TCL'),('SEMP'),('Toshiba'),('Philco'),('Panasonic'),
  ('Aiwa'),('Philips'),('Sony'),('Hisense'),('AOC'),('Multi'),('CCE')
on conflict do nothing;

insert into public.estoque_localizacoes (grupo, numero, codigo)
select g, n, g || '-G' || lpad(n::text, 2, '0')
from (values ('LED'),('MAIN')) as gr(g), generate_series(1,10) as n
on conflict do nothing;

-- 7. Busca unificada (respeita RLS via has_permission explícito)
create or replace function public.estoque_buscar(
  p_busca text default null,
  p_tipo text default null,
  p_marca_id uuid default null,
  p_polegada text default null,
  p_localizacao_id uuid default null,
  p_disponibilidade text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(public.estoque_norm(p_busca), '');
  v_total integer;
  v_itens jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  with base as (
    select i.*, m.nome as marca_nome, l.grupo, l.numero, l.codigo as gaveta_codigo,
           (select coalesce(jsonb_agg(c.modelo order by c.modelo), '[]'::jsonb)
              from public.estoque_compatibilidades c where c.item_id = i.id) as compatibilidades
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo
       and (p_tipo is null or i.tipo = p_tipo)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_polegada is null or i.polegada = p_polegada)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_disponibilidade is null
            or (p_disponibilidade = 'com_estoque' and i.quantidade > 0)
            or (p_disponibilidade = 'sem_estoque' and i.quantidade = 0)
            or (p_disponibilidade = 'baixo' and i.quantidade > 0 and i.quantidade <= i.estoque_minimo))
       and (v_q is null
            or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%'
            or public.estoque_norm(l.codigo) like '%' || v_q || '%'
            or public.estoque_norm(l.grupo || ' Gaveta ' || lpad(l.numero::text, 2, '0')) like '%' || v_q || '%'
            or exists (select 1 from public.estoque_compatibilidades c
                        where c.item_id = i.id
                          and public.estoque_norm(c.modelo) like '%' || v_q || '%'))
  )
  select count(*)::int into v_total from base;

  with base as (
    select i.*, m.nome as marca_nome, l.grupo, l.numero, l.codigo as gaveta_codigo,
           (select coalesce(jsonb_agg(c.modelo order by c.modelo), '[]'::jsonb)
              from public.estoque_compatibilidades c where c.item_id = i.id) as compatibilidades
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo
       and (p_tipo is null or i.tipo = p_tipo)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_polegada is null or i.polegada = p_polegada)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_disponibilidade is null
            or (p_disponibilidade = 'com_estoque' and i.quantidade > 0)
            or (p_disponibilidade = 'sem_estoque' and i.quantidade = 0)
            or (p_disponibilidade = 'baixo' and i.quantidade > 0 and i.quantidade <= i.estoque_minimo))
       and (v_q is null
            or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%'
            or public.estoque_norm(l.codigo) like '%' || v_q || '%'
            or public.estoque_norm(l.grupo || ' Gaveta ' || lpad(l.numero::text, 2, '0')) like '%' || v_q || '%'
            or exists (select 1 from public.estoque_compatibilidades c
                        where c.item_id = i.id
                          and public.estoque_norm(c.modelo) like '%' || v_q || '%'))
     order by m.nome, i.modelo
     limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'marca_id', b.marca_id, 'marca_nome', b.marca_nome,
           'polegada', b.polegada, 'modelo', b.modelo, 'codigo_placa', b.codigo_placa,
           'localizacao_id', b.localizacao_id, 'gaveta_codigo', b.gaveta_codigo,
           'gaveta_grupo', b.grupo, 'gaveta_numero', b.numero,
           'gaveta_label', b.grupo || ' — Gaveta ' || lpad(b.numero::text, 2, '0'),
           'quantidade', b.quantidade, 'quantidade_reservada', b.quantidade_reservada,
           'quantidade_disponivel', greatest(b.quantidade - b.quantidade_reservada, 0),
           'estoque_minimo', b.estoque_minimo, 'observacao', b.observacao,
           'compatibilidades', b.compatibilidades,
           'status', case when b.quantidade = 0 then 'sem_estoque'
                          when b.quantidade <= b.estoque_minimo then 'baixo'
                          else 'em_estoque' end
         )), '[]'::jsonb) into v_itens from base b;

  return jsonb_build_object('ok', true, 'total', v_total, 'itens', v_itens);
end;
$$;

-- 8. Checagem de duplicidade antes do cadastro
create or replace function public.estoque_duplicidade(
  p_tipo text,
  p_marca_id uuid,
  p_polegada text default null,
  p_modelo text default null,
  p_codigo_placa text default null,
  p_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_rows jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'tipo', i.tipo, 'marca_nome', m.nome, 'polegada', i.polegada,
           'modelo', i.modelo, 'codigo_placa', i.codigo_placa, 'quantidade', i.quantidade,
           'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0')
         )), '[]'::jsonb) into v_rows
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.ativo and i.tipo = p_tipo and i.marca_id = p_marca_id
     and (p_id is null or i.id <> p_id)
     and (
       (p_tipo = 'kit_led'
          and public.estoque_norm(i.modelo) = public.estoque_norm(p_modelo)
          and coalesce(i.polegada,'') = coalesce(p_polegada,''))
       or (p_tipo = 'placa_main'
          and public.estoque_norm(i.codigo_placa) = public.estoque_norm(p_codigo_placa))
     );

  return jsonb_build_object('ok', true, 'encontrados', v_rows);
end;
$$;

-- 9. Gravação de item + compatibilidades (transacional)
create or replace function public.estoque_item_salvar(
  p_dados jsonb,
  p_compatibilidades text[] default '{}',
  p_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tipo text := p_dados ->> 'tipo';
  v_modelo text := btrim(coalesce(p_dados ->> 'modelo', ''));
  v_codigo text := nullif(btrim(coalesce(p_dados ->> 'codigo_placa', '')), '');
  v_polegada text := nullif(btrim(coalesce(p_dados ->> 'polegada', '')), '');
  v_compat text;
begin
  if p_id is null then
    if not public.has_permission(auth.uid(), 'estoque', 'criar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
    end if;
  else
    if not public.has_permission(auth.uid(), 'estoque', 'editar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
    end if;
  end if;

  if v_tipo not in ('kit_led','placa_main') then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO');
  end if;
  if v_modelo = '' then
    return jsonb_build_object('ok', false, 'code', 'MODELO_OBRIGATORIO');
  end if;
  if v_tipo = 'kit_led' and v_polegada is null then
    return jsonb_build_object('ok', false, 'code', 'POLEGADA_OBRIGATORIA');
  end if;
  if v_tipo = 'placa_main' and v_codigo is null then
    return jsonb_build_object('ok', false, 'code', 'CODIGO_PLACA_OBRIGATORIO');
  end if;

  if p_id is null then
    insert into public.estoque_itens (
      tipo, marca_id, polegada, modelo, codigo_placa, localizacao_id,
      quantidade, estoque_minimo, observacao, teste, created_by, updated_by)
    values (
      v_tipo, (p_dados ->> 'marca_id')::uuid, v_polegada, v_modelo, v_codigo,
      (p_dados ->> 'localizacao_id')::uuid,
      greatest(coalesce((p_dados ->> 'quantidade')::int, 0), 0),
      greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      coalesce((p_dados ->> 'teste')::boolean, false),
      auth.uid(), auth.uid())
    returning id into v_id;
  else
    v_id := p_id;
    update public.estoque_itens set
      marca_id = (p_dados ->> 'marca_id')::uuid,
      polegada = v_polegada,
      modelo = v_modelo,
      codigo_placa = v_codigo,
      localizacao_id = (p_dados ->> 'localizacao_id')::uuid,
      quantidade = greatest(coalesce((p_dados ->> 'quantidade')::int, quantidade), 0),
      estoque_minimo = greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      observacao = nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      ativo = coalesce((p_dados ->> 'ativo')::boolean, ativo),
      updated_by = auth.uid()
    where id = v_id;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
    end if;
    delete from public.estoque_compatibilidades where item_id = v_id;
  end if;

  foreach v_compat in array coalesce(p_compatibilidades, '{}') loop
    if btrim(v_compat) <> '' then
      insert into public.estoque_compatibilidades (item_id, modelo, created_by)
      values (v_id, btrim(v_compat), auth.uid())
      on conflict do nothing;
    end if;
  end loop;

  perform public.registrar_auditoria('estoque',
    case when p_id is null then 'item_criar' else 'item_editar' end,
    null, jsonb_build_object('item_id', v_id, 'dados', p_dados, 'compatibilidades', p_compatibilidades));

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 10. Marcas e gavetas
create or replace function public.estoque_marca_salvar(
  p_nome text, p_ativo boolean default true, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text := btrim(coalesce(p_nome,''));
begin
  if not public.has_permission(auth.uid(), 'estoque', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if v_nome = '' then return jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO'); end if;

  if p_id is null then
    select id into v_id from public.estoque_marcas
     where public.estoque_norm(nome) = public.estoque_norm(v_nome);
    if v_id is not null then
      update public.estoque_marcas set ativo = true, updated_by = auth.uid() where id = v_id;
      return jsonb_build_object('ok', true, 'id', v_id, 'existente', true);
    end if;
    insert into public.estoque_marcas (nome, ativo, created_by, updated_by)
    values (v_nome, coalesce(p_ativo, true), auth.uid(), auth.uid()) returning id into v_id;
  else
    v_id := p_id;
    update public.estoque_marcas set nome = v_nome, ativo = coalesce(p_ativo, ativo), updated_by = auth.uid()
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  end if;

  perform public.registrar_auditoria('estoque', 'marca_salvar', null,
    jsonb_build_object('id', v_id, 'nome', v_nome, 'ativo', p_ativo));
  return jsonb_build_object('ok', true, 'id', v_id, 'existente', false);
end;
$$;

create or replace function public.estoque_localizacao_salvar(
  p_grupo text, p_numero integer, p_descricao text default null,
  p_ativo boolean default true, p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if p_grupo not in ('LED','MAIN') then
    return jsonb_build_object('ok', false, 'code', 'GRUPO_INVALIDO');
  end if;
  if p_numero is null or p_numero < 1 or p_numero > 999 then
    return jsonb_build_object('ok', false, 'code', 'NUMERO_INVALIDO');
  end if;

  if p_id is null then
    select id into v_id from public.estoque_localizacoes where grupo = p_grupo and numero = p_numero;
    if v_id is not null then
      update public.estoque_localizacoes set ativo = true, updated_by = auth.uid() where id = v_id;
      return jsonb_build_object('ok', true, 'id', v_id, 'existente', true);
    end if;
    insert into public.estoque_localizacoes (grupo, numero, codigo, descricao, ativo, created_by, updated_by)
    values (p_grupo, p_numero, p_grupo || '-G' || lpad(p_numero::text, 2, '0'),
            nullif(btrim(coalesce(p_descricao,'')), ''), coalesce(p_ativo, true), auth.uid(), auth.uid())
    returning id into v_id;
  else
    v_id := p_id;
    update public.estoque_localizacoes
       set descricao = nullif(btrim(coalesce(p_descricao,'')), ''),
           ativo = coalesce(p_ativo, ativo), updated_by = auth.uid()
     where id = v_id;
    if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  end if;

  perform public.registrar_auditoria('estoque', 'localizacao_salvar', null,
    jsonb_build_object('id', v_id, 'grupo', p_grupo, 'numero', p_numero));
  return jsonb_build_object('ok', true, 'id', v_id, 'existente', false);
end;
$$;

-- 11. Visão de uma gaveta
create or replace function public.estoque_gaveta_detalhe(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_loc record; v_itens jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select * into v_loc from public.estoque_localizacoes where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'tipo', i.tipo, 'marca_nome', m.nome, 'polegada', i.polegada,
           'modelo', i.modelo, 'codigo_placa', i.codigo_placa, 'quantidade', i.quantidade
         ) order by m.nome, i.modelo), '[]'::jsonb) into v_itens
    from public.estoque_itens i join public.estoque_marcas m on m.id = i.marca_id
   where i.localizacao_id = p_id and i.ativo;

  return jsonb_build_object('ok', true,
    'gaveta', jsonb_build_object('id', v_loc.id, 'grupo', v_loc.grupo, 'numero', v_loc.numero,
      'codigo', v_loc.codigo, 'descricao', v_loc.descricao, 'ativo', v_loc.ativo,
      'label', v_loc.grupo || ' — Gaveta ' || lpad(v_loc.numero::text, 2, '0')),
    'itens', v_itens);
end;
$$;
