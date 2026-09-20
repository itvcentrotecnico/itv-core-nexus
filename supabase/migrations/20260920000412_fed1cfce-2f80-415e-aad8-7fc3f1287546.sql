-- 1. Custo unitário da peça (visível apenas a quem administra o estoque)
alter table public.estoque_itens add column if not exists custo_unitario numeric(12,2) not null default 0;

-- 2. Movimentações (histórico imutável)
create table if not exists public.estoque_movimentos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_itens(id) on delete restrict,
  tipo text not null check (tipo in ('entrada','saida')),
  motivo text not null check (motivo in ('uso_os','defeito_perda','devolucao_fornecedor','transferencia','ajuste_inventario','entrada_inicial','entrada_compra','estorno','devolucao_tecnico')),
  quantidade integer not null check (quantidade > 0),
  os text,
  tecnico_id uuid references public.profiles(id),
  destinatario text,
  observacao text,
  saldo_anterior integer not null,
  saldo_posterior integer not null,
  custo_unitario numeric(12,2) not null default 0,
  custo_os_id uuid references public.custos_os(id),
  reserva_id uuid,
  estorno_de uuid references public.estoque_movimentos(id),
  estornado_em timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_estoque_mov_item on public.estoque_movimentos(item_id, created_at desc);
create index if not exists idx_estoque_mov_os on public.estoque_movimentos(os);

grant select on public.estoque_movimentos to authenticated;
grant all on public.estoque_movimentos to service_role;
alter table public.estoque_movimentos enable row level security;
drop policy if exists "Estoque: ver movimentações" on public.estoque_movimentos;
create policy "Estoque: ver movimentações" on public.estoque_movimentos
  for select to authenticated using (public.has_permission(auth.uid(), 'estoque', 'visualizar'));

-- 3. Reservas (não reduzem o saldo físico)
create table if not exists public.estoque_reservas (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.estoque_itens(id) on delete restrict,
  quantidade integer not null check (quantidade > 0),
  os text,
  tecnico_id uuid references public.profiles(id),
  status text not null default 'ativa' check (status in ('ativa','atendida','cancelada')),
  observacao text,
  motivo_cancelamento text,
  movimento_id uuid references public.estoque_movimentos(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists idx_estoque_reservas_item on public.estoque_reservas(item_id, status);

grant select on public.estoque_reservas to authenticated;
grant all on public.estoque_reservas to service_role;
alter table public.estoque_reservas enable row level security;
drop policy if exists "Estoque: ver reservas" on public.estoque_reservas;
create policy "Estoque: ver reservas" on public.estoque_reservas
  for select to authenticated using (public.has_permission(auth.uid(), 'estoque', 'visualizar'));

drop trigger if exists trg_estoque_reservas_updated on public.estoque_reservas;
create trigger trg_estoque_reservas_updated before update on public.estoque_reservas
  for each row execute function public.update_updated_at_column();

-- 4. Permissões
insert into public.role_permissions (role, module_key, action) values
  ('adm_operacional','estoque','movimentar'),
  ('adm_operacional','estoque','estornar'),
  ('adm_operacional','estoque','reservar'),
  ('tecnico','estoque','reservar')
on conflict do nothing;

-- 5. Saldo nunca muda em silêncio pela tela de cadastro
create or replace function public.estoque_item_salvar(p_dados jsonb, p_compatibilidades text[] default '{}'::text[], p_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid;
  v_tipo text := p_dados ->> 'tipo';
  v_modelo text := btrim(coalesce(p_dados ->> 'modelo', ''));
  v_codigo text := nullif(btrim(coalesce(p_dados ->> 'codigo_placa', '')), '');
  v_polegada text := nullif(btrim(coalesce(p_dados ->> 'polegada', '')), '');
  v_qtd int := greatest(coalesce((p_dados ->> 'quantidade')::int, 0), 0);
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
      quantidade, estoque_minimo, custo_unitario, observacao, teste, created_by, updated_by)
    values (
      v_tipo, (p_dados ->> 'marca_id')::uuid, v_polegada, v_modelo, v_codigo,
      (p_dados ->> 'localizacao_id')::uuid, v_qtd,
      greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      greatest(coalesce((p_dados ->> 'custo_unitario')::numeric, 0), 0),
      nullif(btrim(coalesce(p_dados ->> 'observacao','')), ''),
      coalesce((p_dados ->> 'teste')::boolean, false),
      auth.uid(), auth.uid())
    returning id into v_id;

    if v_qtd > 0 then
      insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, observacao,
        saldo_anterior, saldo_posterior, custo_unitario, created_by)
      values (v_id, 'entrada', 'entrada_inicial', v_qtd, 'Quantidade inicial do cadastro.',
        0, v_qtd, greatest(coalesce((p_dados ->> 'custo_unitario')::numeric, 0), 0), auth.uid());
    end if;
  else
    v_id := p_id;
    -- quantidade NUNCA é alterada aqui: toda mudança de saldo passa por movimentação
    update public.estoque_itens set
      marca_id = (p_dados ->> 'marca_id')::uuid,
      polegada = v_polegada,
      modelo = v_modelo,
      codigo_placa = v_codigo,
      localizacao_id = (p_dados ->> 'localizacao_id')::uuid,
      estoque_minimo = greatest(coalesce((p_dados ->> 'estoque_minimo')::int, 0), 0),
      custo_unitario = greatest(coalesce((p_dados ->> 'custo_unitario')::numeric, custo_unitario), 0),
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
$function$;

-- 6. Baixa de estoque
create or replace function public.estoque_baixar(
  p_item_id uuid,
  p_quantidade integer,
  p_motivo text,
  p_os text default null,
  p_tecnico_id uuid default null,
  p_observacao text default null,
  p_reserva_id uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_item record;
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_disp int;
  v_reserva record;
  v_custo_id uuid;
  v_mov_id uuid;
  v_novo int;
  v_tipo_peca uuid;
  v_tecnico_nome text;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;
  if p_motivo not in ('uso_os','defeito_perda','devolucao_fornecedor','transferencia','ajuste_inventario') then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_INVALIDO');
  end if;
  if p_motivo = 'uso_os' and v_os is null then
    return jsonb_build_object('ok', false, 'code', 'OS_OBRIGATORIA');
  end if;

  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id for update of i;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;

  if p_reserva_id is not null then
    select * into v_reserva from public.estoque_reservas
     where id = p_reserva_id and item_id = p_item_id and status = 'ativa' for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'RESERVA_INVALIDA');
    end if;
    if p_quantidade > v_reserva.quantidade then
      return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_ACIMA_RESERVA');
    end if;
    v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0) + v_reserva.quantidade;
  else
    v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);
  end if;

  if p_quantidade > v_disp then
    return jsonb_build_object('ok', false, 'code', 'SALDO_INSUFICIENTE',
      'disponivel', v_disp);
  end if;

  v_novo := v_item.quantidade - p_quantidade;
  if v_novo < 0 then
    return jsonb_build_object('ok', false, 'code', 'SALDO_INSUFICIENTE', 'disponivel', v_disp);
  end if;

  -- Custo direto da OS (apenas com custo unitário cadastrado, um lançamento por movimentação)
  if p_motivo = 'uso_os' and coalesce(v_item.custo_unitario, 0) > 0 then
    select id into v_tipo_peca from public.tipos_custo where eh_peca and ativo order by ordem limit 1;
    if v_tipo_peca is not null then
      insert into public.custos_os (os, tecnico_id, tipo_custo_id, descricao, marca, modelo,
        quantidade, custo_unitario, custo_total, status, observacao, created_by, updated_by)
      values (v_os, p_tecnico_id, v_tipo_peca,
        case when v_item.tipo = 'kit_led' then 'Kit de LED ' else 'Placa Main ' end || v_item.modelo,
        v_item.marca_nome, v_item.modelo,
        p_quantidade, v_item.custo_unitario, round(v_item.custo_unitario * p_quantidade, 2),
        'registrado', 'Baixa automática do Estoque Técnico.', auth.uid(), auth.uid())
      returning id into v_custo_id;
    end if;
  end if;

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, os, tecnico_id,
    observacao, saldo_anterior, saldo_posterior, custo_unitario, custo_os_id, reserva_id, created_by)
  values (p_item_id, 'saida', p_motivo, p_quantidade, v_os, p_tecnico_id,
    nullif(btrim(coalesce(p_observacao,'')), ''), v_item.quantidade, v_novo,
    coalesce(v_item.custo_unitario, 0), v_custo_id, p_reserva_id, auth.uid())
  returning id into v_mov_id;

  update public.estoque_itens set quantidade = v_novo, updated_by = auth.uid() where id = p_item_id;

  if p_reserva_id is not null then
    update public.estoque_reservas
       set status = case when p_quantidade >= v_reserva.quantidade then 'atendida' else 'ativa' end,
           quantidade = greatest(v_reserva.quantidade - p_quantidade, 0),
           movimento_id = v_mov_id,
           updated_by = auth.uid()
     where id = p_reserva_id;
    if p_quantidade >= v_reserva.quantidade then
      update public.estoque_reservas set quantidade = v_reserva.quantidade where id = p_reserva_id;
    end if;
    update public.estoque_itens
       set quantidade_reservada = greatest(quantidade_reservada - least(p_quantidade, v_reserva.quantidade), 0)
     where id = p_item_id;
  end if;

  select full_name into v_tecnico_nome from public.profiles where id = p_tecnico_id;

  perform public.registrar_auditoria('estoque', 'baixa', null,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'motivo', p_motivo,
      'os', v_os, 'tecnico_id', p_tecnico_id, 'saldo_anterior', v_item.quantidade,
      'saldo_posterior', v_novo, 'custo_os_id', v_custo_id));

  return jsonb_build_object('ok', true, 'id', v_mov_id,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'tipo', v_item.tipo,
    'gaveta', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'quantidade', p_quantidade, 'os', v_os,
    'tecnico', v_tecnico_nome,
    'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo,
    'custo_os_id', v_custo_id);
end;
$function$;

-- 7. Entrada / reposição
create or replace function public.estoque_entrada(
  p_item_id uuid,
  p_quantidade integer,
  p_motivo text default 'entrada_compra',
  p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_item record; v_novo int; v_mov_id uuid;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;
  if p_motivo not in ('entrada_compra','devolucao_tecnico','ajuste_inventario','transferencia') then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_INVALIDO');
  end if;

  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id for update of i;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;

  v_novo := v_item.quantidade + p_quantidade;

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, observacao,
    saldo_anterior, saldo_posterior, custo_unitario, created_by)
  values (p_item_id, 'entrada', p_motivo, p_quantidade,
    nullif(btrim(coalesce(p_observacao,'')), ''), v_item.quantidade, v_novo,
    coalesce(v_item.custo_unitario, 0), auth.uid())
  returning id into v_mov_id;

  update public.estoque_itens set quantidade = v_novo, updated_by = auth.uid() where id = p_item_id;

  perform public.registrar_auditoria('estoque', 'entrada', null,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'motivo', p_motivo,
      'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo));

  return jsonb_build_object('ok', true, 'id', v_mov_id,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'gaveta', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'quantidade', p_quantidade,
    'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo);
end;
$function$;

-- 8. Estorno de movimentação
create or replace function public.estoque_movimento_estornar(p_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_mov record; v_item record; v_novo int; v_novo_id uuid;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'estornar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO');
  end if;

  select * into v_mov from public.estoque_movimentos where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;
  if v_mov.estornado_em is not null then
    return jsonb_build_object('ok', false, 'code', 'JA_ESTORNADO');
  end if;
  if v_mov.motivo = 'estorno' then
    return jsonb_build_object('ok', false, 'code', 'MOVIMENTO_NAO_ESTORNAVEL');
  end if;

  select * into v_item from public.estoque_itens where id = v_mov.item_id for update;

  if v_mov.tipo = 'saida' then
    v_novo := v_item.quantidade + v_mov.quantidade;
  else
    v_novo := v_item.quantidade - v_mov.quantidade;
    if v_novo < 0 then
      return jsonb_build_object('ok', false, 'code', 'SALDO_INSUFICIENTE');
    end if;
  end if;

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, os, tecnico_id,
    observacao, saldo_anterior, saldo_posterior, custo_unitario, estorno_de, created_by)
  values (v_mov.item_id, case when v_mov.tipo = 'saida' then 'entrada' else 'saida' end,
    'estorno', v_mov.quantidade, v_mov.os, v_mov.tecnico_id, btrim(p_motivo),
    v_item.quantidade, v_novo, coalesce(v_item.custo_unitario, 0), v_mov.id, auth.uid())
  returning id into v_novo_id;

  update public.estoque_itens set quantidade = v_novo, updated_by = auth.uid() where id = v_mov.item_id;
  update public.estoque_movimentos set estornado_em = now() where id = v_mov.id;

  if v_mov.custo_os_id is not null then
    update public.custos_os
       set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
           motivo_cancelamento = 'Estorno da baixa no Estoque Técnico: ' || btrim(p_motivo),
           updated_by = auth.uid()
     where id = v_mov.custo_os_id and status <> 'cancelado';
  end if;

  perform public.registrar_auditoria('estoque', 'estorno_movimento', null,
    jsonb_build_object('movimento_id', v_mov.id, 'motivo', btrim(p_motivo),
      'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo));

  return jsonb_build_object('ok', true, 'id', v_novo_id,
    'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo);
end;
$function$;

-- 9. Reserva (técnico) — não reduz saldo físico
create or replace function public.estoque_reservar(
  p_item_id uuid, p_quantidade integer, p_os text default null, p_observacao text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_item record; v_disp int; v_id uuid;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'reservar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;

  select * into v_item from public.estoque_itens where id = p_item_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;

  v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);
  if p_quantidade > v_disp then
    return jsonb_build_object('ok', false, 'code', 'SALDO_INSUFICIENTE', 'disponivel', v_disp);
  end if;

  insert into public.estoque_reservas (item_id, quantidade, os, tecnico_id, observacao, created_by, updated_by)
  values (p_item_id, p_quantidade, nullif(btrim(coalesce(p_os,'')), ''), auth.uid(),
    nullif(btrim(coalesce(p_observacao,'')), ''), auth.uid(), auth.uid())
  returning id into v_id;

  update public.estoque_itens
     set quantidade_reservada = quantidade_reservada + p_quantidade
   where id = p_item_id;

  perform public.registrar_auditoria('estoque', 'reserva_criar', null,
    jsonb_build_object('item_id', p_item_id, 'quantidade', p_quantidade, 'os', p_os));

  return jsonb_build_object('ok', true, 'id', v_id,
    'disponivel', greatest(v_item.quantidade - v_item.quantidade_reservada - p_quantidade, 0));
end;
$function$;

create or replace function public.estoque_reserva_cancelar(p_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_r record;
begin
  select * into v_r from public.estoque_reservas where id = p_id and status = 'ativa' for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;
  if not (public.has_permission(auth.uid(), 'estoque', 'movimentar')
          or (v_r.tecnico_id = auth.uid() and public.has_permission(auth.uid(), 'estoque', 'reservar'))) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  update public.estoque_reservas
     set status = 'cancelada', motivo_cancelamento = nullif(btrim(coalesce(p_motivo,'')), ''), updated_by = auth.uid()
   where id = p_id;

  update public.estoque_itens
     set quantidade_reservada = greatest(quantidade_reservada - v_r.quantidade, 0)
   where id = v_r.item_id;

  perform public.registrar_auditoria('estoque', 'reserva_cancelar', null,
    jsonb_build_object('reserva_id', p_id, 'motivo', p_motivo));

  return jsonb_build_object('ok', true);
end;
$function$;

-- 10. Histórico da peça
create or replace function public.estoque_item_historico(p_item_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare v_mov jsonb; v_res jsonb; v_ver_custo boolean;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_ver_custo := public.has_permission(auth.uid(), 'estoque', 'movimentar');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'tipo', m.tipo, 'motivo', m.motivo, 'quantidade', m.quantidade,
      'os', m.os, 'tecnico_nome', t.full_name, 'observacao', m.observacao,
      'saldo_anterior', m.saldo_anterior, 'saldo_posterior', m.saldo_posterior,
      'custo_unitario', case when v_ver_custo then m.custo_unitario else null end,
      'custo_os_id', m.custo_os_id, 'estornado_em', m.estornado_em, 'estorno_de', m.estorno_de,
      'created_at', m.created_at, 'responsavel', r.full_name) order by m.created_at desc), '[]'::jsonb)
    into v_mov
    from public.estoque_movimentos m
    left join public.profiles t on t.id = m.tecnico_id
    left join public.profiles r on r.id = m.created_by
   where m.item_id = p_item_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'quantidade', r.quantidade, 'os', r.os, 'tecnico_nome', p.full_name,
      'observacao', r.observacao, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    into v_res
    from public.estoque_reservas r
    left join public.profiles p on p.id = r.tecnico_id
   where r.item_id = p_item_id and r.status = 'ativa';

  return jsonb_build_object('ok', true, 'movimentos', v_mov, 'reservas', v_res);
end;
$function$;

-- 11. Busca passa a devolver custo (apenas a quem movimenta) e reservas
create or replace function public.estoque_buscar(p_busca text default null, p_tipo text default null,
  p_marca_id uuid default null, p_polegada text default null, p_localizacao_id uuid default null,
  p_disponibilidade text default null, p_limit integer default 50, p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_q text := nullif(public.estoque_norm(p_busca), '');
  v_total integer;
  v_itens jsonb;
  v_ver_custo boolean := public.has_permission(auth.uid(), 'estoque', 'movimentar');
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  with base as (
    select i.*, m.nome as marca_nome, l.grupo, l.numero, l.codigo as gaveta_codigo
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
           'custo_unitario', case when v_ver_custo then b.custo_unitario else null end,
           'compatibilidades', b.compatibilidades,
           'status', case when b.quantidade = 0 then 'sem_estoque'
                          when b.quantidade <= b.estoque_minimo then 'baixo'
                          else 'em_estoque' end
         )), '[]'::jsonb) into v_itens from base b;

  return jsonb_build_object('ok', true, 'total', v_total, 'itens', v_itens);
end;
$function$;

revoke execute on function public.estoque_baixar(uuid, integer, text, text, uuid, text, uuid) from anon;
revoke execute on function public.estoque_entrada(uuid, integer, text, text) from anon;
revoke execute on function public.estoque_movimento_estornar(uuid, text) from anon;
revoke execute on function public.estoque_reservar(uuid, integer, text, text) from anon;
revoke execute on function public.estoque_reserva_cancelar(uuid, text) from anon;
revoke execute on function public.estoque_item_historico(uuid) from anon;
revoke execute on function public.estoque_buscar(text, text, uuid, text, uuid, text, integer, integer) from anon;
revoke execute on function public.estoque_item_salvar(jsonb, text[], uuid) from anon;