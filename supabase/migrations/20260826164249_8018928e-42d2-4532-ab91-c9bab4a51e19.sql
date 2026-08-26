-- ============ Enums ============
create type public.comissao_entrega_tipo as enum ('entrega', 'entrega_avaliacao');
create type public.comissao_entrega_status as enum ('gerada', 'pendente_validacao', 'validada', 'paga', 'cancelada');

-- ============ Colaborador habilitado a receber comissão de entrega ============
alter table public.colaboradores
  add column if not exists recebe_comissao_entrega boolean not null default false;

-- ============ Tabela ============
create table public.comissoes_entrega (
  id uuid primary key default gen_random_uuid(),
  caixa_lancamento_id uuid not null references public.caixa_lancamentos(id),
  os text,
  entregador_id uuid not null references public.colaboradores(id),
  tipo public.comissao_entrega_tipo not null,
  valor numeric(12,2) not null,
  avaliacao_confirmada boolean not null default false,
  avaliacao_observacao text,
  status public.comissao_entrega_status not null default 'pendente_validacao',
  motivo_status text,
  validado_por uuid references public.profiles(id),
  validado_em timestamptz,
  pago_em timestamptz,
  pago_por uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create index comissoes_entrega_lancamento_idx on public.comissoes_entrega (caixa_lancamento_id);
create index comissoes_entrega_entregador_idx on public.comissoes_entrega (entregador_id, created_at desc);
create unique index comissoes_entrega_unica_ativa_idx
  on public.comissoes_entrega (caixa_lancamento_id, entregador_id, tipo)
  where status <> 'cancelada';

grant select, insert, update on public.comissoes_entrega to authenticated;
grant all on public.comissoes_entrega to service_role;

alter table public.comissoes_entrega enable row level security;

create policy "Comissao entrega: leitura autorizada"
  on public.comissoes_entrega for select to authenticated
  using (
    public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar')
    or exists (
      select 1 from public.colaboradores c
      where c.id = comissoes_entrega.entregador_id and c.user_id = auth.uid()
    )
  );

create policy "Comissao entrega: sem escrita direta (insert)"
  on public.comissoes_entrega for insert to authenticated with check (false);

create policy "Comissao entrega: sem escrita direta (update)"
  on public.comissoes_entrega for update to authenticated using (false);

create trigger comissoes_entrega_updated_at
  before update on public.comissoes_entrega
  for each row execute function public.update_updated_at_column();

-- ============ Módulo e permissões ============
insert into public.modules (key, label, sort_order)
values ('comissao_entrega', 'Comissão de Entrega', 14)
on conflict (key) do nothing;

insert into public.role_permissions (role, module_key, action)
select r.role, 'comissao_entrega', a.action
from (values ('administrador'::public.app_role)) r(role),
     (values ('visualizar'::public.permission_action), ('validar'), ('pagar'), ('cancelar'), ('configurar'), ('exportar')) a(action)
on conflict do nothing;

insert into public.role_permissions (role, module_key, action)
select 'gerente'::public.app_role, 'comissao_entrega', a.action
from (values ('visualizar'::public.permission_action), ('validar'), ('exportar')) a(action)
on conflict do nothing;

-- ============ Configuração ============
insert into public.settings (key, value)
values ('comissao_entrega', jsonb_build_object(
  'valor_taxa_fixa', 5.00,
  'valor_taxa_com_avaliacao', null,
  'exige_validacao', true,
  'ativo', true
))
on conflict (key) do nothing;

-- ============ Config helper ============
create or replace function public.comissao_entrega_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s.value from public.settings s where s.key = 'comissao_entrega'),
    jsonb_build_object('valor_taxa_fixa', 5.00, 'valor_taxa_com_avaliacao', null, 'exige_validacao', true, 'ativo', true)
  );
$$;

-- ============ Entregadores habilitados ============
create or replace function public.comissao_entrega_entregadores()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', coalesce(c.nome_exibicao, c.nome)) order by coalesce(c.nome_exibicao, c.nome)), '[]'::jsonb)
  from public.colaboradores c
  where c.status = 'ativo' and c.recebe_comissao_entrega;
$$;

-- ============ Registrar / atualizar comissão a partir do lançamento ============
create or replace function public.comissao_entrega_salvar(
  p_lancamento_id uuid,
  p_entregador_id uuid,
  p_tipo public.comissao_entrega_tipo,
  p_avaliacao_confirmada boolean default false,
  p_avaliacao_observacao text default null,
  p_confirmar_duplicidade boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cfg jsonb := public.comissao_entrega_config();
  v_valor numeric(12,2);
  v_lanc public.caixa_lancamentos%rowtype;
  v_existente public.comissoes_entrega%rowtype;
  v_status public.comissao_entrega_status;
  v_id uuid;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not (public.has_permission(v_uid, 'caixa', 'criar') or public.has_permission(v_uid, 'caixa', 'editar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para registrar comissão de entrega.');
  end if;

  if not coalesce((v_cfg ->> 'ativo')::boolean, true) then
    return jsonb_build_object('ok', false, 'code', 'RECURSO_INATIVO', 'message', 'A comissão de entrega está desativada nas configurações.');
  end if;

  select * into v_lanc from public.caixa_lancamentos l where l.id = p_lancamento_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Lançamento de caixa não encontrado.');
  end if;

  if not exists (
    select 1 from public.colaboradores c
    where c.id = p_entregador_id and c.status = 'ativo' and c.recebe_comissao_entrega
  ) then
    return jsonb_build_object('ok', false, 'code', 'ENTREGADOR_INVALIDO', 'message', 'Entregador não encontrado ou não habilitado para comissão de entrega.');
  end if;

  if p_tipo = 'entrega' then
    v_valor := round(coalesce((v_cfg ->> 'valor_taxa_fixa')::numeric, 5.00), 2);
  else
    if (v_cfg ->> 'valor_taxa_com_avaliacao') is null then
      return jsonb_build_object('ok', false, 'code', 'VALOR_NAO_CONFIGURADO',
        'message', 'O valor de entrega + avaliação ainda não foi definido pelo administrador.');
    end if;
    v_valor := round((v_cfg ->> 'valor_taxa_com_avaliacao')::numeric, 2);
  end if;

  if v_valor is null or v_valor <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_INVALIDO', 'message', 'Valor de comissão inválido nas configurações.');
  end if;

  -- comissão vigente deste lançamento (não cancelada)
  select * into v_existente
    from public.comissoes_entrega ce
   where ce.caixa_lancamento_id = p_lancamento_id and ce.status <> 'cancelada'
   order by ce.created_at desc
   limit 1;

  if found then
    if v_existente.status = 'paga' then
      return jsonb_build_object('ok', false, 'code', 'JA_PAGA',
        'message', 'A comissão deste lançamento já foi paga. É necessário fluxo de ajuste/estorno.');
    end if;

    if v_existente.entregador_id = p_entregador_id
       and v_existente.tipo = p_tipo
       and v_existente.avaliacao_confirmada = coalesce(p_avaliacao_confirmada, false)
       and not p_confirmar_duplicidade then
      return jsonb_build_object('ok', true, 'id', v_existente.id, 'inalterada', true);
    end if;

    update public.comissoes_entrega set
      entregador_id = p_entregador_id,
      os = v_lanc.os,
      tipo = p_tipo,
      valor = v_valor,
      avaliacao_confirmada = (p_tipo = 'entrega_avaliacao' and coalesce(p_avaliacao_confirmada, false)),
      avaliacao_observacao = nullif(btrim(coalesce(p_avaliacao_observacao, '')), ''),
      status = case
        when p_tipo = 'entrega_avaliacao' then 'pendente_validacao'::public.comissao_entrega_status
        when coalesce((v_cfg ->> 'exige_validacao')::boolean, true) then 'pendente_validacao'::public.comissao_entrega_status
        else 'gerada'::public.comissao_entrega_status
      end,
      validado_por = null,
      validado_em = null,
      updated_by = v_uid
    where id = v_existente.id;

    perform public.registrar_auditoria('comissao_entrega', 'editar', to_jsonb(v_existente),
      (select to_jsonb(ce) from public.comissoes_entrega ce where ce.id = v_existente.id));

    return jsonb_build_object('ok', true, 'id', v_existente.id, 'valor', v_valor);
  end if;

  -- duplicidade histórica (mesmo lançamento/entregador/tipo já cancelado ou existente)
  if not p_confirmar_duplicidade and exists (
    select 1 from public.comissoes_entrega ce
    where ce.caixa_lancamento_id = p_lancamento_id
      and ce.entregador_id = p_entregador_id
      and ce.tipo = p_tipo
  ) then
    return jsonb_build_object('ok', false, 'code', 'DUPLICIDADE',
      'message', 'Já existe uma comissão deste tipo para este lançamento e entregador.');
  end if;

  v_status := case
    when p_tipo = 'entrega_avaliacao' then 'pendente_validacao'::public.comissao_entrega_status
    when coalesce((v_cfg ->> 'exige_validacao')::boolean, true) then 'pendente_validacao'::public.comissao_entrega_status
    else 'gerada'::public.comissao_entrega_status
  end;

  insert into public.comissoes_entrega (
    caixa_lancamento_id, os, entregador_id, tipo, valor,
    avaliacao_confirmada, avaliacao_observacao, status, created_by, updated_by
  ) values (
    p_lancamento_id, v_lanc.os, p_entregador_id, p_tipo, v_valor,
    (p_tipo = 'entrega_avaliacao' and coalesce(p_avaliacao_confirmada, false)),
    nullif(btrim(coalesce(p_avaliacao_observacao, '')), ''),
    v_status, v_uid, v_uid
  )
  returning id into v_id;

  perform public.registrar_auditoria('comissao_entrega', 'criar', null,
    (select to_jsonb(ce) from public.comissoes_entrega ce where ce.id = v_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'valor', v_valor, 'status', v_status);
end;
$$;

-- ============ Remover comissão vigente (quando o lançamento deixa de ter comissão) ============
create or replace function public.comissao_entrega_remover(p_lancamento_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ce public.comissoes_entrega%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  if not public.has_permission(v_uid, 'caixa', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para alterar a comissão de entrega.');
  end if;

  select * into v_ce from public.comissoes_entrega ce
   where ce.caixa_lancamento_id = p_lancamento_id and ce.status <> 'cancelada'
   order by ce.created_at desc limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'nada_a_fazer', true);
  end if;

  if v_ce.status = 'paga' then
    return jsonb_build_object('ok', false, 'code', 'JA_PAGA',
      'message', 'A comissão deste lançamento já foi paga. É necessário fluxo de ajuste/estorno.');
  end if;

  update public.comissoes_entrega set
    status = 'cancelada',
    motivo_status = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Comissão removida na edição do lançamento.'),
    updated_by = v_uid
  where id = v_ce.id;

  perform public.registrar_auditoria('comissao_entrega', 'cancelar', to_jsonb(v_ce),
    (select to_jsonb(ce) from public.comissoes_entrega ce where ce.id = v_ce.id));

  return jsonb_build_object('ok', true, 'id', v_ce.id);
end;
$$;

-- ============ Mudança de status (validar / rejeitar / cancelar / pagar) ============
create or replace function public.comissao_entrega_status_alterar(
  p_id uuid,
  p_acao text,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ce public.comissoes_entrega%rowtype;
  v_novo public.comissao_entrega_status;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;

  select * into v_ce from public.comissoes_entrega ce where ce.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Comissão não encontrada.');
  end if;

  if p_acao in ('validar', 'rejeitar') and not public.has_permission(v_uid, 'comissao_entrega', 'validar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para validar comissões de entrega.');
  end if;
  if p_acao = 'pagar' and not public.has_permission(v_uid, 'comissao_entrega', 'pagar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para pagar comissões de entrega.');
  end if;
  if p_acao = 'cancelar' and not public.has_permission(v_uid, 'comissao_entrega', 'cancelar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cancelar comissões de entrega.');
  end if;

  if v_ce.status = 'paga' and p_acao <> 'cancelar' then
    return jsonb_build_object('ok', false, 'code', 'JA_PAGA', 'message', 'Esta comissão já foi paga.');
  end if;

  if p_acao = 'validar' then
    if v_ce.status not in ('gerada', 'pendente_validacao') then
      return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente comissões geradas ou pendentes podem ser validadas.');
    end if;
    if v_ce.tipo = 'entrega_avaliacao' and not v_ce.avaliacao_confirmada then
      return jsonb_build_object('ok', false, 'code', 'AVALIACAO_NAO_CONFIRMADA',
        'message', 'O incentivo por avaliação só pode ser validado com a avaliação confirmada.');
    end if;
    v_novo := 'validada';
  elsif p_acao = 'rejeitar' then
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo da rejeição.');
    end if;
    v_novo := 'pendente_validacao';
  elsif p_acao = 'cancelar' then
    if nullif(btrim(coalesce(p_motivo, '')), '') is null then
      return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO', 'message', 'Informe o motivo do cancelamento.');
    end if;
    if v_ce.status = 'paga' and not public.has_permission(v_uid, 'comissao_entrega', 'configurar') then
      return jsonb_build_object('ok', false, 'code', 'EXIGE_ADM', 'message', 'Comissão já paga: o ajuste exige um administrador.');
    end if;
    v_novo := 'cancelada';
  elsif p_acao = 'pagar' then
    if v_ce.status <> 'validada' then
      return jsonb_build_object('ok', false, 'code', 'STATUS_INVALIDO', 'message', 'Somente comissões validadas podem ser pagas.');
    end if;
    v_novo := 'paga';
  elsif p_acao = 'confirmar_avaliacao' then
    if not public.has_permission(v_uid, 'comissao_entrega', 'validar') then
      return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para confirmar avaliações.');
    end if;
    update public.comissoes_entrega set
      avaliacao_confirmada = true,
      avaliacao_observacao = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), avaliacao_observacao),
      updated_by = v_uid
    where id = p_id;
    perform public.registrar_auditoria('comissao_entrega', 'editar', to_jsonb(v_ce),
      (select to_jsonb(ce) from public.comissoes_entrega ce where ce.id = p_id));
    return jsonb_build_object('ok', true, 'id', p_id);
  else
    return jsonb_build_object('ok', false, 'code', 'ACAO_INVALIDA', 'message', 'Ação inválida.');
  end if;

  update public.comissoes_entrega set
    status = v_novo,
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
end;
$$;

-- ============ Listagem com filtros ============
create or replace function public.comissao_entrega_listar(
  p_inicio date default null,
  p_fim date default null,
  p_entregador_id uuid default null,
  p_status public.comissao_entrega_status default null,
  p_tipo public.comissao_entrega_tipo default null,
  p_os text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pode boolean;
  v_colab uuid;
  v_itens jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO');
  end if;

  v_pode := public.has_permission(v_uid, 'comissao_entrega', 'visualizar');
  select c.id into v_colab from public.colaboradores c where c.user_id = v_uid limit 1;

  if not v_pode and v_colab is null then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(jsonb_agg(x order by x ->> 'data' desc), '[]'::jsonb) into v_itens
  from (
    select jsonb_build_object(
      'id', ce.id,
      'data', l.data_lancamento,
      'os', coalesce(ce.os, l.os),
      'caixa_lancamento_id', ce.caixa_lancamento_id,
      'entregador_id', ce.entregador_id,
      'entregador', coalesce(col.nome_exibicao, col.nome),
      'tipo', ce.tipo,
      'valor', ce.valor,
      'avaliacao_confirmada', ce.avaliacao_confirmada,
      'avaliacao_observacao', ce.avaliacao_observacao,
      'status', ce.status,
      'motivo_status', ce.motivo_status,
      'lancamento_status', l.status,
      'responsavel', resp.full_name,
      'validado_por', val.full_name,
      'validado_em', ce.validado_em,
      'pago_em', ce.pago_em,
      'created_at', ce.created_at
    ) as x
    from public.comissoes_entrega ce
    join public.caixa_lancamentos l on l.id = ce.caixa_lancamento_id
    join public.colaboradores col on col.id = ce.entregador_id
    left join public.profiles resp on resp.id = ce.created_by
    left join public.profiles val on val.id = ce.validado_por
    where (v_pode or ce.entregador_id = v_colab)
      and (p_inicio is null or l.data_lancamento >= p_inicio)
      and (p_fim is null or l.data_lancamento <= p_fim)
      and (p_entregador_id is null or ce.entregador_id = p_entregador_id)
      and (p_status is null or ce.status = p_status)
      and (p_tipo is null or ce.tipo = p_tipo)
      and (nullif(btrim(coalesce(p_os, '')), '') is null or coalesce(ce.os, l.os) ilike '%' || btrim(p_os) || '%')
  ) s;

  return jsonb_build_object('ok', true, 'itens', v_itens, 'pode_gerir', v_pode);
end;
$$;

-- ============ Relatório por entregador ============
create or replace function public.comissao_entrega_relatorio(
  p_inicio date default null,
  p_fim date default null,
  p_entregador_id uuid default null,
  p_status public.comissao_entrega_status default null,
  p_tipo public.comissao_entrega_tipo default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_itens jsonb;
begin
  if v_uid is null or not public.has_permission(v_uid, 'comissao_entrega', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entregador_id', s.entregador_id,
    'entregador', s.entregador,
    'entregas', s.entregas,
    'com_taxa_fixa', s.com_taxa_fixa,
    'com_avaliacao', s.com_avaliacao,
    'avaliacoes_confirmadas', s.avaliacoes_confirmadas,
    'valor_gerado', s.valor_gerado,
    'valor_validado', s.valor_validado,
    'valor_pago', s.valor_pago,
    'valor_pendente', s.valor_pendente,
    'valor_cancelado', s.valor_cancelado
  ) order by s.valor_gerado desc), '[]'::jsonb) into v_itens
  from (
    select ce.entregador_id,
           coalesce(col.nome_exibicao, col.nome) as entregador,
           count(*) filter (where ce.status <> 'cancelada') as entregas,
           count(*) filter (where ce.tipo = 'entrega' and ce.status <> 'cancelada') as com_taxa_fixa,
           count(*) filter (where ce.tipo = 'entrega_avaliacao' and ce.status <> 'cancelada') as com_avaliacao,
           count(*) filter (where ce.avaliacao_confirmada and ce.status <> 'cancelada') as avaliacoes_confirmadas,
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
end;
$$;

-- ============ Cancelamento do lançamento cancela a comissão (preservando histórico) ============
create or replace function public.comissao_entrega_sync_lancamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'ativo' and old.status = 'ativo' then
    update public.comissoes_entrega ce set
      status = 'cancelada',
      motivo_status = coalesce(new.motivo_cancelamento, 'Lançamento do caixa cancelado/estornado.'),
      updated_by = auth.uid()
    where ce.caixa_lancamento_id = new.id
      and ce.status not in ('cancelada', 'paga');
  end if;
  return new;
end;
$$;

create trigger caixa_lancamentos_comissao_entrega
  after update of status on public.caixa_lancamentos
  for each row execute function public.comissao_entrega_sync_lancamento();

-- ============ Segurança de execução ============
revoke execute on function public.comissao_entrega_config() from anon;
revoke execute on function public.comissao_entrega_entregadores() from anon;
revoke execute on function public.comissao_entrega_salvar(uuid, uuid, public.comissao_entrega_tipo, boolean, text, boolean) from anon;
revoke execute on function public.comissao_entrega_remover(uuid, text) from anon;
revoke execute on function public.comissao_entrega_status_alterar(uuid, text, text) from anon;
revoke execute on function public.comissao_entrega_listar(date, date, uuid, public.comissao_entrega_status, public.comissao_entrega_tipo, text) from anon;
revoke execute on function public.comissao_entrega_relatorio(date, date, uuid, public.comissao_entrega_status, public.comissao_entrega_tipo) from anon;
revoke execute on function public.comissao_entrega_sync_lancamento() from anon;