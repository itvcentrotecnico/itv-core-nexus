grant execute on function public.has_role(uuid, app_role) to authenticated;
grant execute on function public.has_permission(uuid, text, permission_action) to authenticated;
grant execute on function public.caixa_periodo_fechado(date) to authenticated;
grant execute on function public.registrar_auditoria(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.usuarios_basicos() to authenticated;
grant execute on function public.caixa_indicadores(date, date) to authenticated;