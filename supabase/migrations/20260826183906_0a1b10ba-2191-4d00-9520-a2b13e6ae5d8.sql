CREATE UNIQUE INDEX IF NOT EXISTS colaboradores_user_id_uniq ON public.colaboradores (user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_usuarios_listar()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok', true, 'usuarios', coalesce((
    SELECT jsonb_agg(u ORDER BY u->>'full_name') FROM (
      SELECT jsonb_build_object(
        'id', p.id, 'full_name', p.full_name, 'email', p.email, 'avatar_url', p.avatar_url,
        'active', p.active, 'status', p.status, 'status_motivo', p.status_motivo,
        'created_at', p.created_at,
        'last_sign_in_at', au.last_sign_in_at,
        'email_confirmado', au.email_confirmed_at is not null,
        'colaborador_id', c.id,
        'colaborador_nome', c.nome,
        'colaborador_status', c.status,
        'roles', coalesce((select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
        'overrides', coalesce((select count(*) from public.user_permissions up where up.user_id = p.id), 0),
        'modulos', coalesce((select jsonb_agg(distinct m.label) from public.modules m
             where public.has_permission(p.id, m.key, 'visualizar')), '[]'::jsonb)
      ) AS u
      FROM public.profiles p
      LEFT JOIN auth.users au ON au.id = p.id
      LEFT JOIN public.colaboradores c ON c.user_id = p.id
    ) t), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_convite_colaboradores()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok', true, 'colaboradores', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'status', c.status, 'email', c.email,
      'user_id', c.user_id,
      'usuario_nome', p.full_name
    ) ORDER BY c.nome)
    FROM public.colaboradores c
    LEFT JOIN public.profiles p ON p.id = c.user_id
  ), '[]'::jsonb));
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_usuario_provisionar(
  p_user_id uuid,
  p_nome text,
  p_email text,
  p_colaborador_id uuid DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_acao text DEFAULT 'convite_enviado'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_dono uuid;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  END IF;

  IF p_colaborador_id IS NOT NULL THEN
    SELECT user_id INTO v_dono FROM public.colaboradores WHERE id = p_colaborador_id;
    IF v_dono IS NOT NULL AND v_dono <> p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'COLABORADOR_VINCULADO');
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'full_name', p.full_name, 'email', p.email, 'status', p.status,
    'roles', coalesce((select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = p_user_id), '[]'::jsonb),
    'colaborador_id', (select c.id from public.colaboradores c where c.user_id = p_user_id)
  ) INTO v_old FROM public.profiles p WHERE p.id = p_user_id;

  INSERT INTO public.profiles (id, full_name, email, active, status)
  VALUES (p_user_id, coalesce(nullif(btrim(p_nome), ''), p_email), p_email, true, 'ativo')
  ON CONFLICT (id) DO UPDATE
    SET full_name = coalesce(nullif(btrim(p_nome), ''), public.profiles.full_name),
        email = coalesce(p_email, public.profiles.email),
        active = true,
        status = 'ativo',
        status_motivo = NULL,
        updated_at = now();

  IF p_colaborador_id IS NOT NULL THEN
    UPDATE public.colaboradores SET user_id = NULL, updated_at = now()
      WHERE user_id = p_user_id AND id <> p_colaborador_id;
    UPDATE public.colaboradores SET user_id = p_user_id, updated_at = now()
      WHERE id = p_colaborador_id;
  END IF;

  IF p_role IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role::text <> p_role;
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, p_role::app_role)
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin', coalesce(p_acao, 'convite_enviado'), v_old,
          jsonb_build_object('user_id', p_user_id, 'full_name', p_nome, 'email', p_email,
                             'colaborador_id', p_colaborador_id, 'role', p_role));

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_usuario_permissao(
  p_user_id uuid,
  p_module text,
  p_action text,
  p_allowed boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_old boolean;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;

  SELECT allowed INTO v_old FROM public.user_permissions
   WHERE user_id = p_user_id AND module_key = p_module AND action = p_action::permission_action;

  INSERT INTO public.user_permissions (user_id, module_key, action, allowed)
  VALUES (p_user_id, p_module, p_action::permission_action, p_allowed)
  ON CONFLICT (user_id, module_key, action) DO UPDATE SET allowed = excluded.allowed;

  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin', 'alterar_permissao_usuario',
          jsonb_build_object('user_id', p_user_id, 'module', p_module, 'acao', p_action, 'allowed', v_old),
          jsonb_build_object('user_id', p_user_id, 'module', p_module, 'acao', p_action, 'allowed', p_allowed));

  RETURN jsonb_build_object('ok', true);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_usuarios_listar() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_convite_colaboradores() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_usuario_provisionar(uuid, text, text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_usuario_permissao(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_usuarios_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_convite_colaboradores() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usuario_provisionar(uuid, text, text, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_usuario_permissao(uuid, text, text, boolean) TO authenticated;