-- 1. Usuário ativo (status real) --------------------------------------------
create or replace function public.usuario_ativo(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = _user_id and p.active and p.status = 'ativo'
  )
$$;

revoke all on function public.usuario_ativo(uuid) from public;
grant execute on function public.usuario_ativo(uuid) to authenticated;

-- Políticas administrativas passam a exigir usuário ativo
drop policy if exists audit_logs_select_admin on public.audit_logs;
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid()));

drop policy if exists settings_admin_manage on public.settings;
create policy settings_admin_manage on public.settings
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid()))
  with check (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid()));

drop policy if exists user_permissions_admin_manage on public.user_permissions;
create policy user_permissions_admin_manage on public.user_permissions
  for all to authenticated
  using (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid()))
  with check (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid()));

drop policy if exists profiles_update_own_or_admin on public.profiles;
create policy profiles_update_own_or_admin on public.profiles
  for update to authenticated
  using ((auth.uid() = id) or (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid())))
  with check ((auth.uid() = id) or (public.has_role(auth.uid(), 'administrador') and public.usuario_ativo(auth.uid())));

-- 2. Funções internas: revogar execução direta -------------------------------
do $do$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'caixa_recalc_totais','comissao_entrega_sync_lancamento','comissao_marcar_paga',
         'comissao_recalc_ajustes','contas_pagar_sync_status','contas_receber_sync_status',
         'custos_recalc_devolucao','folha_importar_automaticos','folha_item_total',
         'folha_competencia_total','handle_new_user','registrar_auditoria',
         'metas_realizado','metas_indicadores_periodo','metas_empresa_detalhe',
         'metas_classificar_projecao','relatorios_custos_por_os'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $do$;

-- 3. usuarios_basicos: e-mail apenas para admin/gerente ----------------------
create or replace function public.usuarios_basicos()
returns table (id uuid, full_name text, email text, roles text[])
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name,
         case
           when public.has_role(auth.uid(), 'administrador')
             or public.has_role(auth.uid(), 'gerente') then p.email
           else null
         end as email,
         coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}'::text[]) as roles
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  where p.active
    and p.status = 'ativo'
    and public.usuario_ativo(auth.uid())
  group by p.id, p.full_name, p.email
  order by p.full_name
$$;

revoke all on function public.usuarios_basicos() from public, anon;
grant execute on function public.usuarios_basicos() to authenticated;

-- 4. Comissão de entrega: exigir permissão -----------------------------------
create or replace function public.comissao_entrega_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not (public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar')
          or public.has_permission(auth.uid(), 'caixa', 'visualizar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para consultar a comissão de entrega.');
  end if;
  select s.value into v from public.settings s where s.key = 'comissao_entrega';
  return jsonb_build_object(
    'ok', true,
    'valor_entrega', coalesce((v->>'valor_entrega')::numeric, 5),
    'valor_entrega_avaliacao', coalesce((v->>'valor_entrega_avaliacao')::numeric, 10),
    'ativo', coalesce((v->>'ativo')::boolean, true)
  );
end $$;

create or replace function public.comissao_entrega_entregadores()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(c.nome_exibicao, c.nome))
                            order by coalesce(c.nome_exibicao, c.nome)), '[]'::jsonb)
    from public.colaboradores c
   where c.status = 'ativo'
     and c.recebe_comissao_entrega
     and (public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar')
          or public.has_permission(auth.uid(), 'caixa', 'visualizar'));
$$;

revoke all on function public.comissao_entrega_config() from public, anon;
grant execute on function public.comissao_entrega_config() to authenticated;
revoke all on function public.comissao_entrega_entregadores() from public, anon;
grant execute on function public.comissao_entrega_entregadores() to authenticated;

-- 5. Padronização de marcas (não destrói o valor original) -------------------
create or replace function public.normalizar_marca(_marca text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(_marca, '')), '') is null then null
    when upper(btrim(_marca)) in ('SAMSUNG','SANSUNG','SANSUMG','SAMSNUG','SAMSUN') then 'SAMSUNG'
    when upper(btrim(_marca)) in ('LG','L.G','L G','LGE') then 'LG'
    when upper(btrim(_marca)) in ('PHILCO','FILCO') then 'PHILCO'
    when upper(btrim(_marca)) in ('PHILIPS','FILIPS','PHILLIPS') then 'PHILIPS'
    when upper(btrim(_marca)) in ('TCL','T.C.L') then 'TCL'
    when upper(btrim(_marca)) in ('AOC','A.O.C') then 'AOC'
    when upper(btrim(_marca)) in ('SEMP','SEMP TOSHIBA','TOSHIBA','SEMPTOSHIBA') then 'SEMP TOSHIBA'
    when upper(btrim(_marca)) in ('PANASONIC','PANASSONIC') then 'PANASONIC'
    when upper(btrim(_marca)) in ('SONY','SONNY') then 'SONY'
    when upper(btrim(_marca)) in ('MULTILASER','MULTI LASER') then 'MULTILASER'
    when upper(btrim(_marca)) in ('HQ','H.Q') then 'HQ'
    else upper(regexp_replace(btrim(_marca), '\s+', ' ', 'g'))
  end
$$;

grant execute on function public.normalizar_marca(text) to authenticated, service_role;

-- Aplica a normalização nas funções de relatório e Modo TV já existentes
do $do$
declare d text;
begin
  for d in
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('relatorios_producao','modo_tv_indicadores')
  loop
    d := regexp_replace(d, 'trim\((\w+\.)?marca_tv\)', 'public.normalizar_marca(\1marca_tv)', 'g');
    d := replace(d, 'trim(c.marca)', 'public.normalizar_marca(c.marca)');
    execute d;
  end loop;
end $do$;