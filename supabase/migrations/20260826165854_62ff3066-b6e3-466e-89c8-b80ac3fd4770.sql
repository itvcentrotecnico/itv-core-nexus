alter function public.normalizar_marca(text) set search_path = public;
revoke all on function public.normalizar_marca(text) from public, anon;
grant execute on function public.normalizar_marca(text) to authenticated, service_role;
revoke all on function public.usuario_ativo(uuid) from public, anon;
grant execute on function public.usuario_ativo(uuid) to authenticated, service_role;