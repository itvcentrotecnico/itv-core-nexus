-- TV Display enxerga somente o Modo TV
INSERT INTO public.role_permissions (role, module_key, action)
VALUES ('tv_display', 'modo_tv', 'visualizar')
ON CONFLICT (role, module_key, action) DO NOTHING;