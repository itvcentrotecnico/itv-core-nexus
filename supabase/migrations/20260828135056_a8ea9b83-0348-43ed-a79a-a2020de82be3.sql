
create or replace function public.caixa_agg(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'inicio', p_from,
    'fim', p_to,
    'faturamento', coalesce(sum(l.valor_final), 0),
    'bruto', coalesce(sum(l.valor_bruto), 0),
    'descontos', coalesce(sum(l.desconto), 0),
    'taxas', coalesce(sum(l.taxas_total), 0),
    'liquida', coalesce(sum(l.receita_liquida), 0),
    'quantidade', count(*),
    'ticket', case when count(*) > 0 then round(coalesce(sum(l.valor_final),0) / count(*), 2) else 0 end,
    'os_qtd', count(distinct l.os) filter (where l.os is not null),
    'os_valor', coalesce(sum(l.valor_final) filter (where l.os is not null), 0),
    'ticket_os', case when count(distinct l.os) filter (where l.os is not null) > 0
                      then round(coalesce(sum(l.valor_final) filter (where l.os is not null),0)
                                 / count(distinct l.os) filter (where l.os is not null), 2)
                      else 0 end
  )
  from public.caixa_lancamentos l
  where l.status = 'ativo'
    and l.data_lancamento between p_from and p_to;
$$;

revoke all on function public.caixa_agg(date, date) from public, anon;
grant execute on function public.caixa_agg(date, date) to authenticated;

create or replace function public.caixa_desempenho(p_ref date default null, p_meses integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref date;
  v_meses integer := least(greatest(coalesce(p_meses, 6), 3), 12);
  v_sem_ini date; v_sem_fim date;
  v_sem_ant_ini date; v_sem_ant_fim date;
  v_mes_ini date; v_mes_fim date;
  v_ant_ini date; v_ant_fim date;
  v_mp_fim date;
  v_dias integer;
  v_evolucao jsonb := '[]'::jsonb;
  v_meta jsonb := null;
  v_m public.metas_empresa%rowtype;
  i integer;
  v_ini date; v_fim date;
  v_item jsonb;
begin
  if v_uid is null or not public.has_permission(v_uid, 'caixa', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  v_ref := coalesce(p_ref, (now() at time zone 'America/Manaus')::date);

  -- Semana operacional: segunda a domingo
  v_sem_ini := (date_trunc('week', v_ref::timestamp))::date;
  v_sem_fim := v_sem_ini + 6;
  v_sem_ant_ini := v_sem_ini - 7;
  v_sem_ant_fim := v_sem_ini - 1;

  v_mes_ini := date_trunc('month', v_ref)::date;
  v_mes_fim := (date_trunc('month', v_ref) + interval '1 month - 1 day')::date;
  v_ant_ini := (date_trunc('month', v_ref) - interval '1 month')::date;
  v_ant_fim := (date_trunc('month', v_ref) - interval '1 day')::date;

  -- Mesmo período: mesma quantidade de dias decorridos, limitada ao fim do mês anterior
  v_dias := (v_ref - v_mes_ini);
  v_mp_fim := least(v_ant_ini + v_dias, v_ant_fim);

  for i in reverse (v_meses - 1)..0 loop
    v_ini := (date_trunc('month', v_ref) - make_interval(months => i))::date;
    v_fim := (v_ini + interval '1 month - 1 day')::date;
    v_item := public.caixa_agg(v_ini, least(v_fim, v_ref));
    v_evolucao := v_evolucao || jsonb_build_array(
      v_item || jsonb_build_object('mes', to_char(v_ini, 'YYYY-MM'), 'parcial', v_fim > v_ref)
    );
  end loop;

  select m.* into v_m
    from public.metas_empresa m
   where m.principal
     and m.status in ('planejada','ativa')
     and m.data_inicio <= v_ref and m.data_fim >= v_ref
   order by m.data_inicio desc
   limit 1;
  if v_m.id is not null then
    begin
      v_meta := public.metas_empresa_detalhe(v_m);
    exception when others then
      v_meta := null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'referencia', v_ref,
    'hoje', public.caixa_agg(v_ref, v_ref),
    'semana', public.caixa_agg(v_sem_ini, v_sem_fim),
    'semana_anterior', public.caixa_agg(v_sem_ant_ini, v_sem_ant_fim),
    'mes', public.caixa_agg(v_mes_ini, v_mes_fim),
    'mes_ate_hoje', public.caixa_agg(v_mes_ini, v_ref),
    'mes_anterior', public.caixa_agg(v_ant_ini, v_ant_fim),
    'mes_anterior_mesmo_periodo', public.caixa_agg(v_ant_ini, v_mp_fim),
    'evolucao', v_evolucao,
    'meta', v_meta
  );
end;
$$;

revoke all on function public.caixa_desempenho(date, integer) from public, anon;
grant execute on function public.caixa_desempenho(date, integer) to authenticated;
