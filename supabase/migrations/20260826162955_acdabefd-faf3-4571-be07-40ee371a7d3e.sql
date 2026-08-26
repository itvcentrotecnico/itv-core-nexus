-- 1. STATUS DO USUÁRIO -------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'usuario_status') THEN
    CREATE TYPE public.usuario_status AS ENUM ('ativo', 'inativo', 'bloqueado');
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status public.usuario_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS status_motivo text,
  ADD COLUMN IF NOT EXISTS status_alterado_em timestamptz,
  ADD COLUMN IF NOT EXISTS status_alterado_por uuid REFERENCES public.profiles(id);

UPDATE public.profiles SET status = CASE WHEN active THEN 'ativo' ELSE 'inativo' END::public.usuario_status;

-- Bloqueio efetivo: usuário inativo/bloqueado não obtém nenhum papel nem permissão
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = _user_id and ur.role = _role
      and p.active and p.status = 'ativo'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action permission_action)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select case
    when not exists (select 1 from public.profiles p where p.id = _user_id and p.active and p.status = 'ativo')
      then false
    else
      public.has_role(_user_id, 'administrador')
      or coalesce(
        (select up.allowed from public.user_permissions up
          where up.user_id = _user_id and up.module_key = _module and up.action = _action),
        (select true from public.role_permissions rp
          join public.user_roles ur on ur.role = rp.role and ur.user_id = _user_id
          where rp.module_key = _module and rp.action = _action limit 1),
        false)
  end
$$;

-- 2. CAMPOS DE CADASTRO ------------------------------------------------------
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS especialidade text;
ALTER TABLE public.tipos_servico_tecnico ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE public.formas_pagamento
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'outros',
  ADD COLUMN IF NOT EXISTS permite_parcelamento boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_parcelas integer NOT NULL DEFAULT 1;
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS nome_fantasia text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS categoria text;

-- 3. MÓDULOS ADMINISTRATIVOS -------------------------------------------------
INSERT INTO public.modules (key, label, sort_order) VALUES
  ('admin', 'Administração', 20),
  ('admin_parametros', 'Admin · Parâmetros', 21),
  ('admin_fechamentos', 'Admin · Fechamentos', 22),
  ('admin_backup', 'Admin · Backup e Exportação', 23)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, sort_order = EXCLUDED.sort_order;

-- 4. PARÂMETROS PADRÃO -------------------------------------------------------
INSERT INTO public.settings (key, value) VALUES
  ('financeiro', jsonb_build_object(
     'margem_minima_pct', 30, 'custo_elevado_pct', 50,
     'alerta_vencimento_dias', 7, 'bloquear_periodo_fechado', true,
     'exigir_motivo_reabertura', true)),
  ('identidade', jsonb_build_object(
     'nome_exibicao', 'GESTÃO ITV CENTRO TÉCNICO', 'cor_institucional', '#0F9D58', 'logo_url', ''))
ON CONFLICT (key) DO NOTHING;

UPDATE public.settings SET value = value
  || jsonb_build_object('formato_data', coalesce(value->>'formato_data', 'dd/MM/yyyy'))
  || jsonb_build_object('razao_social', coalesce(value->>'razao_social', 'ITV Centro Técnico'))
WHERE key = 'organization';

-- 5. USUÁRIOS ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_usuarios_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
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
        'roles', coalesce((select jsonb_agg(ur.role::text order by ur.role::text) from public.user_roles ur where ur.user_id = p.id), '[]'::jsonb),
        'overrides', coalesce((select count(*) from public.user_permissions up where up.user_id = p.id), 0),
        'modulos', coalesce((select jsonb_agg(distinct m.label) from public.modules m
             where public.has_permission(p.id, m.key, 'visualizar')), '[]'::jsonb)
      ) AS u
      FROM public.profiles p
      LEFT JOIN auth.users au ON au.id = p.id
    ) t), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_usuario_status(p_user_id uuid, p_status public.usuario_status, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF p_user_id = v_uid AND p_status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTO_DESATIVACAO');
  END IF;
  IF p_status <> 'ativo' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user_id AND role = 'administrador')
     AND (SELECT count(*) FROM public.user_roles ur JOIN public.profiles p ON p.id = ur.user_id
          WHERE ur.role = 'administrador' AND p.status = 'ativo') <= 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ULTIMO_ADMIN');
  END IF;
  SELECT to_jsonb(p) INTO v_old FROM public.profiles p WHERE p.id = p_user_id;
  IF v_old IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); END IF;
  UPDATE public.profiles SET status = p_status, active = (p_status = 'ativo'),
    status_motivo = p_motivo, status_alterado_em = now(), status_alterado_por = v_uid, updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin', 'alterar_status_usuario',
          jsonb_build_object('user_id', p_user_id, 'status', v_old->>'status'),
          jsonb_build_object('user_id', p_user_id, 'status', p_status, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_usuario_perfis(p_user_id uuid, p_roles text[], p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_old text[]; v_r text;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT coalesce(array_agg(role::text ORDER BY role::text), '{}') INTO v_old FROM public.user_roles WHERE user_id = p_user_id;
  IF p_user_id = v_uid AND NOT ('administrador' = ANY(p_roles)) AND ('administrador' = ANY(v_old)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AUTO_REBAIXAMENTO');
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role::text <> ALL(p_roles);
  FOREACH v_r IN ARRAY p_roles LOOP
    INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, v_r::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin', 'alterar_perfil_usuario',
          jsonb_build_object('user_id', p_user_id, 'roles', to_jsonb(v_old)),
          jsonb_build_object('user_id', p_user_id, 'roles', to_jsonb(p_roles), 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_role_permissao(p_role app_role, p_module text, p_action permission_action, p_allowed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF p_role = 'administrador' THEN RETURN jsonb_build_object('ok', false, 'code', 'ADMIN_IMUTAVEL'); END IF;
  IF p_allowed THEN
    INSERT INTO public.role_permissions (role, module_key, action) VALUES (p_role, p_module, p_action)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.role_permissions WHERE role = p_role AND module_key = p_module AND action = p_action;
  END IF;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin', 'alterar_permissao_perfil',
          jsonb_build_object('role', p_role, 'module', p_module, 'action', p_action, 'allowed', NOT p_allowed),
          jsonb_build_object('role', p_role, 'module', p_module, 'action', p_action, 'allowed', p_allowed));
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 6. CADASTROS MESTRES (CRUD GENÉRICO) --------------------------------------
CREATE OR REPLACE FUNCTION public.admin_tabela_permitida(p_tabela text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  select p_tabela = ANY (ARRAY['tipos_servico_tecnico','tipos_receita','formas_pagamento','fornecedores',
    'categorias_pecas','categorias_financeiras','subcategorias_financeiras','centros_custo','setores',
    'cargos','tipos_custo','folha_tipos_lancamento','niveis_desempenho'])
$$;

CREATE OR REPLACE FUNCTION public.admin_cadastro_salvar(p_tabela text, p_dados jsonb, p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_cols text; v_sets text; v_id uuid; v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF NOT public.admin_tabela_permitida(p_tabela) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABELA_INVALIDA');
  END IF;

  SELECT string_agg(quote_ident(c.column_name), ', '),
         string_agg(format('%I = d.%I', c.column_name, c.column_name), ', ')
    INTO v_cols, v_sets
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = p_tabela
    AND c.column_name NOT IN ('id','created_at','updated_at')
    AND p_dados ? c.column_name;

  IF v_cols IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'SEM_CAMPOS'); END IF;

  IF p_id IS NULL THEN
    EXECUTE format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) d returning id',
                   p_tabela, v_cols, v_cols, p_tabela) INTO v_id USING p_dados;
  ELSE
    EXECUTE format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabela) INTO v_old USING p_id;
    IF v_old IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); END IF;
    EXECUTE format('update public.%I t set %s from jsonb_populate_record(null::public.%I, $1) d where t.id = $2 returning t.id',
                   p_tabela, v_sets, p_tabela) INTO v_id USING p_dados, p_id;
  END IF;

  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin_parametros', CASE WHEN p_id IS NULL THEN 'criar' ELSE 'editar' END,
          v_old, jsonb_build_object('tabela', p_tabela, 'id', v_id) || p_dados);
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_cadastro_ativo(p_tabela text, p_id uuid, p_ativo boolean, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF NOT public.admin_tabela_permitida(p_tabela) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TABELA_INVALIDA');
  END IF;
  EXECUTE format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabela) INTO v_old USING p_id;
  IF v_old IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); END IF;
  EXECUTE format('update public.%I set ativo = $1 where id = $2', p_tabela) USING p_ativo, p_id;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin_parametros', CASE WHEN p_ativo THEN 'ativar' ELSE 'desativar' END,
          v_old, jsonb_build_object('tabela', p_tabela, 'id', p_id, 'ativo', p_ativo, 'motivo', p_motivo));
  RETURN jsonb_build_object('ok', true);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_cadastro_dependencias(p_tabela text, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_pares text[][]; v_par text[]; v_total bigint := 0; v_n bigint;
  v_det jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  v_pares := CASE p_tabela
    WHEN 'formas_pagamento' THEN ARRAY[['caixa_pagamentos','forma_pagamento_id'],['contas_pagar_pagamentos','forma_pagamento_id'],['contas_receber_recebimentos','forma_pagamento_id'],['folha_pagamentos','forma_pagamento_id'],['comissao_pagamentos','forma_pagamento_id'],['contas_pagar','forma_pagamento_id'],['despesas','forma_pagamento_id']]
    WHEN 'tipos_receita' THEN ARRAY[['caixa_lancamentos','tipo_receita_id']]
    WHEN 'tipos_servico_tecnico' THEN ARRAY[['producao_tecnica','tipo_servico_id']]
    WHEN 'fornecedores' THEN ARRAY[['custos_os','fornecedor_id'],['despesas','fornecedor_id'],['contas_pagar','fornecedor_id']]
    WHEN 'categorias_pecas' THEN ARRAY[['custos_os','categoria_id']]
    WHEN 'categorias_financeiras' THEN ARRAY[['despesas','categoria_id'],['contas_pagar','categoria_id'],['subcategorias_financeiras','categoria_id']]
    WHEN 'subcategorias_financeiras' THEN ARRAY[['despesas','subcategoria_id'],['contas_pagar','subcategoria_id']]
    WHEN 'centros_custo' THEN ARRAY[['despesas','centro_custo_id'],['contas_pagar','centro_custo_id']]
    WHEN 'tipos_custo' THEN ARRAY[['custos_os','tipo_custo_id']]
    WHEN 'setores' THEN ARRAY[['colaboradores','setor_id'],['cargos','setor_id']]
    WHEN 'cargos' THEN ARRAY[['colaboradores','cargo_id']]
    WHEN 'folha_tipos_lancamento' THEN ARRAY[['folha_lancamentos','tipo_lancamento_id']]
    ELSE ARRAY[]::text[][] END;

  IF v_pares IS NOT NULL THEN
    FOR i IN 1 .. coalesce(array_length(v_pares, 1), 0) LOOP
      v_par := ARRAY[v_pares[i][1], v_pares[i][2]];
      EXECUTE format('select count(*) from public.%I where %I = $1', v_par[1], v_par[2]) INTO v_n USING p_id;
      IF v_n > 0 THEN
        v_total := v_total + v_n;
        v_det := v_det || jsonb_build_object('tabela', v_par[1], 'registros', v_n);
      END IF;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ok', true, 'total', v_total, 'detalhes', v_det);
END; $$;

-- 7. PARÂMETROS GERAIS -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_config_salvar(p_key text, p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  IF p_key NOT IN ('organization','identidade','financeiro','custos','metas','planejamento') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHAVE_INVALIDA');
  END IF;
  SELECT value INTO v_old FROM public.settings WHERE key = p_key;
  INSERT INTO public.settings (key, value) VALUES (p_key, coalesce(v_old,'{}'::jsonb) || p_value)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin_parametros', 'configurar', jsonb_build_object('key', p_key, 'value', v_old),
          jsonb_build_object('key', p_key, 'value', coalesce(v_old,'{}'::jsonb) || p_value));
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 8. FECHAMENTOS -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_fechamentos_painel(p_ano integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ano integer := coalesce(p_ano, extract(year from (now() at time zone 'America/Manaus'))::int);
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_fechamentos','visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok', true, 'ano', v_ano, 'competencias', coalesce((
    SELECT jsonb_agg(x ORDER BY (x->>'competencia')) FROM (
      SELECT jsonb_build_object(
        'competencia', to_char(m.mes, 'YYYY-MM-DD'),
        'caixa_dias_com_lancamento', (select count(distinct l.data_lancamento) from public.caixa_lancamentos l
            where date_trunc('month', l.data_lancamento) = m.mes and l.status <> 'cancelado'),
        'caixa_dias_fechados', (select count(*) from public.caixa_fechamentos f
            where date_trunc('month', f.data_referencia) = m.mes and f.status = 'fechado'),
        'financeiro_pendencias', (select count(*) from public.contas_pagar cp
            where date_trunc('month', cp.vencimento) = m.mes and cp.status in ('pendente','parcialmente_pago'))
          + (select count(*) from public.contas_receber cr
            where date_trunc('month', cr.vencimento) = m.mes and cr.status in ('pendente','parcialmente_recebido')),
        'folha_status', (select fc.status::text from public.folha_competencias fc where fc.competencia = m.mes::date),
        'folha_fechada_em', (select fc.fechada_em from public.folha_competencias fc where fc.competencia = m.mes::date),
        'folha_fechada_por', (select p.full_name from public.folha_competencias fc
            left join public.profiles p on p.id = fc.fechada_por where fc.competencia = m.mes::date)
      ) AS x
      FROM generate_series(make_date(v_ano,1,1), make_date(v_ano,12,1), interval '1 month') m(mes)
    ) t), '[]'::jsonb));
END; $$;

-- 9. AUDITORIA CENTRAL -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_auditoria(
  p_user_id uuid DEFAULT NULL, p_module text DEFAULT NULL, p_action text DEFAULT NULL,
  p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL, p_busca text DEFAULT NULL,
  p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_total bigint;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin-auditoria','visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT count(*) INTO v_total FROM public.audit_logs a
  WHERE (p_user_id IS NULL OR a.user_id = p_user_id)
    AND (p_module IS NULL OR a.module_key = p_module)
    AND (p_action IS NULL OR a.action = p_action)
    AND (p_inicio IS NULL OR (a.created_at at time zone 'America/Manaus')::date >= p_inicio)
    AND (p_fim IS NULL OR (a.created_at at time zone 'America/Manaus')::date <= p_fim)
    AND (p_busca IS NULL OR p_busca = '' OR coalesce(a.old_value::text,'') || coalesce(a.new_value::text,'') ILIKE '%'||p_busca||'%');

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'registros', coalesce((
    SELECT jsonb_agg(x) FROM (
      SELECT jsonb_build_object(
        'id', a.id, 'created_at', a.created_at, 'user_id', a.user_id,
        'usuario', coalesce(p.full_name, 'Sistema'), 'module_key', a.module_key,
        'modulo', coalesce(m.label, a.module_key), 'action', a.action,
        'old_value', a.old_value, 'new_value', a.new_value) AS x
      FROM public.audit_logs a
      LEFT JOIN public.profiles p ON p.id = a.user_id
      LEFT JOIN public.modules m ON m.key = a.module_key
      WHERE (p_user_id IS NULL OR a.user_id = p_user_id)
        AND (p_module IS NULL OR a.module_key = p_module)
        AND (p_action IS NULL OR a.action = p_action)
        AND (p_inicio IS NULL OR (a.created_at at time zone 'America/Manaus')::date >= p_inicio)
        AND (p_fim IS NULL OR (a.created_at at time zone 'America/Manaus')::date <= p_fim)
        AND (p_busca IS NULL OR p_busca = '' OR coalesce(a.old_value::text,'') || coalesce(a.new_value::text,'') ILIKE '%'||p_busca||'%')
      ORDER BY a.created_at DESC
      LIMIT least(coalesce(p_limit,100), 500) OFFSET greatest(coalesce(p_offset,0),0)
    ) t), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_auditoria_filtros()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin-auditoria','visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'acoes', coalesce((select jsonb_agg(distinct a.action) from public.audit_logs a), '[]'::jsonb),
    'modulos', coalesce((select jsonb_agg(distinct a.module_key) from public.audit_logs a where a.module_key is not null), '[]'::jsonb));
END; $$;

-- 10. BACKUP E EXPORTAÇÃO ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_backup_info()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_backup','visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'volumes', jsonb_build_object(
      'caixa_lancamentos', (select count(*) from public.caixa_lancamentos),
      'custos_os', (select count(*) from public.custos_os),
      'comissoes', (select count(*) from public.comissoes),
      'despesas', (select count(*) from public.despesas),
      'contas_pagar', (select count(*) from public.contas_pagar),
      'contas_receber', (select count(*) from public.contas_receber),
      'producao_tecnica', (select count(*) from public.producao_tecnica),
      'colaboradores', (select count(*) from public.colaboradores),
      'audit_logs', (select count(*) from public.audit_logs)),
    'ultima_exportacao', (select max(a.created_at) from public.audit_logs a where a.action = 'exportar'),
    'ultimo_registro', (select max(a.created_at) from public.audit_logs a));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_exportar(p_dataset text, p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_sql text; v_rows jsonb;
  v_ini date := coalesce(p_inicio, date_trunc('month', (now() at time zone 'America/Manaus'))::date);
  v_fim date := coalesce(p_fim, (now() at time zone 'America/Manaus')::date);
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_backup','exportar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  v_sql := CASE p_dataset
    WHEN 'caixa' THEN 'select l.data_lancamento, l.os, l.cliente, tr.nome as tipo_receita, l.descricao, l.valor_bruto, l.desconto, l.valor_final, l.taxas_total, l.receita_liquida, l.status from public.caixa_lancamentos l left join public.tipos_receita tr on tr.id = l.tipo_receita_id where l.data_lancamento between $1 and $2 order by l.data_lancamento'
    WHEN 'custos' THEN 'select c.data_lancamento, c.os, c.descricao, c.quantidade, c.custo_unitario, c.custo_total, c.devolvido_total, c.status from public.custos_os c where c.data_lancamento between $1 and $2 order by c.data_lancamento'
    WHEN 'comissoes' THEN 'select c.data_referencia, c.os, p.full_name as tecnico, c.base_calculo, c.percentual, c.valor_calculado, c.ajuste_total, c.valor_final, c.status from public.comissoes c left join public.profiles p on p.id = c.tecnico_id where c.data_referencia between $1 and $2 order by c.data_referencia'
    WHEN 'despesas' THEN 'select d.data_lancamento, d.competencia, d.descricao, cf.nome as categoria, cc.nome as centro_custo, d.valor, d.status from public.despesas d left join public.categorias_financeiras cf on cf.id = d.categoria_id left join public.centros_custo cc on cc.id = d.centro_custo_id where d.data_lancamento between $1 and $2 order by d.data_lancamento'
    WHEN 'contas_pagar' THEN 'select c.data_emissao, c.vencimento, c.descricao, f.nome as fornecedor, c.valor_original, c.status from public.contas_pagar c left join public.fornecedores f on f.id = c.fornecedor_id where c.vencimento between $1 and $2 order by c.vencimento'
    WHEN 'contas_receber' THEN 'select c.data_emissao, c.vencimento, c.cliente, c.os, c.descricao, c.valor_original, c.status from public.contas_receber c where c.vencimento between $1 and $2 order by c.vencimento'
    WHEN 'producao' THEN 'select pr.data_execucao, pr.os, p.full_name as tecnico, pr.marca_tv, pr.modelo_tv, ts.nome as tipo_servico, pr.servico_executado, pr.valor_servico, pr.status from public.producao_tecnica pr left join public.profiles p on p.id = pr.tecnico_id left join public.tipos_servico_tecnico ts on ts.id = pr.tipo_servico_id where pr.data_execucao between $1 and $2 order by pr.data_execucao'
    WHEN 'colaboradores' THEN 'select c.nome, c.status, c.data_admissao, c.tipo_vinculo, cg.nome as cargo, s.nome as setor, (select cs.valor from public.colaborador_salarios cs where cs.colaborador_id = c.id and cs.fim_vigencia is null order by cs.inicio_vigencia desc limit 1) as salario_vigente from public.colaboradores c left join public.cargos cg on cg.id = c.cargo_id left join public.setores s on s.id = c.setor_id where $1 is not null and $2 is not null order by c.nome'
    WHEN 'auditoria' THEN 'select a.created_at, p.full_name as usuario, a.module_key, a.action, a.old_value::text, a.new_value::text from public.audit_logs a left join public.profiles p on p.id = a.user_id where (a.created_at at time zone ''America/Manaus'')::date between $1 and $2 order by a.created_at desc'
    ELSE NULL END;
  IF v_sql IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'DATASET_INVALIDO'); END IF;

  EXECUTE format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (%s limit 5000) t', v_sql)
    INTO v_rows USING v_ini, v_fim;

  INSERT INTO public.audit_logs (user_id, module_key, action, new_value)
  VALUES (v_uid, 'admin_backup', 'exportar',
          jsonb_build_object('dataset', p_dataset, 'inicio', v_ini, 'fim', v_fim, 'registros', jsonb_array_length(v_rows)));
  RETURN jsonb_build_object('ok', true, 'dataset', p_dataset, 'inicio', v_ini, 'fim', v_fim, 'linhas', v_rows);
END; $$;

-- 11. FAIXAS DE DESEMPENHO ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_niveis_desempenho_salvar(p_niveis jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_old jsonb; v_item jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin_parametros','configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb) INTO v_old FROM public.niveis_desempenho n;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_niveis) LOOP
    IF v_item ? 'id' AND (v_item->>'id') <> '' THEN
      UPDATE public.niveis_desempenho SET
        nome = coalesce(v_item->>'nome', nome),
        percentual_minimo = coalesce((v_item->>'percentual_minimo')::numeric, percentual_minimo),
        percentual_maximo = nullif(v_item->>'percentual_maximo','')::numeric,
        ordem = coalesce((v_item->>'ordem')::int, ordem),
        ativo = coalesce((v_item->>'ativo')::boolean, ativo)
      WHERE id = (v_item->>'id')::uuid;
    ELSE
      INSERT INTO public.niveis_desempenho (nome, percentual_minimo, percentual_maximo, ordem, ativo)
      VALUES (v_item->>'nome', (v_item->>'percentual_minimo')::numeric,
              nullif(v_item->>'percentual_maximo','')::numeric,
              coalesce((v_item->>'ordem')::int, 0), coalesce((v_item->>'ativo')::boolean, true));
    END IF;
  END LOOP;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin_parametros', 'configurar_faixas', v_old, p_niveis);
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 12. TÉCNICOS (VISÃO ADMINISTRATIVA) ---------------------------------------
CREATE OR REPLACE FUNCTION public.admin_tecnicos_listar()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  RETURN jsonb_build_object('ok', true, 'tecnicos', coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'nome') FROM (
      SELECT jsonb_build_object(
        'user_id', p.id, 'nome', p.full_name, 'email', p.email, 'usuario_status', p.status,
        'colaborador_id', c.id, 'colaborador_status', c.status, 'especialidade', c.especialidade,
        'data_admissao', c.data_admissao, 'observacao', c.observacao,
        'servicos', (select count(*) from public.producao_tecnica pt where pt.tecnico_id = p.id),
        'comissoes', (select count(*) from public.comissoes cm where cm.tecnico_id = p.id)
      ) AS x
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'tecnico'
      LEFT JOIN public.colaboradores c ON c.user_id = p.id
    ) t), '[]'::jsonb));
END; $$;

CREATE OR REPLACE FUNCTION public.admin_tecnico_atualizar(p_user_id uuid, p_especialidade text DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_col uuid; v_old jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'administrador') OR public.has_permission(v_uid,'admin','administrar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;
  SELECT id, to_jsonb(c) INTO v_col, v_old FROM public.colaboradores c WHERE c.user_id = p_user_id;
  IF v_col IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'SEM_COLABORADOR'); END IF;
  UPDATE public.colaboradores SET especialidade = p_especialidade, observacao = p_observacao,
    updated_at = now(), updated_by = v_uid WHERE id = v_col;
  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'admin', 'editar_tecnico', v_old,
          jsonb_build_object('colaborador_id', v_col, 'especialidade', p_especialidade, 'observacao', p_observacao));
  RETURN jsonb_build_object('ok', true);
END; $$;

-- 13. PERMISSÕES PADRÃO DA ÁREA ADMINISTRATIVA -------------------------------
INSERT INTO public.role_permissions (role, module_key, action) VALUES
  ('gerente', 'admin', 'visualizar'),
  ('gerente', 'admin_parametros', 'visualizar'),
  ('gerente', 'admin_fechamentos', 'visualizar')
ON CONFLICT DO NOTHING;
