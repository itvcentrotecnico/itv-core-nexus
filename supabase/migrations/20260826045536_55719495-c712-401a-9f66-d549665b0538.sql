-- 1. Remover módulos Entregas e Logística (sem tabelas de dados; FK ON DELETE CASCADE limpa role_permissions/user_permissions)
DELETE FROM public.modules WHERE key IN ('entregas', 'logistica');

-- 2. Novo módulo Modo TV
INSERT INTO public.modules (key, label, sort_order)
VALUES ('modo_tv', 'Modo TV', 13)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, module_key, action)
SELECT r, 'modo_tv', a
FROM (VALUES
  ('administrador'::public.app_role, 'visualizar'::public.permission_action),
  ('administrador'::public.app_role, 'configurar'::public.permission_action),
  ('gerente'::public.app_role, 'visualizar'::public.permission_action)
) AS v(r, a)
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions rp WHERE rp.role = v.r AND rp.module_key = 'modo_tv' AND rp.action = v.a
);

-- 3. Configuração do painel (whitelist de toggles — nenhum dado sensível)
INSERT INTO public.settings (key, value)
VALUES ('modo_tv', jsonb_build_object(
  'mostrar_faturamento', true,
  'mostrar_meta', true,
  'mostrar_projecao', true,
  'mostrar_producao', true,
  'mostrar_ranking', true,
  'mostrar_ticket_medio', false,
  'mostrar_marcas', true,
  'mostrar_tipos_servico', true,
  'mostrar_comparacao', true,
  'mostrar_mensagem', false,
  'mensagem_titulo', 'FOCO DA SEMANA',
  'mensagem_texto', '',
  'criterio_destaque', 'producao',
  'rotacao_segundos', 25,
  'refresh_segundos', 60
))
ON CONFLICT (key) DO NOTHING;

-- 4. RPC consolidada do Modo TV (única consulta por ciclo de atualização)
CREATE OR REPLACE FUNCTION public.modo_tv_indicadores(p_ref date DEFAULT (now() AT TIME ZONE 'America/Manaus')::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ini date;
  v_fim date;
  v_dias_total int;
  v_dias_decorridos int;
  v_dias_restantes int;
  v_fat numeric;
  v_liq numeric;
  v_os int;
  v_prev_fat numeric;
  v_prev_ini date;
  v_prev_fim date;
  v_meta record;
  v_realizado numeric;
  v_ritmo_atual numeric;
  v_ritmo_necessario numeric;
  v_projecao numeric;
  v_status text;
  v_sem_ini date;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO');
  END IF;
  IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'modo_tv', 'visualizar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;

  v_ini := date_trunc('month', p_ref)::date;
  v_fim := (v_ini + interval '1 month - 1 day')::date;
  v_dias_total := v_fim - v_ini + 1;
  v_dias_decorridos := p_ref - v_ini + 1;
  v_dias_restantes := greatest(v_fim - p_ref, 0);
  v_sem_ini := date_trunc('week', p_ref)::date;

  -- Faturamento do mês (Caixa Diário, lançamentos ativos)
  SELECT coalesce(sum(l.valor_final), 0), coalesce(sum(l.receita_liquida), 0), count(DISTINCT l.os)
  INTO v_fat, v_liq, v_os
  FROM public.caixa_lancamentos l
  WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN v_ini AND p_ref;

  -- Mesmo período do mês anterior
  v_prev_ini := (v_ini - interval '1 month')::date;
  v_prev_fim := least(v_prev_ini + (v_dias_decorridos - 1), (v_ini - 1));
  SELECT coalesce(sum(l.valor_final), 0) INTO v_prev_fat
  FROM public.caixa_lancamentos l
  WHERE l.status = 'ativo' AND l.data_lancamento BETWEEN v_prev_ini AND v_prev_fim;

  -- Meta principal do período
  SELECT m.id, m.nome, m.tipo, m.valor_alvo, m.data_inicio, m.data_fim
  INTO v_meta
  FROM public.metas_empresa m
  WHERE m.principal AND m.status IN ('planejada', 'ativa')
    AND m.data_inicio <= v_fim AND m.data_fim >= v_ini
  ORDER BY m.data_inicio DESC
  LIMIT 1;

  v_realizado := NULL;
  IF v_meta.id IS NOT NULL THEN
    v_realizado := public.metas_realizado(v_meta.tipo, greatest(v_meta.data_inicio, v_ini), least(v_meta.data_fim, p_ref));
  END IF;

  v_ritmo_atual := round(v_fat / greatest(v_dias_decorridos, 1), 2);
  v_projecao := round(v_ritmo_atual * v_dias_total, 2);
  v_ritmo_necessario := CASE
    WHEN v_meta.valor_alvo IS NOT NULL AND v_dias_restantes > 0
      THEN round(greatest(v_meta.valor_alvo - coalesce(v_realizado, v_fat), 0) / v_dias_restantes, 2)
    ELSE 0
  END;
  v_status := CASE
    WHEN v_meta.valor_alvo IS NULL THEN 'sem_meta'
    WHEN v_projecao >= v_meta.valor_alvo THEN 'acima'
    WHEN v_projecao >= v_meta.valor_alvo * 0.95 THEN 'no_ritmo'
    ELSE 'atencao'
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'referencia', p_ref,
    'mes', jsonb_build_object(
      'inicio', v_ini, 'fim', v_fim,
      'dias_total', v_dias_total, 'dias_decorridos', v_dias_decorridos, 'dias_restantes', v_dias_restantes
    ),
    'faturamento', jsonb_build_object(
      'mes', v_fat,
      'receita_liquida', v_liq,
      'os', v_os,
      'ticket_medio', CASE WHEN v_os > 0 THEN round(v_fat / v_os, 2) ELSE 0 END,
      'mes_anterior_mesmo_periodo', v_prev_fat,
      'evolucao_pct', CASE WHEN v_prev_fat > 0 THEN round((v_fat - v_prev_fat) / v_prev_fat * 100, 1) ELSE NULL END
    ),
    'meta', CASE WHEN v_meta.id IS NULL THEN NULL ELSE jsonb_build_object(
      'nome', v_meta.nome,
      'tipo', v_meta.tipo,
      'valor', v_meta.valor_alvo,
      'realizado', coalesce(v_realizado, 0),
      'percentual', CASE WHEN v_meta.valor_alvo > 0 THEN round(coalesce(v_realizado, 0) / v_meta.valor_alvo * 100, 1) ELSE 0 END,
      'faltante', greatest(v_meta.valor_alvo - coalesce(v_realizado, 0), 0)
    ) END,
    'ritmo', jsonb_build_object(
      'atual', v_ritmo_atual,
      'necessario', v_ritmo_necessario,
      'projecao', v_projecao,
      'status', v_status
    ),
    'producao', jsonb_build_object(
      'hoje', (SELECT count(*) FROM public.producao_tecnica p WHERE p.status = 'validado' AND p.data_execucao = p_ref),
      'semana', (SELECT count(*) FROM public.producao_tecnica p WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_sem_ini AND p_ref),
      'mes', (SELECT count(*) FROM public.producao_tecnica p WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_ini AND p_ref)
    ),
    'tecnicos', (
      SELECT coalesce(jsonb_agg(t ORDER BY t.validados_mes DESC, t.valor_mes DESC), '[]'::jsonb)
      FROM (
        SELECT
          pr.id AS tecnico_id,
          pr.full_name AS tecnico,
          count(p.id) AS validados_mes,
          coalesce(sum(p.valor_servico), 0) AS valor_mes,
          (
            SELECT jsonb_build_object('tipo', mt.tipo_meta, 'valor', mt.valor_meta, 'quantidade', mt.quantidade_meta)
            FROM public.metas_tecnicos mt
            WHERE mt.tecnico_id = pr.id AND mt.ativo AND mt.status = 'ativa'
              AND mt.inicio <= v_fim AND mt.fim >= v_ini
            ORDER BY (mt.tipo_meta = 'faturamento') DESC, mt.inicio DESC
            LIMIT 1
          ) AS meta
        FROM public.producao_tecnica p
        JOIN public.profiles pr ON pr.id = p.tecnico_id
        WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_ini AND p_ref
        GROUP BY pr.id, pr.full_name
      ) t
    ),
    'ranking', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('tecnico', r.tecnico, 'valor', r.valor, 'servicos', r.servicos) ORDER BY r.valor DESC), '[]'::jsonb)
      FROM (
        SELECT pr.full_name AS tecnico, coalesce(sum(p.valor_servico), 0) AS valor, count(*) AS servicos
        FROM public.producao_tecnica p
        JOIN public.profiles pr ON pr.id = p.tecnico_id
        WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_ini AND p_ref
        GROUP BY pr.full_name
        ORDER BY valor DESC
        LIMIT 5
      ) r
    ),
    'tipos_servico', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('tipo', s.tipo, 'quantidade', s.quantidade, 'pct', s.pct) ORDER BY s.quantidade DESC), '[]'::jsonb)
      FROM (
        SELECT coalesce(ts.nome, p.servico_executado) AS tipo,
               count(*) AS quantidade,
               round(count(*) * 100.0 / nullif(sum(count(*)) OVER (), 0), 1) AS pct
        FROM public.producao_tecnica p
        LEFT JOIN public.tipos_servico_tecnico ts ON ts.id = p.tipo_servico_id
        WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_ini AND p_ref
        GROUP BY 1
      ) s
    ),
    'marcas', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('marca', m.marca, 'quantidade', m.quantidade) ORDER BY m.quantidade DESC), '[]'::jsonb)
      FROM (
        SELECT upper(coalesce(nullif(trim(p.marca_tv), ''), 'Não informada')) AS marca, count(*) AS quantidade
        FROM public.producao_tecnica p
        WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_ini AND p_ref
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 8
      ) m
    ),
    'destaque_semana', jsonb_build_object(
      'producao', (
        SELECT jsonb_build_object('tecnico', pr.full_name, 'valor', coalesce(sum(p.valor_servico), 0), 'servicos', count(*))
        FROM public.producao_tecnica p JOIN public.profiles pr ON pr.id = p.tecnico_id
        WHERE p.status = 'validado' AND p.data_execucao BETWEEN v_sem_ini AND p_ref
        GROUP BY pr.full_name ORDER BY 2 DESC LIMIT 1
      ),
      'validacao', (
        SELECT jsonb_build_object('tecnico', x.tecnico, 'indice', x.indice, 'enviados', x.enviados)
        FROM (
          SELECT pr.full_name AS tecnico,
                 count(*) FILTER (WHERE p.status IN ('validado', 'rejeitado')) AS enviados,
                 round(count(*) FILTER (WHERE p.status = 'validado') * 100.0 / nullif(count(*) FILTER (WHERE p.status IN ('validado','rejeitado')), 0), 1) AS indice
          FROM public.producao_tecnica p JOIN public.profiles pr ON pr.id = p.tecnico_id
          WHERE p.data_execucao BETWEEN v_sem_ini AND p_ref
          GROUP BY pr.full_name
          HAVING count(*) FILTER (WHERE p.status IN ('validado', 'rejeitado')) >= 3
          ORDER BY 2 DESC
        ) x LIMIT 1
      )
    ),
    'config', (SELECT s.value FROM public.settings s WHERE s.key = 'modo_tv')
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.modo_tv_indicadores(date) TO authenticated;

-- 5. Salvar configuração do painel (somente configurar; whitelist de chaves, nunca dados sensíveis)
CREATE OR REPLACE FUNCTION public.modo_tv_config_salvar(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_atual jsonb;
  v_novo jsonb;
  v_chaves text[] := ARRAY[
    'mostrar_faturamento', 'mostrar_meta', 'mostrar_projecao', 'mostrar_producao',
    'mostrar_ranking', 'mostrar_ticket_medio', 'mostrar_marcas', 'mostrar_tipos_servico',
    'mostrar_comparacao', 'mostrar_mensagem', 'mensagem_titulo', 'mensagem_texto',
    'criterio_destaque', 'rotacao_segundos', 'refresh_segundos'
  ];
  v_k text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO');
  END IF;
  IF NOT (public.has_role(v_uid, 'administrador') OR public.has_permission(v_uid, 'modo_tv', 'configurar')) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  END IF;

  SELECT s.value INTO v_atual FROM public.settings s WHERE s.key = 'modo_tv' FOR UPDATE;
  v_novo := coalesce(v_atual, '{}'::jsonb);
  FOREACH v_k IN ARRAY v_chaves LOOP
    IF p_config ? v_k THEN
      v_novo := jsonb_set(v_novo, ARRAY[v_k], p_config -> v_k, true);
    END IF;
  END LOOP;

  INSERT INTO public.settings (key, value) VALUES ('modo_tv', v_novo)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  INSERT INTO public.audit_logs (user_id, module_key, action, old_value, new_value)
  VALUES (v_uid, 'modo_tv', 'configurar', v_atual, v_novo);

  RETURN jsonb_build_object('ok', true, 'config', v_novo);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.modo_tv_config_salvar(jsonb) TO authenticated;