-- 1. Empresas CNPJ
create table public.clientes_cnpj (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  telefone text,
  email_financeiro text,
  contato text,
  observacao text,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.clientes_cnpj to authenticated;
grant all on public.clientes_cnpj to service_role;
alter table public.clientes_cnpj enable row level security;
create policy clientes_cnpj_select on public.clientes_cnpj for select to authenticated
  using (public.has_permission(auth.uid(),'caixa','visualizar') or public.has_permission(auth.uid(),'financeiro','visualizar'));

-- 2. Extensões do título
alter table public.contas_receber
  add column cliente_cnpj_id uuid references public.clientes_cnpj(id),
  add column documento text,
  add column nota_fiscal text,
  add column renegociado boolean not null default false;
create index idx_cr_cnpj on public.contas_receber(cliente_cnpj_id);
create index idx_cr_venc on public.contas_receber(vencimento) where status in ('pendente','parcialmente_recebido');

create table public.contas_receber_vencimentos (
  id uuid primary key default gen_random_uuid(),
  conta_receber_id uuid not null references public.contas_receber(id),
  vencimento_anterior date not null,
  vencimento_novo date not null,
  motivo text not null,
  alterado_por uuid not null references public.profiles(id),
  alterado_em timestamptz not null default now()
);
grant select on public.contas_receber_vencimentos to authenticated;
grant all on public.contas_receber_vencimentos to service_role;
alter table public.contas_receber_vencimentos enable row level security;
create policy crv_select on public.contas_receber_vencimentos for select to authenticated
  using (public.has_permission(auth.uid(),'caixa','visualizar') or public.has_permission(auth.uid(),'financeiro','visualizar'));

-- 3. Lançamentos: condição e vínculo de liquidação
alter table public.caixa_lancamentos
  add column condicao_recebimento text not null default 'imediato' check (condicao_recebimento in ('imediato','faturado')),
  add column liquida_conta_receber_id uuid references public.contas_receber(id);
create index idx_caixa_lanc_liquida on public.caixa_lancamentos(liquida_conta_receber_id) where liquida_conta_receber_id is not null;

-- 4. Recebimentos de títulos nunca contam como receita/meta (patch em todas as métricas de receita)
do $$
declare f record; d text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.proname in (
              'caixa_agg','caixa_indicadores','comissoes_gerar','custos_indicadores','custos_por_os',
              'descontos_indicadores','dre_gerencial','metas_evolucao','metas_indicadores_periodo',
              'metas_realizado','metas_tecnicos_desempenho','modo_tv_indicadores','rel_origens',
              'relatorios_faturamento','relatorios_planejamento','relatorios_producao',
              'relatorios_rentabilidade','relatorios_snapshot_gerar','relatorios_tecnicos')
  loop
    d := pg_get_functiondef(f.oid);
    d := regexp_replace(d, 'l\.status ?= ?''ativo''', 'l.status = ''ativo'' and l.liquida_conta_receber_id is null', 'g');
    execute d;
  end loop;
end $$;

-- 5. Recebimento do título marca o lançamento como liquidação
create or replace function public.caixa_marcar_liquidacao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.caixa_lancamento_id is not null then
    update public.caixa_lancamentos set liquida_conta_receber_id = new.conta_receber_id
     where id = new.caixa_lancamento_id and liquida_conta_receber_id is null;
  end if;
  return new;
end $$;
revoke all on function public.caixa_marcar_liquidacao() from public, anon, authenticated;
create trigger trg_crr_liquidacao after insert on public.contas_receber_recebimentos
  for each row execute function public.caixa_marcar_liquidacao();

-- 6. Salvar empresa CNPJ (sem duplicar)
create or replace function public.clientes_cnpj_salvar(
  p_razao_social text, p_cnpj text, p_nome_fantasia text default null, p_telefone text default null,
  p_email text default null, p_contato text default null, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cnpj text := regexp_replace(coalesce(p_cnpj,''),'\D','','g'); v_id uuid;
  d int[]; s int; r int; i int;
begin
  if v_uid is null or not (public.has_permission(v_uid,'caixa','criar') or public.has_permission(v_uid,'financeiro','criar')) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para cadastrar empresas.');
  end if;
  if nullif(btrim(coalesce(p_razao_social,'')),'') is null then
    return jsonb_build_object('ok',false,'code','RAZAO_OBRIGATORIA','message','Informe a razão social.');
  end if;
  if length(v_cnpj) <> 14 or v_cnpj ~ '^(\d)\1{13}$' then
    return jsonb_build_object('ok',false,'code','CNPJ_INVALIDO','message','CNPJ inválido.');
  end if;
  d := string_to_array(regexp_replace(v_cnpj,'(\d)','\1,','g'),',')::text[]::int[];
  s := 0; for i in 1..12 loop s := s + d[i] * (array[5,4,3,2,9,8,7,6,5,4,3,2])[i]; end loop;
  r := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if r <> d[13] then return jsonb_build_object('ok',false,'code','CNPJ_INVALIDO','message','CNPJ inválido (dígito verificador).'); end if;
  s := 0; for i in 1..13 loop s := s + d[i] * (array[6,5,4,3,2,9,8,7,6,5,4,3,2])[i]; end loop;
  r := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if r <> d[14] then return jsonb_build_object('ok',false,'code','CNPJ_INVALIDO','message','CNPJ inválido (dígito verificador).'); end if;

  select id into v_id from public.clientes_cnpj where cnpj = v_cnpj;
  if v_id is not null then
    update public.clientes_cnpj set
      razao_social = btrim(p_razao_social),
      nome_fantasia = coalesce(nullif(btrim(coalesce(p_nome_fantasia,'')),''), nome_fantasia),
      telefone = coalesce(nullif(btrim(coalesce(p_telefone,'')),''), telefone),
      email_financeiro = coalesce(nullif(btrim(coalesce(p_email,'')),''), email_financeiro),
      contato = coalesce(nullif(btrim(coalesce(p_contato,'')),''), contato),
      observacao = coalesce(nullif(btrim(coalesce(p_observacao,'')),''), observacao),
      updated_at = now()
    where id = v_id;
    perform public.registrar_auditoria('caixa','cliente_cnpj_atualizar',null,(select to_jsonb(c) from public.clientes_cnpj c where c.id=v_id));
    return jsonb_build_object('ok',true,'id',v_id,'existente',true);
  end if;
  insert into public.clientes_cnpj (razao_social, nome_fantasia, cnpj, telefone, email_financeiro, contato, observacao, created_by)
  values (btrim(p_razao_social), nullif(btrim(coalesce(p_nome_fantasia,'')),''), v_cnpj,
          nullif(btrim(coalesce(p_telefone,'')),''), nullif(btrim(coalesce(p_email,'')),''),
          nullif(btrim(coalesce(p_contato,'')),''), nullif(btrim(coalesce(p_observacao,'')),''), v_uid)
  returning id into v_id;
  perform public.registrar_auditoria('caixa','cliente_cnpj_criar',null,(select to_jsonb(c) from public.clientes_cnpj c where c.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id,'existente',false);
end $$;

-- 7. Registrar venda/serviço faturado com boletos (atômico)
create or replace function public.caixa_registrar_faturado(
  p_data date, p_tipo_receita_id uuid, p_valor_bruto numeric, p_cliente_cnpj_id uuid, p_boletos jsonb,
  p_os text default null, p_descricao text default null, p_tecnico_id uuid default null,
  p_desconto numeric default 0, p_observacao text default null, p_data_emissao date default null,
  p_nota_fiscal text default null, p_responsavel_id uuid default null,
  p_confirmar_duplicidade boolean default false, p_desconto_autorizacao_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cli record; v_forma uuid; v_final numeric(12,2); v_soma numeric(12,2);
  v_res jsonb; v_id uuid; v_b jsonb; v_n int; v_i int := 0; v_resp uuid;
begin
  if v_uid is null or not public.has_permission(v_uid,'caixa','criar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para registrar vendas faturadas.');
  end if;
  select * into v_cli from public.clientes_cnpj where id = p_cliente_cnpj_id and ativo;
  if v_cli.id is null then
    return jsonb_build_object('ok',false,'code','CNPJ_OBRIGATORIO','message','Selecione ou cadastre a empresa (CNPJ).');
  end if;
  select id into v_forma from public.formas_pagamento where nome = 'Boleto' and ativo and not liquidacao_imediata limit 1;
  if v_forma is null then
    return jsonb_build_object('ok',false,'code','FORMA_BOLETO_AUSENTE','message','Forma de pagamento "Boleto" não configurada.');
  end if;
  if p_boletos is null or jsonb_typeof(p_boletos) <> 'array' or jsonb_array_length(p_boletos) = 0 then
    return jsonb_build_object('ok',false,'code','BOLETO_OBRIGATORIO','message','Informe ao menos um boleto.');
  end if;
  v_final := round(coalesce(p_valor_bruto,0),2) - round(coalesce(p_desconto,0),2);
  for v_b in select value from jsonb_array_elements(p_boletos) loop
    if nullif(v_b->>'vencimento','') is null then
      return jsonb_build_object('ok',false,'code','VENCIMENTO_OBRIGATORIO','message','Informe o vencimento de todos os boletos.');
    end if;
    if coalesce((v_b->>'valor')::numeric,0) <= 0 then
      return jsonb_build_object('ok',false,'code','BOLETO_VALOR','message','Todo boleto deve ter valor maior que zero.');
    end if;
    if (v_b->>'vencimento')::date < p_data then
      return jsonb_build_object('ok',false,'code','VENCIMENTO_INVALIDO','message','O vencimento não pode ser anterior à data da venda.');
    end if;
  end loop;
  select coalesce(sum(round((b->>'valor')::numeric,2)),0) into v_soma from jsonb_array_elements(p_boletos) b;
  if v_soma <> v_final then
    return jsonb_build_object('ok',false,'code','SOMA_BOLETOS','message','A soma dos boletos precisa ser igual ao valor faturado.',
      'valor_final',v_final,'total_informado',v_soma,'diferenca',v_final - v_soma);
  end if;
  v_resp := coalesce(p_responsavel_id, v_uid);
  if not exists (select 1 from public.profiles where id = v_resp and active) then
    return jsonb_build_object('ok',false,'code','RESPONSAVEL_INVALIDO','message','Responsável pelo acompanhamento inválido.');
  end if;

  v_res := public.caixa_registrar_lancamento(p_data, p_os, v_cli.razao_social, p_tipo_receita_id, p_descricao,
    p_tecnico_id, p_valor_bruto, p_desconto, p_observacao,
    jsonb_build_array(jsonb_build_object('forma_pagamento_id', v_forma, 'valor', v_final, 'parcelas', 1)),
    p_confirmar_duplicidade, p_desconto_autorizacao_id);
  if not coalesce((v_res->>'ok')::boolean,false) then return v_res; end if;
  v_id := (v_res->>'id')::uuid;

  update public.caixa_lancamentos set condicao_recebimento = 'faturado' where id = v_id;
  -- substitui o título automático pelos boletos informados (mesmo lançamento, mesma transação)
  delete from public.contas_receber where caixa_lancamento_id = v_id
     and not exists (select 1 from public.contas_receber_recebimentos r where r.conta_receber_id = contas_receber.id);
  v_n := jsonb_array_length(p_boletos);
  for v_b in select value from jsonb_array_elements(p_boletos) loop
    v_i := v_i + 1;
    insert into public.contas_receber (cliente, os, descricao, origem, competencia, data_emissao, vencimento,
      valor_original, observacao, responsavel_id, created_by, updated_by, caixa_lancamento_id,
      cliente_cnpj_id, documento, nota_fiscal, parcela_atual, parcela_total, grupo_parcela)
    values (v_cli.razao_social, nullif(btrim(coalesce(p_os,'')),''),
      format('%s — boleto %s/%s', coalesce(nullif(btrim(coalesce(p_os,'')),'') , coalesce(nullif(btrim(coalesce(p_descricao,'')),''),'Venda faturada')), v_i, v_n),
      'caixa', date_trunc('month', p_data)::date, coalesce(p_data_emissao, p_data), (v_b->>'vencimento')::date,
      round((v_b->>'valor')::numeric,2), nullif(btrim(coalesce(v_b->>'observacao','')),''),
      v_resp, v_uid, v_uid, v_id, v_cli.id, nullif(btrim(coalesce(v_b->>'documento','')),''),
      nullif(btrim(coalesce(p_nota_fiscal,'')),''), v_i, v_n, case when v_n > 1 then v_id::text end);
  end loop;
  perform public.registrar_auditoria('caixa','faturado_boleto',null, jsonb_build_object(
    'lancamento_id', v_id, 'empresa', v_cli.razao_social, 'cnpj', v_cli.cnpj, 'os', p_os, 'valor', v_final,
    'data_faturamento', p_data, 'boletos', p_boletos, 'responsavel', v_resp, 'nota_fiscal', p_nota_fiscal));
  return jsonb_build_object('ok',true,'id',v_id,'valor_final',v_final,'boletos',v_n);
end $$;

-- 8. Painel de boletos (status derivado em horário de Manaus)
create or replace function public.cr_boletos_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_hoje date := (now() at time zone 'America/Manaus')::date; v_itens jsonb; v_res jsonb;
begin
  if v_uid is null or not (public.has_permission(v_uid,'caixa','visualizar') or public.has_permission(v_uid,'financeiro','visualizar')) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO');
  end if;
  with base as (
    select c.id, c.cliente, c.os, c.descricao, c.valor_original, c.data_emissao, c.vencimento, c.status::text as status_db,
           c.documento, c.nota_fiscal, c.renegociado, c.parcela_atual, c.parcela_total, c.caixa_lancamento_id,
           c.responsavel_id, pr.full_name as responsavel, cc.cnpj, cc.nome_fantasia, cc.id as cliente_cnpj_id,
           l.grupo_receita::text as grupo_receita, l.data_lancamento as data_faturamento,
           coalesce((select sum(r.valor) from public.contas_receber_recebimentos r where r.conta_receber_id=c.id),0)::numeric(12,2) as recebido,
           (select max(r.data_recebimento) from public.contas_receber_recebimentos r where r.conta_receber_id=c.id) as ultimo_recebimento
      from public.contas_receber c
      left join public.profiles pr on pr.id = c.responsavel_id
      left join public.clientes_cnpj cc on cc.id = c.cliente_cnpj_id
      left join public.caixa_lancamentos l on l.id = c.caixa_lancamento_id
     where c.cliente_cnpj_id is not null or c.origem = 'caixa'
  ), st as (
    select b.*, b.valor_original - b.recebido as saldo, b.vencimento - v_hoje as dias,
      case when b.status_db='cancelado' then 'cancelado'
           when b.status_db='recebido' then 'recebido'
           when b.vencimento < v_hoje then 'vencido'
           when b.vencimento = v_hoje then 'vence_hoje'
           when b.status_db='parcialmente_recebido' then 'parcial'
           when b.renegociado then 'renegociado'
           else 'a_receber' end as status
      from base b
  )
  select coalesce(jsonb_agg(to_jsonb(st) order by (st.status in ('recebido','cancelado')), st.vencimento), '[]'::jsonb),
    jsonb_build_object(
      'a_receber', coalesce(sum(saldo) filter (where status_db in ('pendente','parcialmente_recebido')),0),
      'vence_hoje', coalesce(sum(saldo) filter (where status_db in ('pendente','parcialmente_recebido') and dias = 0),0),
      'vence_7', coalesce(sum(saldo) filter (where status_db in ('pendente','parcialmente_recebido') and dias between 0 and 7),0),
      'vencido', coalesce(sum(saldo) filter (where status_db in ('pendente','parcialmente_recebido') and dias < 0),0),
      'qtd_vencidos', count(*) filter (where status_db in ('pendente','parcialmente_recebido') and dias < 0),
      'recebido_mes', coalesce((select sum(r.valor) from public.contas_receber_recebimentos r
                                join public.contas_receber c2 on c2.id = r.conta_receber_id
                               where date_trunc('month', r.data_recebimento) = date_trunc('month', v_hoje)),0))
    into v_itens, v_res
    from st;
  return jsonb_build_object('ok',true,'hoje',v_hoje,'itens',v_itens,'totais',v_res);
end $$;

-- 9. Alterar vencimento (Gerência/Financeiro), com histórico
create or replace function public.cr_alterar_vencimento(p_conta_id uuid, p_vencimento date, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_c record;
begin
  if v_uid is null or not (public.has_permission(v_uid,'financeiro','editar') or public.has_permission(v_uid,'caixa','administrar')) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Somente a Gerência pode alterar vencimentos.');
  end if;
  if nullif(btrim(coalesce(p_motivo,'')),'') is null then
    return jsonb_build_object('ok',false,'code','MOTIVO_OBRIGATORIO','message','Informe o motivo da alteração.');
  end if;
  select * into v_c from public.contas_receber where id = p_conta_id for update;
  if v_c.id is null then return jsonb_build_object('ok',false,'code','NAO_ENCONTRADA','message','Título não encontrado.'); end if;
  if v_c.status in ('cancelado','recebido') then
    return jsonb_build_object('ok',false,'code','STATUS_INVALIDO','message','Títulos recebidos ou cancelados não podem mudar de vencimento.');
  end if;
  if p_vencimento is null or p_vencimento = v_c.vencimento then
    return jsonb_build_object('ok',false,'code','VENCIMENTO_INVALIDO','message','Informe um novo vencimento.');
  end if;
  insert into public.contas_receber_vencimentos (conta_receber_id, vencimento_anterior, vencimento_novo, motivo, alterado_por)
  values (p_conta_id, v_c.vencimento, p_vencimento, btrim(p_motivo), v_uid);
  update public.contas_receber set vencimento = p_vencimento, renegociado = true, updated_by = v_uid, updated_at = now() where id = p_conta_id;
  perform public.registrar_auditoria('financeiro','conta_receber_vencimento',
    jsonb_build_object('id',p_conta_id,'vencimento',v_c.vencimento),
    jsonb_build_object('id',p_conta_id,'vencimento',p_vencimento,'motivo',btrim(p_motivo)));
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.clientes_cnpj_salvar(text,text,text,text,text,text,text) from public, anon;
revoke all on function public.caixa_registrar_faturado(date,uuid,numeric,uuid,jsonb,text,text,uuid,numeric,text,date,text,uuid,boolean,uuid) from public, anon;
revoke all on function public.cr_boletos_painel() from public, anon;
revoke all on function public.cr_alterar_vencimento(uuid,date,text) from public, anon;
grant execute on function public.clientes_cnpj_salvar(text,text,text,text,text,text,text) to authenticated;
grant execute on function public.caixa_registrar_faturado(date,uuid,numeric,uuid,jsonb,text,text,uuid,numeric,text,date,text,uuid,boolean,uuid) to authenticated;
grant execute on function public.cr_boletos_painel() to authenticated;
grant execute on function public.cr_alterar_vencimento(uuid,date,text) to authenticated;