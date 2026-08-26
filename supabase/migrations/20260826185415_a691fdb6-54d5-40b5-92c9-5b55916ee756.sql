ALTER TYPE public.app_role RENAME VALUE 'gerente' TO 'adm_financeiro';
ALTER TYPE public.app_role RENAME VALUE 'vendas' TO 'vendedor';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'adm_operacional';