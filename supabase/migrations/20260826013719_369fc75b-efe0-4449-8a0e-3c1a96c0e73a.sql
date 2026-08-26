-- ============ ENUMS ============
create type public.comissao_tipo_regra as enum ('percentual_mao_obra', 'percentual_receita', 'fixo_os', 'fixo_servico', 'personalizada');
create type public.comissao_status as enum ('gerada', 'pendente_conferencia', 'conferida', 'aprovada', 'paga', 'cancelada', 'pendente_configuracao');
create type public.comissao_ajuste_tipo as enum ('bonus', 'acrescimo', 'desconto', 'correcao', 'compensacao');

-- ============ TABELA: regras_comissao ============
create table public.regras_comissao (
  id uuid not null default gen_random_uuid() primary key,
  tecnico_id uuid not null references public.profiles(id),
  tipo_regra public.comissao_tipo_regra not null,
  percentual numeric(5,2),
  valor_fixo numeric(12,2),
  servico_descricao text,
  inicio_vigencia date not null,
  fim_vigencia date,
  ativo boolean not null default true,
  observacao text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint regras_comissao_valor_chk check (
    (tipo_regra in ('percentual_mao_obra', 'percentual_receita') and percentual is not null and percentual > 0)
    or (tipo_regra in ('fixo_os', 'fixo_servico') and valor_fixo is not null and valor_fixo > 0)
    or (tipo_regra = 'personalizada')
  ),
  constraint regras_comissao_vigencia_chk check (fim_vigencia is null or fim_vigencia >= inicio_vigencia)
);
grant select on public.regras_comissao to authenticated;
grant all on public.regras_comissao to service_role;
alter table public.regras_comissao enable row level security;
create policy regras_comissao_select on public.regras_comissao for select to authenticated
  using (tecnico_id = auth.uid() or public.has_permission(auth.uid(), 'comissoes', 'visualizar'));

create trigger update_regras_comissao_updated_at before update on public.regras_comissao
  for each row execute function public.update_updated_at_column();

-- ============ TABELA: comissoes ============
create table public.comissoes (
  id uuid not null default gen_random_uuid() primary key,
  data_referencia date not null,
  os text not null,
  tecnico_id uuid not null references public.profiles(id),
  caixa_lancamento_id uuid references public.caixa_lancamentos(id),
  regra_comissao_id uuid references public.regras_comissao(id),
  tipo_regra public.comissao_tipo_regra,
  receita_liquida numeric(12,2) not null default 0,
  custos_diretos numeric(12,2) not null default 0,
  base_calculo numeric(12,2),
  percentual numeric(5,2),
  valor_calculado numeric(12,2),
  ajuste_total numeric(12,2) not null default 0,
  valor_final numeric(12,2),
  mao_obra_manual numeric(12,2),
  mao_obra_justificativa text,
  mao_obra_por uuid references public.profiles(id),
  mao_obra_em timestamptz,
  status public.comissao_status not null default 'gerada',
  observacao text,
  conferida_em timestamptz,
  conferida_por uuid references public.profiles(id),
  aprovada_em timestamptz,
  aprovada_por uuid references public.profiles(id),
  valor_aprovado numeric(12,2),
  cancelada_em timestamptz,
  cancelada_por uuid references public.profiles(id),
  motivo_cancelamento text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);
create unique index comissoes_os_tecnico_uk on public.comissoes (os, tecnico_id) where status <> 'cancelada';
create index comissoes_tecnico_data_idx on public.comissoes (tecnico_id, data_referencia);
grant select on public.comissoes to authenticated;
grant all on public.comissoes to service_role;
alter table public.comissoes enable row level security;
create policy comissoes_select on public.comissoes for select to authenticated
  using (tecnico_id = auth.uid() or public.has_permission(auth.uid(), 'comissoes', 'visualizar'));

create trigger update_comissoes_updated_at before update on public.comissoes
  for each row execute function public.update_updated_at_column();

-- ============ TABELA: comissao_ajustes ============
create table public.comissao_ajustes (
  id uuid not null default gen_random_uuid() primary key,
  comissao_id uuid not null references public.comissoes(id),
  tipo public.comissao_ajuste_tipo not null,
  valor numeric(12,2) not null,
  motivo text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
grant select on public.comissao_ajustes to authenticated;
grant all on public.comissao_ajustes to service_role;
alter table public.comissao_ajustes enable row level security;
create policy comissao_ajustes_select on public.comissao_ajustes for select to authenticated
  using (exists (select 1 from public.comissoes c where c.id = comissao_id and (c.tecnico_id = auth.uid() or public.has_permission(auth.uid(), 'comissoes', 'visualizar'))));

-- ============ TABELA: comissao_pagamentos ============
create table public.comissao_pagamentos (
  id uuid not null default gen_random_uuid() primary key,
  tecnico_id uuid not null references public.profiles(id),
  data_inicio date,
  data_fim date,
  valor_total numeric(12,2) not null,
  forma_pagamento_id uuid references public.formas_pagamento(id),
  responsavel_id uuid not null references public.profiles(id),
  observacao text,
  pago_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select on public.comissao_pagamentos to authenticated;
grant all on public.comissao_pagamentos to service_role;
alter table public.comissao_pagamentos enable row level security;
create policy comissao_pagamentos_select on public.comissao_pagamentos for select to authenticated
  using (tecnico_id = auth.uid() or public.has_permission(auth.uid(), 'comissoes', 'visualizar'));

-- ============ TABELA: comissao_pagamento_itens ============
create table public.comissao_pagamento_itens (
  id uuid not null default gen_random_uuid() primary key,
  pagamento_id uuid not null references public.comissao_pagamentos(id) on delete cascade,
  comissao_id uuid not null references public.comissoes(id),
  valor numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint comissao_pagamento_itens_uk unique (comissao_id)
);
grant select on public.comissao_pagamento_itens to authenticated;
grant all on public.comissao_pagamento_itens to service_role;
alter table public.comissao_pagamento_itens enable row level security;
create policy comissao_pagamento_itens_select on public.comissao_pagamento_itens for select to authenticated
  using (exists (select 1 from public.comissao_pagamentos p where p.id = pagamento_id and (p.tecnico_id = auth.uid() or public.has_permission(auth.uid(), 'comissoes', 'visualizar'))));

-- ============ TRIGGER: ajustes atualizam valor final ============
create or replace function public.comissao_recalc_ajustes()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(new.comissao_id, old.comissao_id);
begin
  update public.comissoes c set
    ajuste_total = coalesce((select sum(a.valor) from public.comissao_ajustes a where a.comissao_id = v_id), 0),
    valor_final = case when c.valor_calculado is null then null
                       else round(c.valor_calculado + coalesce((select sum(a.valor) from public.comissao_ajustes a where a.comissao_id = v_id), 0), 2) end,
    updated_at = now()
  where c.id = v_id;
  return coalesce(new, old);
end;
$$;
revoke execute on function public.comissao_recalc_ajustes() from public, anon, authenticated;
create trigger comissao_ajustes_recalc after insert or update or delete on public.comissao_ajustes
  for each row execute function public.comissao_recalc_ajustes();

-- ============ TRIGGER: item de pagamento marca comissão como paga ============
create or replace function public.comissao_marcar_paga()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.comissoes set status = 'paga', updated_at = now()
  where id = new.comissao_id and status = 'aprovada';
  if not found then
    raise exception 'Comissão não está aprovada ou já foi paga.';
  end if;
  return new;
end;
$$;
revoke execute on function public.comissao_marcar_paga() from public, anon, authenticated;
create trigger comissao_pagamento_item_paga after insert on public.comissao_pagamento_itens
  for each row execute function public.comissao_marcar_paga();

-- ============ FUNÇÃO: gerar comissões do período ============
create or replace function public.comissoes_gerar(p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_lan record;
  v_regra record;
  v_custos numeric(12,2);
  v_pecas numeric(12,2);
  v_base numeric(12,2);
  v_valor numeric(12,2);
  v_status public.comissao_status;
  v_obs text;
  v_geradas int := 0;
  v_pendentes int := 0;
  v_ignoradas int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para gerar comissões.');
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_INVALIDO', 'message', 'Informe um período válido.');
  end if;

  for v_lan in
    select l.id, l.data_lancamento, l.os, l.cliente, l.tecnico_id, l.receita_liquida
      from public.caixa_lancamentos l
     where l.status = 'ativo'
       and l.data_lancamento between p_from and p_to
       and l.tecnico_id is not null
       and l.os is not null
       and not exists (
         select 1 from public.comissoes c
          where c.caixa_lancamento_id = l.id and c.status <> 'cancelada'
       )
     order by l.data_lancamento
  loop
    select coalesce(sum(c.custo_total - c.devolvido_total), 0),
           coalesce(sum(c.custo_total - c.devolvido_total) filter (where t.eh_peca), 0)
      into v_custos, v_pecas
      from public.custos_os c
      join public.tipos_custo t on t.id = c.tipo_custo_id
     where c.os = v_lan.os and c.status in ('registrado', 'confirmado', 'estornado');

    select r.* into v_regra
      from public.regras_comissao r
     where r.tecnico_id = v_lan.tecnico_id
       and r.ativo
       and r.inicio_vigencia <= v_lan.data_lancamento
       and (r.fim_vigencia is null or r.fim_vigencia >= v_lan.data_lancamento)
     order by r.inicio_vigencia desc
     limit 1;

    v_status := 'gerada';
    v_obs := null;
    v_base := null;
    v_valor := null;

    if not exists (select 1 from public.profiles pr where pr.id = v_lan.tecnico_id and pr.active) then
      v_status := 'pendente_configuracao';
      v_obs := 'Técnico inativo — comissão exige autorização.';
    elsif v_regra.id is null then
      v_status := 'pendente_configuracao';
      v_obs := 'Técnico sem regra de comissão configurada.';
    elsif v_regra.tipo_regra = 'personalizada' then
      v_status := 'pendente_configuracao';
      v_obs := 'Regra personalizada exige cálculo manual.';
    elsif v_regra.tipo_regra = 'percentual_mao_obra' then
      v_base := round(v_lan.receita_liquida - v_pecas, 2);
      v_valor := round(v_base * v_regra.percentual / 100, 2);
    elsif v_regra.tipo_regra = 'percentual_receita' then
      v_base := round(v_lan.receita_liquida, 2);
      v_valor := round(v_base * v_regra.percentual / 100, 2);
    else
      v_base := round(v_lan.receita_liquida, 2);
      v_valor := round(v_regra.valor_fixo, 2);
    end if;

    insert into public.comissoes (
      data_referencia, os, tecnico_id, caixa_lancamento_id, regra_comissao_id, tipo_regra,
      receita_liquida, custos_diretos, base_calculo, percentual, valor_calculado, valor_final,
      status, observacao, created_by, updated_by
    ) values (
      v_lan.data_lancamento, v_lan.os, v_lan.tecnico_id, v_lan.id,
      case when v_regra.id is not null then v_regra.id end,
      case when v_regra.id is not null then v_regra.tipo_regra end,
      round(v_lan.receita_liquida, 2), v_custos, v_base,
      case when v_regra.id is not null then v_regra.percentual end,
      v_valor, v_valor, v_status, v_obs, v_uid, v_uid
    );

    if v_status = 'gerada' then v_geradas := v_geradas + 1; else v_pendentes := v_pendentes + 1; end if;
  end loop;

  select count(*) into v_ignoradas
    from public.caixa_lancamentos l
   where l.status = 'ativo' and l.data_lancamento between p_from and p_to and (l.tecnico_id is null or l.os is null);

  perform public.registrar_auditoria('comissoes', 'gerar', null,
    jsonb_build_object('periodo', jsonb_build_array(p_from, p_to), 'geradas', v_geradas, 'pendentes', v_pendentes));

  return jsonb_build_object('ok', true, 'geradas', v_geradas, 'pendentes_configuracao', v_pendentes, 'lancamentos_sem_tecnico', v_ignoradas);
end;
$$;
revoke execute on function public.comissoes_gerar(date, date) from public, anon;
grant execute on function public.comissoes_gerar(date, date) to authenticated;

-- ============ FUNÇÃO: definir mão de obra manual ============
create or replace function public.comissoes_definir_mao_obra(p_id uuid, p_valor numeric, p_justificativa text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.comissoes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para informar mão de obra.');
  end if;
  if p_valor is null or p_valor < 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Informe um valor de mão de obra válido.');
  end if;
  if nullif(btrim(coalesce(p_justificativa, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'JUSTIFICATIVA_OBRIGATORIA', 'message', 'Informe a justificativa do valor manual.');
  end if;

  select * into v_antigo from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;
  if v_antigo.status not in ('gerada', 'pendente_conferencia', 'conferida') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Só é possível ajustar a base antes da aprovação.');
  end if;

  update public.comissoes c set
    mao_obra_manual = round(p_valor, 2),
    mao_obra_justificativa = btrim(p_justificativa),
    mao_obra_por = v_uid,
    mao_obra_em = now(),
    base_calculo = round(p_valor, 2),
    valor_calculado = case when c.tipo_regra = 'percentual_mao_obra' and c.percentual is not null
                           then round(round(p_valor, 2) * c.percentual / 100, 2) else c.valor_calculado end,
    valor_final = case when c.tipo_regra = 'percentual_mao_obra' and c.percentual is not null
                       then round(round(p_valor, 2) * c.percentual / 100, 2) + c.ajuste_total else c.valor_final end,
    updated_by = v_uid
  where c.id = p_id;

  perform public.registrar_auditoria('comissoes', 'mao_obra_manual', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.comissoes c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;
revoke execute on function public.comissoes_definir_mao_obra(uuid, numeric, text) from public, anon;
grant execute on function public.comissoes_definir_mao_obra(uuid, numeric, text) to authenticated;

-- ============ FUNÇÃO: conferir ============
create or replace function public.comissoes_conferir(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.comissoes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para conferir comissões.');
  end if;

  select * into v_antigo from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;
  if v_antigo.status = 'pendente_configuracao' then
    return jsonb_build_object('ok', false, 'code', 'SEM_VALOR', 'message', 'Configure a regra e recalcule antes de conferir.');
  end if;
  if v_antigo.status not in ('gerada', 'pendente_conferencia') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Esta comissão não está aguardando conferência.');
  end if;

  update public.comissoes set status = 'conferida', conferida_em = now(), conferida_por = v_uid, updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('comissoes', 'conferir', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.comissoes c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;
revoke execute on function public.comissoes_conferir(uuid) from public, anon;
grant execute on function public.comissoes_conferir(uuid) to authenticated;

-- ============ FUNÇÃO: ajustar ============
create or replace function public.comissoes_ajustar(p_id uuid, p_tipo public.comissao_ajuste_tipo, p_valor numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.comissoes%rowtype;
  v_ajuste_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  select * into v_antigo from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;
  if v_antigo.status = 'cancelada' then
    return jsonb_build_object('ok', false, 'code', 'CANCELADA', 'message', 'Comissões canceladas não aceitam ajustes.');
  end if;
  if v_antigo.status = 'paga' and not public.has_permission(v_uid, 'comissoes', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Ajuste em comissão paga exige permissão de administração.');
  end if;
  if v_antigo.status <> 'paga' and not public.has_permission(v_uid, 'comissoes', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para ajustar comissões.');
  end if;
  if p_valor is null or p_valor = 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'O ajuste não pode ser zero.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do ajuste.');
  end if;

  insert into public.comissao_ajustes (comissao_id, tipo, valor, motivo, created_by)
  values (p_id, p_tipo, round(p_valor, 2), btrim(p_motivo), v_uid)
  returning id into v_ajuste_id;

  update public.comissoes set updated_by = v_uid where id = p_id;

  perform public.registrar_auditoria('comissoes', 'ajustar', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.comissoes c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'ajuste_id', v_ajuste_id);
end;
$$;
revoke execute on function public.comissoes_ajustar(uuid, public.comissao_ajuste_tipo, numeric, text) from public, anon;
grant execute on function public.comissoes_ajustar(uuid, public.comissao_ajuste_tipo, numeric, text) to authenticated;

-- ============ FUNÇÃO: aprovar ============
create or replace function public.comissoes_aprovar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.comissoes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'aprovar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para aprovar comissões.');
  end if;

  select * into v_antigo from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;
  if v_antigo.valor_final is null then
    return jsonb_build_object('ok', false, 'code', 'SEM_VALOR', 'message', 'Comissão sem valor calculado não pode ser aprovada.');
  end if;
  if v_antigo.status not in ('gerada', 'pendente_conferencia', 'conferida') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Esta comissão não pode ser aprovada no status atual.');
  end if;

  update public.comissoes set
    status = 'aprovada', aprovada_em = now(), aprovada_por = v_uid,
    valor_aprovado = valor_final, updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('comissoes', 'aprovar', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.comissoes c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'valor_aprovado', v_antigo.valor_final);
end;
$$;
revoke execute on function public.comissoes_aprovar(uuid) from public, anon;
grant execute on function public.comissoes_aprovar(uuid) to authenticated;

-- ============ FUNÇÃO: pagar (individual ou em lote) ============
create or replace function public.comissoes_pagar(p_tecnico_id uuid, p_comissao_ids uuid[], p_forma_pagamento_id uuid default null, p_observacao text default null, p_data date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_total numeric(12,2);
  v_inicio date;
  v_fim date;
  v_pagamento_id uuid;
  v_invalidas int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'pagar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar pagamentos de comissão.');
  end if;
  if p_comissao_ids is null or array_length(p_comissao_ids, 1) is null then
    return jsonb_build_object('ok', false, 'code', 'SELECAO_VAZIA', 'message', 'Selecione ao menos uma comissão aprovada.');
  end if;
  if p_forma_pagamento_id is not null
     and not exists (select 1 from public.formas_pagamento f where f.id = p_forma_pagamento_id and f.ativo) then
    return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Forma de pagamento inválida ou inativa.');
  end if;

  select count(*) into v_invalidas
    from public.comissoes c
   where c.id = any(p_comissao_ids)
     and (c.tecnico_id <> p_tecnico_id or c.status <> 'aprovada'
          or exists (select 1 from public.comissao_pagamento_itens i where i.comissao_id = c.id));
  if v_invalidas > 0 then
    return jsonb_build_object('ok', false, 'code', 'COMISSOES_INVALIDAS', 'message', 'Há comissões não aprovadas, de outro técnico ou já pagas na seleção.');
  end if;

  select coalesce(sum(c.valor_aprovado), 0), min(c.data_referencia), max(c.data_referencia)
    into v_total, v_inicio, v_fim
    from public.comissoes c
   where c.id = any(p_comissao_ids);

  if v_total <= 0 then
    return jsonb_build_object('ok', false, 'code', 'SELECAO_VAZIA', 'message', 'Nenhuma comissão válida na seleção.');
  end if;

  insert into public.comissao_pagamentos (tecnico_id, data_inicio, data_fim, valor_total, forma_pagamento_id, responsavel_id, observacao, pago_em)
  values (p_tecnico_id, v_inicio, v_fim, v_total, p_forma_pagamento_id, v_uid,
          nullif(btrim(coalesce(p_observacao, '')), ''),
          coalesce(p_data, (now() at time zone 'America/Manaus')::date)::timestamptz)
  returning id into v_pagamento_id;

  insert into public.comissao_pagamento_itens (pagamento_id, comissao_id, valor)
  select v_pagamento_id, c.id, c.valor_aprovado
    from public.comissoes c where c.id = any(p_comissao_ids);

  perform public.registrar_auditoria('comissoes', 'pagar', null,
    (select to_jsonb(p) from public.comissao_pagamentos p where p.id = v_pagamento_id));

  return jsonb_build_object('ok', true, 'pagamento_id', v_pagamento_id, 'valor_total', v_total, 'quantidade', array_length(p_comissao_ids, 1));
end;
$$;
revoke execute on function public.comissoes_pagar(uuid, uuid[], uuid, text, date) from public, anon;
grant execute on function public.comissoes_pagar(uuid, uuid[], uuid, text, date) to authenticated;

-- ============ FUNÇÃO: cancelar ============
create or replace function public.comissoes_cancelar(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.comissoes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar comissões.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
  end if;

  select * into v_antigo from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;
  if v_antigo.status = 'paga' then
    return jsonb_build_object('ok', false, 'code', 'JA_PAGA', 'message', 'Comissão paga não pode ser cancelada. Use ajuste de compensação.');
  end if;
  if v_antigo.status = 'cancelada' then
    return jsonb_build_object('ok', false, 'code', 'JA_CANCELADA', 'message', 'Esta comissão já está cancelada.');
  end if;

  update public.comissoes set
    status = 'cancelada', cancelada_em = now(), cancelada_por = v_uid,
    motivo_cancelamento = btrim(p_motivo), updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('comissoes', 'cancelar', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.comissoes c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'valor_original', v_antigo.valor_final);
end;
$$;
revoke execute on function public.comissoes_cancelar(uuid, text) from public, anon;
grant execute on function public.comissoes_cancelar(uuid, text) to authenticated;

-- ============ FUNÇÕES: simular e recalcular ============
create or replace function public.comissoes_simular_recalculo(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v public.comissoes%rowtype;
  v_regra record;
  v_custos numeric(12,2);
  v_pecas numeric(12,2);
  v_base numeric(12,2);
  v_valor numeric(12,2);
begin
  if auth.uid() is null or not public.has_permission(auth.uid(), 'comissoes', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  select * into v from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;

  select coalesce(sum(c.custo_total - c.devolvido_total), 0),
         coalesce(sum(c.custo_total - c.devolvido_total) filter (where t.eh_peca), 0)
    into v_custos, v_pecas
    from public.custos_os c join public.tipos_custo t on t.id = c.tipo_custo_id
   where c.os = v.os and c.status in ('registrado', 'confirmado', 'estornado');

  select r.* into v_regra from public.regras_comissao r
   where r.tecnico_id = v.tecnico_id and r.ativo
     and r.inicio_vigencia <= v.data_referencia
     and (r.fim_vigencia is null or r.fim_vigencia >= v.data_referencia)
   order by r.inicio_vigencia desc limit 1;

  v_base := null; v_valor := null;
  if v_regra.id is not null and v_regra.tipo_regra = 'percentual_mao_obra' then
    v_base := coalesce(v.mao_obra_manual, round(v.receita_liquida - v_pecas, 2));
    v_valor := round(v_base * v_regra.percentual / 100, 2);
  elsif v_regra.id is not null and v_regra.tipo_regra = 'percentual_receita' then
    v_base := round(v.receita_liquida, 2);
    v_valor := round(v_base * v_regra.percentual / 100, 2);
  elsif v_regra.id is not null and v_regra.tipo_regra in ('fixo_os', 'fixo_servico') then
    v_base := round(v.receita_liquida, 2);
    v_valor := round(v_regra.valor_fixo, 2);
  end if;

  return jsonb_build_object(
    'ok', true,
    'valor_atual', v.valor_final,
    'valor_calculado_atual', v.valor_calculado,
    'novo_valor', case when v_valor is null then null else round(v_valor + v.ajuste_total, 2) end,
    'novo_calculado', v_valor,
    'nova_base', v_base,
    'novos_custos', v_custos,
    'diferenca', case when v_valor is null or v.valor_final is null then null else round(v_valor + v.ajuste_total - v.valor_final, 2) end,
    'regra_encontrada', v_regra.id is not null,
    'tipo_regra', case when v_regra.id is not null then v_regra.tipo_regra end,
    'percentual', case when v_regra.id is not null then v_regra.percentual end
  );
end;
$$;
revoke execute on function public.comissoes_simular_recalculo(uuid) from public, anon;
grant execute on function public.comissoes_simular_recalculo(uuid) to authenticated;

create or replace function public.comissoes_recalcular(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_antigo public.comissoes%rowtype;
  v_sim jsonb;
  v_regra_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'comissoes', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Somente administradores podem recalcular comissões.');
  end if;
  if nullif(btrim(coalesce(p_motivo, '')), '') is null then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do recálculo.');
  end if;

  select * into v_antigo from public.comissoes c where c.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;
  if v_antigo.status in ('paga', 'cancelada') then
    return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Comissões pagas ou canceladas não podem ser recalculadas.');
  end if;

  v_sim := public.comissoes_simular_recalculo(p_id);

  select r.id into v_regra_id from public.regras_comissao r
   where r.tecnico_id = v_antigo.tecnico_id and r.ativo
     and r.inicio_vigencia <= v_antigo.data_referencia
     and (r.fim_vigencia is null or r.fim_vigencia >= v_antigo.data_referencia)
   order by r.inicio_vigencia desc limit 1;

  update public.comissoes c set
    regra_comissao_id = v_regra_id,
    tipo_regra = (v_sim ->> 'tipo_regra')::public.comissao_tipo_regra,
    custos_diretos = coalesce((v_sim ->> 'novos_custos')::numeric, c.custos_diretos),
    base_calculo = (v_sim ->> 'nova_base')::numeric,
    percentual = (v_sim ->> 'percentual')::numeric,
    valor_calculado = (v_sim ->> 'novo_calculado')::numeric,
    valor_final = (v_sim ->> 'novo_valor')::numeric,
    status = case when (v_sim ->> 'novo_valor') is not null and c.status = 'pendente_configuracao' then 'gerada'::public.comissao_status else c.status end,
    observacao = case when (v_sim ->> 'novo_valor') is not null and c.status = 'pendente_configuracao' then null else c.observacao end,
    updated_by = v_uid
  where c.id = p_id;

  perform public.registrar_auditoria('comissoes', 'recalcular', to_jsonb(v_antigo),
    (select to_jsonb(c) from public.comissoes c where c.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'novo_valor', v_sim -> 'novo_valor', 'diferenca', v_sim -> 'diferenca');
end;
$$;
revoke execute on function public.comissoes_recalcular(uuid, text) from public, anon;
grant execute on function public.comissoes_recalcular(uuid, text) to authenticated;

-- ============ FUNÇÃO: indicadores ============
create or replace function public.comissoes_indicadores(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_gerada numeric(12,2);
  v_pendente numeric(12,2);
  v_aprovada numeric(12,2);
  v_paga numeric(12,2);
  v_tecnicos int;
  v_receita numeric(12,2);
begin
  if auth.uid() is null or (not public.has_permission(auth.uid(), 'comissoes', 'visualizar')
     and not public.has_permission(auth.uid(), 'dashboard', 'visualizar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(sum(c.valor_final), 0),
         coalesce(sum(c.valor_final) filter (where c.status in ('gerada', 'pendente_conferencia', 'conferida')), 0),
         coalesce(sum(c.valor_final) filter (where c.status = 'aprovada'), 0),
         coalesce(sum(c.valor_final) filter (where c.status = 'paga'), 0),
         count(distinct c.tecnico_id),
         coalesce(sum(c.receita_liquida), 0)
    into v_gerada, v_pendente, v_aprovada, v_paga, v_tecnicos, v_receita
    from public.comissoes c
   where c.status <> 'cancelada' and c.data_referencia between p_from and p_to;

  return jsonb_build_object(
    'ok', true,
    'comissao_gerada', v_gerada,
    'comissao_pendente', v_pendente,
    'comissao_aprovada', v_aprovada,
    'comissao_paga', v_paga,
    'tecnicos_com_comissao', v_tecnicos,
    'receita_relacionada', v_receita,
    'comissao_receita_pct', case when v_receita > 0 then round(v_gerada / v_receita * 100, 1) else null end
  );
end;
$$;
revoke execute on function public.comissoes_indicadores(date, date) from public, anon;
grant execute on function public.comissoes_indicadores(date, date) to authenticated;

-- ============ FUNÇÃO: rentabilidade por técnico ============
create or replace function public.comissoes_por_tecnico(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or (not public.has_permission(auth.uid(), 'comissoes', 'visualizar')
     and not public.has_permission(auth.uid(), 'dashboard', 'visualizar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  return jsonb_build_object(
    'ok', true,
    'tecnicos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'tecnico_id', g.tecnico_id,
        'tecnico', pr.full_name,
        'qtd_os', g.qtd_os,
        'receita_liquida', g.receita,
        'custos_diretos', g.custos,
        'base_comissionavel', g.base,
        'comissao_gerada', g.gerada,
        'comissao_pendente', g.pendente,
        'comissao_paga', g.paga,
        'margem_contribuicao', round(g.receita - g.custos - g.gerada, 2),
        'ticket_medio', case when g.qtd_os > 0 then round(g.receita / g.qtd_os, 2) else 0 end,
        'comissao_receita_pct', case when g.receita > 0 then round(g.gerada / g.receita * 100, 1) else null end,
        'margem_pct', case when g.receita > 0 then round((g.receita - g.custos - g.gerada) / g.receita * 100, 1) else null end
      ) order by g.receita desc)
      from (
        select c.tecnico_id,
               count(*) as qtd_os,
               coalesce(sum(c.receita_liquida), 0) as receita,
               coalesce(sum(c.custos_diretos), 0) as custos,
               coalesce(sum(c.base_calculo), 0) as base,
               coalesce(sum(c.valor_final), 0) as gerada,
               coalesce(sum(c.valor_final) filter (where c.status in ('gerada', 'pendente_conferencia', 'conferida')), 0) as pendente,
               coalesce(sum(c.valor_final) filter (where c.status = 'paga'), 0) as paga
          from public.comissoes c
         where c.status <> 'cancelada' and c.data_referencia between p_from and p_to
         group by c.tecnico_id
      ) g
      join public.profiles pr on pr.id = g.tecnico_id
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.comissoes_por_tecnico(date, date) from public, anon;
grant execute on function public.comissoes_por_tecnico(date, date) to authenticated;

-- ============ ATUALIZAÇÃO: margem de contribuição por OS ============
create or replace function public.custos_por_os(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
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
        'comissao', com.comissao,
        'receita_liquida', rec.receita_liquida,
        'cliente', rec.cliente,
        'tecnico', rec.tecnico,
        'faturado_em', rec.faturado_em,
        'margem_parcial', case when rec.receita_liquida is not null then round(rec.receita_liquida - g.custo_total, 2) else null end,
        'margem_contribuicao', case when rec.receita_liquida is not null then round(rec.receita_liquida - g.custo_total - com.comissao, 2) else null end,
        'margem_pct', case when rec.receita_liquida > 0 then round((rec.receita_liquida - g.custo_total - com.comissao) / rec.receita_liquida * 100, 1) else null end,
        'alerta_custo_elevado', (rec.receita_liquida is not null and rec.receita_liquida > 0 and g.custo_total / rec.receita_liquida * 100 > v_custo_elevado_pct),
        'alerta_margem_baixa', (rec.receita_liquida is not null and rec.receita_liquida > 0 and (rec.receita_liquida - g.custo_total - com.comissao) / rec.receita_liquida * 100 < v_margem_minima_pct)
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
      left join lateral (
        select coalesce(sum(cm.valor_final), 0) as comissao
          from public.comissoes cm
         where cm.os = g.os and cm.status <> 'cancelada'
      ) com on true
    ), '[]'::jsonb)
  );
end;
$$;

-- ============ SEED: permissões do gerente ============
insert into public.role_permissions (role, module_key, action)
select 'gerente'::public.app_role, 'comissoes', a::public.permission_action
from (values ('visualizar'), ('criar'), ('editar'), ('aprovar')) as v(a)
on conflict do nothing;