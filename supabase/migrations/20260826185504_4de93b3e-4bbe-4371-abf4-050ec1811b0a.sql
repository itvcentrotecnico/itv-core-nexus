-- Redefine a matriz padrão dos perfis (o Administrador tem acesso total por regra própria)
DELETE FROM public.role_permissions WHERE role <> 'administrador';

INSERT INTO public.role_permissions (role, module_key, action)
SELECT r::app_role, m, a::permission_action FROM (VALUES
  -- ADM FINANCEIRO
  ('adm_financeiro','dashboard','visualizar'),
  ('adm_financeiro','dashboard','exportar'),
  ('adm_financeiro','caixa','visualizar'),
  ('adm_financeiro','caixa','criar'),
  ('adm_financeiro','caixa','editar'),
  ('adm_financeiro','caixa','cancelar'),
  ('adm_financeiro','caixa','fechar'),
  ('adm_financeiro','caixa','exportar'),
  ('adm_financeiro','pecas','visualizar'),
  ('adm_financeiro','pecas','exportar'),
  ('adm_financeiro','comissoes','visualizar'),
  ('adm_financeiro','comissoes','aprovar'),
  ('adm_financeiro','comissoes','pagar'),
  ('adm_financeiro','comissoes','exportar'),
  ('adm_financeiro','comissao_entrega','visualizar'),
  ('adm_financeiro','comissao_entrega','validar'),
  ('adm_financeiro','comissao_entrega','pagar'),
  ('adm_financeiro','comissao_entrega','exportar'),
  ('adm_financeiro','financeiro','visualizar'),
  ('adm_financeiro','financeiro','criar'),
  ('adm_financeiro','financeiro','editar'),
  ('adm_financeiro','financeiro','pagar'),
  ('adm_financeiro','financeiro','receber'),
  ('adm_financeiro','financeiro','cancelar'),
  ('adm_financeiro','financeiro','estornar'),
  ('adm_financeiro','financeiro','exportar'),
  ('adm_financeiro','folha','visualizar'),
  ('adm_financeiro','folha','criar'),
  ('adm_financeiro','folha','editar'),
  ('adm_financeiro','folha','aprovar'),
  ('adm_financeiro','folha','pagar'),
  ('adm_financeiro','folha','exportar'),
  ('adm_financeiro','colaboradores','visualizar'),
  ('adm_financeiro','metas','visualizar'),
  ('adm_financeiro','modo_tv','visualizar'),
  ('adm_financeiro','relatorios','visualizar'),
  ('adm_financeiro','relatorios','exportar'),
  ('adm_financeiro','relatorios_faturamento','visualizar'),
  ('adm_financeiro','relatorios_financeiro','visualizar'),
  ('adm_financeiro','relatorios_rentabilidade','visualizar'),
  ('adm_financeiro','relatorios_planejamento','visualizar'),
  ('adm_financeiro','admin_fechamentos','visualizar'),

  -- ADM OPERACIONAL
  ('adm_operacional','dashboard','visualizar'),
  ('adm_operacional','producao','visualizar'),
  ('adm_operacional','producao','visualizar_todos'),
  ('adm_operacional','producao','criar'),
  ('adm_operacional','producao','editar'),
  ('adm_operacional','producao','validar'),
  ('adm_operacional','producao','rejeitar'),
  ('adm_operacional','producao','cancelar'),
  ('adm_operacional','producao','exportar'),
  ('adm_operacional','tecnicos','visualizar'),
  ('adm_operacional','tecnicos','relatorios'),
  ('adm_operacional','tecnicos','exportar'),
  ('adm_operacional','metas','visualizar'),
  ('adm_operacional','metas','criar'),
  ('adm_operacional','metas','editar'),
  ('adm_operacional','metas','encerrar'),
  ('adm_operacional','metas','configurar_metas'),
  ('adm_operacional','metas','visualizar_ranking'),
  ('adm_operacional','comissao_entrega','visualizar'),
  ('adm_operacional','modo_tv','visualizar'),
  ('adm_operacional','relatorios','visualizar'),
  ('adm_operacional','relatorios','exportar'),
  ('adm_operacional','relatorios_producao','visualizar'),
  ('adm_operacional','relatorios_tecnicos','visualizar'),

  -- VENDEDOR
  ('vendedor','dashboard','visualizar'),
  ('vendedor','caixa','visualizar'),
  ('vendedor','caixa','criar'),
  ('vendedor','caixa','editar'),
  ('vendedor','caixa','exportar'),
  ('vendedor','comissao_entrega','visualizar'),
  ('vendedor','comissao_entrega','criar'),

  -- TECNICO
  ('tecnico','dashboard','visualizar'),
  ('tecnico','producao','visualizar_propria'),
  ('tecnico','producao','criar'),
  ('tecnico','producao','editar_propria'),
  ('tecnico','producao','enviar_validacao'),
  ('tecnico','comissoes','visualizar_propria'),
  ('tecnico','metas','visualizar'),

  -- TV DISPLAY
  ('tv_display','modo_tv','visualizar')
) AS t(r, m, a)
WHERE EXISTS (SELECT 1 FROM public.modules mo WHERE mo.key = t.m)
ON CONFLICT DO NOTHING;

-- Ajusta função que ainda usava o nome antigo do perfil
CREATE OR REPLACE FUNCTION public.usuarios_basicos()
 RETURNS TABLE(id uuid, full_name text, email text, roles text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.full_name,
         case
           when public.has_role(auth.uid(), 'administrador')
             or public.has_role(auth.uid(), 'adm_financeiro')
             or public.has_role(auth.uid(), 'adm_operacional') then p.email
           else null
         end as email,
         coalesce(array_agg(ur.role::text) filter (where ur.role is not null), '{}'::text[]) as roles
  from public.profiles p
  left join public.user_roles ur on ur.user_id = p.id
  where p.active
    and p.status = 'ativo'
    and public.usuario_ativo(auth.uid())
  group by p.id, p.full_name, p.email
  order by p.full_name
$function$;