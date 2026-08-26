do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and p.proname in ('admin_convite_colaboradores','admin_usuario_permissao','admin_usuario_provisionar')
  loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;