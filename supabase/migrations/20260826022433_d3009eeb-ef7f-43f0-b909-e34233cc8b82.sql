do $$
declare
  f record;
begin
  -- RPCs do Financeiro: somente usuários autenticados (cada função valida permissão internamente)
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'despesas_registrar', 'despesas_atualizar', 'despesas_cancelar',
         'contas_pagar_registrar', 'contas_pagar_atualizar', 'contas_pagar_pagar',
         'contas_pagar_estornar_pagamento', 'contas_pagar_cancelar',
         'contas_receber_registrar', 'contas_receber_atualizar', 'contas_receber_receber',
         'contas_receber_estornar_recebimento', 'contas_receber_cancelar',
         'financeiro_indicadores', 'financeiro_fluxo'
       )
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;

  -- Funções de gatilho: ninguém executa diretamente
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('contas_pagar_sync_status', 'contas_receber_sync_status')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;