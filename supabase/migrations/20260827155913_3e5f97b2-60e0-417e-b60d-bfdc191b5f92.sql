ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'motorista';
ALTER TYPE public.permission_action ADD VALUE IF NOT EXISTS 'atribuir';
ALTER TYPE public.permission_action ADD VALUE IF NOT EXISTS 'assumir';
ALTER TYPE public.permission_action ADD VALUE IF NOT EXISTS 'concluir';
ALTER TYPE public.permission_action ADD VALUE IF NOT EXISTS 'ver_dados_sensiveis';

INSERT INTO public.modules (key, label, sort_order)
VALUES ('coletas', 'Coletas', 55)
ON CONFLICT (key) DO NOTHING;