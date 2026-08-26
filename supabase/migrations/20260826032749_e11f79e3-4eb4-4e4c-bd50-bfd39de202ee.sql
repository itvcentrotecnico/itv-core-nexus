-- =====================================================
-- PROMPT 8 — ÁREA DOS TÉCNICOS, PRODUÇÃO E DESEMPENHO
-- Produção técnica registrada pelo técnico, validada pela gerência.
-- Nenhum gatilho financeiro automático.
-- =====================================================

-- 1) Status do registro de produção
CREATE TYPE public.producao_status AS ENUM (
  'rascunho', 'enviado_validacao', 'validado', 'rejeitado', 'correcao_solicitada', 'cancelado'
);

-- 2) Tipos de serviço técnico
CREATE TABLE public.tipos_servico_tecnico (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.tipos_servico_tecnico TO authenticated;
GRANT ALL ON public.tipos_servico_tecnico TO service_role;
ALTER TABLE public.tipos_servico_tecnico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem tipos de servico" ON public.tipos_servico_tecnico
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Configuracao gerencia tipos de servico" ON public.tipos_servico_tecnico
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_permission(auth.uid(), 'producao', 'configurar_metas'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_permission(auth.uid(), 'producao', 'configurar_metas'));

INSERT INTO public.tipos_servico_tecnico (nome, ordem) VALUES
  ('Troca de Tela', 1),
  ('Reparo de Placa Principal', 2),
  ('Reparo de Placa Fonte', 3),
  ('Troca de Barramento de LED', 4),
  ('Reparo de Placa T-CON', 5),
  ('Limpeza Técnica', 6),
  ('Solda BGA', 7),
  ('Reparo de Áudio', 8),
  ('Reparo de Conectores', 9),
  ('Atualização de Firmware', 10),
  ('Recuperação de Sistema', 11),
  ('Manutenção Preventiva', 12),
  ('Manutenção Corretiva', 13),
  ('Outros', 99);

-- 3) Registros de produção técnica
CREATE TABLE public.producao_tecnica (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id),
  os text not null,
  data_execucao date not null default (timezone('America/Manaus', now()))::date,
  cliente text,
  marca_tv text,
  modelo_tv text,
  polegadas integer,
  defeito_relatado text,
  diagnostico text,
  tipo_servico_id uuid references public.tipos_servico_tecnico(id),
  servico_executado text not null,
  valor_servico numeric(12,2),
  valor_mao_obra numeric(12,2),
  pecas_descricao text,
  observacao text,
  status public.producao_status not null default 'rascunho',
  enviado_em timestamptz,
  validado_por uuid references public.profiles(id),
  validado_em timestamptz,
  motivo_rejeicao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX idx_producao_tecnico_data ON public.producao_tecnica (tecnico_id, data_execucao);
CREATE INDEX idx_producao_status ON public.producao_tecnica (status);
GRANT SELECT ON public.producao_tecnica TO authenticated;
GRANT ALL ON public.producao_tecnica TO service_role;
ALTER TABLE public.producao_tecnica ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tecnico ve propria producao" ON public.producao_tecnica
  FOR SELECT TO authenticated
  USING (
    tecnico_id = auth.uid()
    OR public.has_role(auth.uid(), 'administrador')
    OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
    OR public.has_permission(auth.uid(), 'producao', 'validar')
  );
-- Escrita somente via RPCs (security definer): sem políticas de INSERT/UPDATE/DELETE.

CREATE TRIGGER update_producao_tecnica_updated_at BEFORE UPDATE ON public.producao_tecnica
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Fotos do registro (paths no bucket 'producao')
CREATE TABLE public.producao_fotos (
  id uuid primary key default gen_random_uuid(),
  producao_id uuid not null references public.producao_tecnica(id) on delete cascade,
  storage_path text not null,
  tipo text not null default 'geral',
  descricao text,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
CREATE INDEX idx_producao_fotos_registro ON public.producao_fotos (producao_id);
GRANT SELECT, INSERT, DELETE ON public.producao_fotos TO authenticated;
GRANT ALL ON public.producao_fotos TO service_role;
ALTER TABLE public.producao_fotos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Fotos visiveis com o registro" ON public.producao_fotos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.producao_tecnica p
    WHERE p.id = producao_id AND (
      p.tecnico_id = auth.uid()
      OR public.has_role(auth.uid(), 'administrador')
      OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
      OR public.has_permission(auth.uid(), 'producao', 'validar')
    )
  ));
CREATE POLICY "Dono anexa fotos em rascunho ou correcao" ON public.producao_fotos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.producao_tecnica p
    WHERE p.id = producao_id
      AND p.tecnico_id = auth.uid()
      AND p.status IN ('rascunho', 'correcao_solicitada')
  ));
CREATE POLICY "Dono remove fotos em rascunho ou correcao" ON public.producao_fotos
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.producao_tecnica p
    WHERE p.id = producao_id
      AND p.tecnico_id = auth.uid()
      AND p.status IN ('rascunho', 'correcao_solicitada')
  ));

-- 5) Histórico de validações (auditável)
CREATE TABLE public.producao_validacoes (
  id uuid primary key default gen_random_uuid(),
  producao_id uuid not null references public.producao_tecnica(id) on delete cascade,
  acao text not null,
  comentario text,
  usuario_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
CREATE INDEX idx_producao_validacoes_registro ON public.producao_validacoes (producao_id);
GRANT SELECT ON public.producao_validacoes TO authenticated;
GRANT ALL ON public.producao_validacoes TO service_role;
ALTER TABLE public.producao_validacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Historico visivel com o registro" ON public.producao_validacoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.producao_tecnica p
    WHERE p.id = producao_id AND (
      p.tecnico_id = auth.uid()
      OR public.has_role(auth.uid(), 'administrador')
      OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
      OR public.has_permission(auth.uid(), 'producao', 'validar')
    )
  ));

-- 6) Metas técnicas
CREATE TABLE public.metas_tecnicos (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references public.profiles(id),
  tipo_meta text not null check (tipo_meta in ('valor', 'quantidade', 'combinada')),
  periodo_tipo text not null check (periodo_tipo in ('semanal', 'mensal', 'personalizado')),
  inicio date not null,
  fim date not null,
  valor_meta numeric(12,2),
  quantidade_meta integer,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (fim >= inicio)
);
CREATE INDEX idx_metas_tecnicos_tecnico ON public.metas_tecnicos (tecnico_id, inicio, fim);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_tecnicos TO authenticated;
GRANT ALL ON public.metas_tecnicos TO service_role;
ALTER TABLE public.metas_tecnicos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tecnico ve propria meta" ON public.metas_tecnicos
  FOR SELECT TO authenticated
  USING (
    tecnico_id = auth.uid()
    OR public.has_role(auth.uid(), 'administrador')
    OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
    OR public.has_permission(auth.uid(), 'producao', 'validar')
  );
CREATE POLICY "Configuracao gerencia metas" ON public.metas_tecnicos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_permission(auth.uid(), 'producao', 'configurar_metas'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_permission(auth.uid(), 'producao', 'configurar_metas'));

-- 7) Níveis de desempenho configuráveis
CREATE TABLE public.niveis_desempenho (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  percentual_minimo numeric(6,2) not null default 0,
  percentual_maximo numeric(6,2),
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
GRANT SELECT ON public.niveis_desempenho TO authenticated;
GRANT ALL ON public.niveis_desempenho TO service_role;
ALTER TABLE public.niveis_desempenho ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Autenticados leem niveis" ON public.niveis_desempenho
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Configuracao gerencia niveis" ON public.niveis_desempenho
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_permission(auth.uid(), 'producao', 'configurar_metas'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_permission(auth.uid(), 'producao', 'configurar_metas'));

INSERT INTO public.niveis_desempenho (nome, percentual_minimo, percentual_maximo, ordem) VALUES
  ('Abaixo do Esperado', 0, 69.99, 1),
  ('Em Desenvolvimento', 70, 89.99, 2),
  ('Meta Atingida', 90, 109.99, 3),
  ('Alto Desempenho', 110, NULL, 4);

-- 8) Políticas do bucket de fotos 'producao'
-- Path relativo ao bucket: {tecnico_id}/{ano}/{mes}/{producao_id}/{arquivo}
CREATE POLICY "Tecnico envia fotos na propria pasta" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'producao'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (public.has_permission(auth.uid(), 'producao', 'criar') OR public.has_role(auth.uid(), 'administrador'))
  );
CREATE POLICY "Leitura de fotos da producao" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'producao'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_role(auth.uid(), 'administrador')
      OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
      OR public.has_permission(auth.uid(), 'producao', 'validar')
    )
  );
CREATE POLICY "Tecnico remove fotos da propria pasta" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'producao' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 9) Permissões por perfil (ADM tem acesso total via has_role nas RPCs)
INSERT INTO public.role_permissions (role, module_key, action) VALUES
  ('tecnico', 'producao', 'visualizar'),
  ('tecnico', 'producao', 'visualizar_propria'),
  ('tecnico', 'producao', 'criar'),
  ('tecnico', 'producao', 'editar_propria'),
  ('tecnico', 'producao', 'enviar_validacao'),
  ('tecnico', 'producao', 'relatorios'),
  ('gerente', 'producao', 'visualizar'),
  ('gerente', 'producao', 'visualizar_propria'),
  ('gerente', 'producao', 'criar'),
  ('gerente', 'producao', 'editar_propria'),
  ('gerente', 'producao', 'enviar_validacao'),
  ('gerente', 'producao', 'validar'),
  ('gerente', 'producao', 'rejeitar'),
  ('gerente', 'producao', 'visualizar_todos'),
  ('gerente', 'producao', 'relatorios'),
  ('gerente', 'tecnicos', 'visualizar')
ON CONFLICT DO NOTHING;

-- 10) Registrar produção
CREATE OR REPLACE FUNCTION public.producao_registrar(
  p_os text,
  p_data_execucao date,
  p_cliente text,
  p_marca_tv text,
  p_modelo_tv text,
  p_polegadas integer,
  p_defeito_relatado text,
  p_diagnostico text,
  p_tipo_servico_id uuid,
  p_servico_executado text,
  p_valor_servico numeric,
  p_valor_mao_obra numeric,
  p_pecas_descricao text,
  p_observacao text,
  p_enviar boolean DEFAULT false,
  p_confirmar_duplicidade boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_status public.producao_status;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'producao', 'criar') OR public.has_role(auth.uid(), 'administrador')) THEN
    RAISE EXCEPTION 'Sem permissão para registrar produção.';
  END IF;
  IF btrim(coalesce(p_os, '')) = '' THEN RAISE EXCEPTION 'Informe a OS.'; END IF;
  IF btrim(coalesce(p_servico_executado, '')) = '' THEN RAISE EXCEPTION 'Informe o serviço executado.'; END IF;
  IF p_data_execucao > (timezone('America/Manaus', now()))::date THEN
    RAISE EXCEPTION 'Data de execução não pode ser futura.';
  END IF;

  IF NOT p_confirmar_duplicidade AND EXISTS (
    SELECT 1 FROM public.producao_tecnica
    WHERE tecnico_id = auth.uid() AND upper(os) = upper(btrim(p_os)) AND status <> 'cancelado'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DUPLICIDADE',
      'message', 'Já existe um registro seu para esta OS. Confirme se deseja registrar mesmo assim.');
  END IF;

  v_status := CASE WHEN p_enviar THEN 'enviado_validacao'::public.producao_status ELSE 'rascunho'::public.producao_status END;

  INSERT INTO public.producao_tecnica (
    tecnico_id, os, data_execucao, cliente, marca_tv, modelo_tv, polegadas,
    defeito_relatado, diagnostico, tipo_servico_id, servico_executado,
    valor_servico, valor_mao_obra, pecas_descricao, observacao, status, enviado_em
  ) VALUES (
    auth.uid(), btrim(p_os), p_data_execucao, nullif(btrim(p_cliente), ''), nullif(btrim(p_marca_tv), ''),
    nullif(btrim(p_modelo_tv), ''), p_polegadas, nullif(btrim(p_defeito_relatado), ''),
    nullif(btrim(p_diagnostico), ''), p_tipo_servico_id, btrim(p_servico_executado),
    p_valor_servico, p_valor_mao_obra, nullif(btrim(p_pecas_descricao), ''), nullif(btrim(p_observacao), ''),
    v_status, CASE WHEN p_enviar THEN now() ELSE NULL END
  ) RETURNING id INTO v_id;

  IF p_enviar THEN
    INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
    VALUES (v_id, 'enviado', 'Registro enviado para validação gerencial.', auth.uid());
  END IF;

  PERFORM public.registrar_auditoria('producao', 'registrar', NULL,
    jsonb_build_object('id', v_id, 'os', btrim(p_os), 'status', v_status));

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'status', v_status);
END $$;

-- 11) Atualizar rascunho / correção solicitada
CREATE OR REPLACE FUNCTION public.producao_atualizar(
  p_id uuid,
  p_data_execucao date,
  p_cliente text,
  p_marca_tv text,
  p_modelo_tv text,
  p_polegadas integer,
  p_defeito_relatado text,
  p_diagnostico text,
  p_tipo_servico_id uuid,
  p_servico_executado text,
  p_valor_servico numeric,
  p_valor_mao_obra numeric,
  p_pecas_descricao text,
  p_observacao text,
  p_enviar boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.producao_tecnica%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.producao_tecnica WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  IF v.tecnico_id <> auth.uid() THEN RAISE EXCEPTION 'Somente o técnico responsável pode editar este registro.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'producao', 'editar_propria') THEN
    RAISE EXCEPTION 'Sem permissão para editar produção.';
  END IF;
  IF v.status NOT IN ('rascunho', 'correcao_solicitada') THEN
    RAISE EXCEPTION 'Somente rascunhos ou registros com correção solicitada podem ser editados.';
  END IF;
  IF btrim(coalesce(p_servico_executado, '')) = '' THEN RAISE EXCEPTION 'Informe o serviço executado.'; END IF;
  IF p_data_execucao > (timezone('America/Manaus', now()))::date THEN
    RAISE EXCEPTION 'Data de execução não pode ser futura.';
  END IF;

  UPDATE public.producao_tecnica SET
    data_execucao = p_data_execucao,
    cliente = nullif(btrim(p_cliente), ''),
    marca_tv = nullif(btrim(p_marca_tv), ''),
    modelo_tv = nullif(btrim(p_modelo_tv), ''),
    polegadas = p_polegadas,
    defeito_relatado = nullif(btrim(p_defeito_relatado), ''),
    diagnostico = nullif(btrim(p_diagnostico), ''),
    tipo_servico_id = p_tipo_servico_id,
    servico_executado = btrim(p_servico_executado),
    valor_servico = p_valor_servico,
    valor_mao_obra = p_valor_mao_obra,
    pecas_descricao = nullif(btrim(p_pecas_descricao), ''),
    observacao = nullif(btrim(p_observacao), ''),
    status = CASE WHEN p_enviar THEN 'enviado_validacao'::public.producao_status ELSE status END,
    enviado_em = CASE WHEN p_enviar THEN now() ELSE enviado_em END
  WHERE id = p_id;

  IF p_enviar THEN
    INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
    VALUES (p_id, 'enviado', 'Registro enviado para validação gerencial.', auth.uid());
  END IF;

  PERFORM public.registrar_auditoria('producao', 'atualizar', NULL,
    jsonb_build_object('id', p_id, 'enviado', p_enviar));

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END $$;

-- 12) Enviar para validação
CREATE OR REPLACE FUNCTION public.producao_enviar(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.producao_tecnica%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.producao_tecnica WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  IF v.tecnico_id <> auth.uid() THEN RAISE EXCEPTION 'Somente o técnico responsável pode enviar este registro.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'producao', 'enviar_validacao') THEN
    RAISE EXCEPTION 'Sem permissão para enviar para validação.';
  END IF;
  IF v.status NOT IN ('rascunho', 'correcao_solicitada') THEN
    RAISE EXCEPTION 'Este registro não pode ser enviado no status atual.';
  END IF;

  UPDATE public.producao_tecnica SET status = 'enviado_validacao', enviado_em = now() WHERE id = p_id;
  INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
  VALUES (p_id, 'enviado', 'Registro enviado para validação gerencial.', auth.uid());
  PERFORM public.registrar_auditoria('producao', 'enviar_validacao', NULL, jsonb_build_object('id', p_id));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 13) Validar (gerência)
CREATE OR REPLACE FUNCTION public.producao_validar(p_id uuid, p_observacao text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.producao_tecnica%ROWTYPE;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'producao', 'validar') OR public.has_role(auth.uid(), 'administrador')) THEN
    RAISE EXCEPTION 'Sem permissão para validar produção.';
  END IF;
  SELECT * INTO v FROM public.producao_tecnica WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  IF v.status <> 'enviado_validacao' THEN RAISE EXCEPTION 'Somente registros enviados podem ser validados.'; END IF;

  UPDATE public.producao_tecnica
  SET status = 'validado', validado_por = auth.uid(), validado_em = now()
  WHERE id = p_id;
  INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
  VALUES (p_id, 'validado', nullif(btrim(p_observacao), ''), auth.uid());
  PERFORM public.registrar_auditoria('producao', 'validar', NULL,
    jsonb_build_object('id', p_id, 'tecnico_id', v.tecnico_id, 'os', v.os));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 14) Solicitar correção (gerência)
CREATE OR REPLACE FUNCTION public.producao_solicitar_correcao(p_id uuid, p_comentario text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.producao_tecnica%ROWTYPE;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'producao', 'validar') OR public.has_role(auth.uid(), 'administrador')) THEN
    RAISE EXCEPTION 'Sem permissão para solicitar correção.';
  END IF;
  IF btrim(coalesce(p_comentario, '')) = '' THEN RAISE EXCEPTION 'Informe o comentário da correção.'; END IF;
  SELECT * INTO v FROM public.producao_tecnica WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  IF v.status <> 'enviado_validacao' THEN RAISE EXCEPTION 'Somente registros enviados podem receber solicitação de correção.'; END IF;

  UPDATE public.producao_tecnica SET status = 'correcao_solicitada' WHERE id = p_id;
  INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
  VALUES (p_id, 'correcao_solicitada', btrim(p_comentario), auth.uid());
  PERFORM public.registrar_auditoria('producao', 'solicitar_correcao', NULL,
    jsonb_build_object('id', p_id, 'comentario', btrim(p_comentario)));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 15) Rejeitar (gerência)
CREATE OR REPLACE FUNCTION public.producao_rejeitar(p_id uuid, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.producao_tecnica%ROWTYPE;
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'producao', 'rejeitar') OR public.has_role(auth.uid(), 'administrador')) THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar produção.';
  END IF;
  IF btrim(coalesce(p_motivo, '')) = '' THEN RAISE EXCEPTION 'Informe o motivo da rejeição.'; END IF;
  SELECT * INTO v FROM public.producao_tecnica WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  IF v.status NOT IN ('enviado_validacao', 'correcao_solicitada') THEN
    RAISE EXCEPTION 'Este registro não pode ser rejeitado no status atual.';
  END IF;

  UPDATE public.producao_tecnica SET status = 'rejeitado', motivo_rejeicao = btrim(p_motivo) WHERE id = p_id;
  INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
  VALUES (p_id, 'rejeitado', btrim(p_motivo), auth.uid());
  PERFORM public.registrar_auditoria('producao', 'rejeitar', NULL,
    jsonb_build_object('id', p_id, 'motivo', btrim(p_motivo)));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 16) Cancelar registro (dono em status aberto, ou ADM)
CREATE OR REPLACE FUNCTION public.producao_cancelar(p_id uuid, p_motivo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.producao_tecnica%ROWTYPE;
BEGIN
  IF btrim(coalesce(p_motivo, '')) = '' THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  SELECT * INTO v FROM public.producao_tecnica WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  IF NOT (
    (v.tecnico_id = auth.uid() AND v.status IN ('rascunho', 'enviado_validacao', 'correcao_solicitada'))
    OR public.has_role(auth.uid(), 'administrador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para cancelar este registro.';
  END IF;

  UPDATE public.producao_tecnica SET status = 'cancelado' WHERE id = p_id;
  INSERT INTO public.producao_validacoes (producao_id, acao, comentario, usuario_id)
  VALUES (p_id, 'cancelado', btrim(p_motivo), auth.uid());
  PERFORM public.registrar_auditoria('producao', 'cancelar', NULL,
    jsonb_build_object('id', p_id, 'motivo', btrim(p_motivo)));
  RETURN jsonb_build_object('ok', true);
END $$;

-- 17) Indicadores do técnico autenticado (meta, projeção, nível)
CREATE OR REPLACE FUNCTION public.producao_meus_indicadores(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_meta public.metas_tecnicos%ROWTYPE;
  v_tem_meta boolean := false;
  v_realizado_valor numeric(12,2);
  v_realizado_qtd integer;
  v_percentual numeric(8,2);
  v_projecao numeric(12,2);
  v_nivel text;
  v_dias_totais integer;
  v_dias_decorridos integer;
  v_hoje date := (timezone('America/Manaus', now()))::date;
BEGIN
  SELECT m.* INTO v_meta FROM public.metas_tecnicos m
  WHERE m.tecnico_id = auth.uid() AND m.ativo AND m.inicio <= p_to AND m.fim >= p_from
  ORDER BY m.inicio DESC LIMIT 1;
  v_tem_meta := v_meta.id IS NOT NULL;

  SELECT coalesce(sum(valor_servico) FILTER (WHERE status = 'validado'), 0),
         count(*) FILTER (WHERE status = 'validado')
  INTO v_realizado_valor, v_realizado_qtd
  FROM public.producao_tecnica
  WHERE tecnico_id = auth.uid()
    AND (NOT v_tem_meta OR (data_execucao BETWEEN v_meta.inicio AND v_meta.fim));

  v_percentual := NULL;
  v_projecao := NULL;
  v_nivel := NULL;
  IF v_tem_meta THEN
    IF v_meta.tipo_meta = 'valor' AND coalesce(v_meta.valor_meta, 0) > 0 THEN
      v_percentual := round(v_realizado_valor / v_meta.valor_meta * 100, 1);
    ELSIF v_meta.tipo_meta = 'quantidade' AND coalesce(v_meta.quantidade_meta, 0) > 0 THEN
      v_percentual := round(v_realizado_qtd::numeric / v_meta.quantidade_meta * 100, 1);
    ELSIF v_meta.tipo_meta = 'combinada' AND coalesce(v_meta.valor_meta, 0) > 0 AND coalesce(v_meta.quantidade_meta, 0) > 0 THEN
      v_percentual := round(((v_realizado_valor / v_meta.valor_meta) + (v_realizado_qtd::numeric / v_meta.quantidade_meta)) / 2 * 100, 1);
    END IF;

    v_dias_totais := greatest(v_meta.fim - v_meta.inicio + 1, 1);
    v_dias_decorridos := greatest(least(v_hoje, v_meta.fim) - v_meta.inicio + 1, 1);
    IF v_meta.tipo_meta IN ('valor', 'combinada') THEN
      v_projecao := round(v_realizado_valor / v_dias_decorridos * v_dias_totais, 2);
    ELSE
      v_projecao := round(v_realizado_qtd::numeric / v_dias_decorridos * v_dias_totais, 2);
    END IF;

    IF v_percentual IS NOT NULL THEN
      SELECT n.nome INTO v_nivel FROM public.niveis_desempenho n
      WHERE n.ativo
        AND v_percentual >= n.percentual_minimo
        AND (n.percentual_maximo IS NULL OR v_percentual <= n.percentual_maximo)
      ORDER BY n.ordem LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'registrados', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to AND status <> 'cancelado'),
    'validados', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to AND status = 'validado'),
    'pendentes_validacao', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND status = 'enviado_validacao'),
    'correcao_solicitada', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND status = 'correcao_solicitada'),
    'rejeitados', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to AND status = 'rejeitado'),
    'rascunhos', (SELECT count(*) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND status = 'rascunho'),
    'valor_validado', (SELECT coalesce(sum(valor_servico), 0) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to AND status = 'validado'),
    'ticket_medio', (SELECT coalesce(avg(valor_servico), 0) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to AND status = 'validado'),
    'tempo_medio_validacao_horas', (SELECT round(coalesce(avg(EXTRACT(EPOCH FROM (validado_em - enviado_em)) / 3600.0), 0)::numeric, 1) FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to AND status = 'validado' AND enviado_em IS NOT NULL AND validado_em IS NOT NULL),
    'percentual_validado_sem_correcao', (SELECT CASE WHEN count(*) FILTER (WHERE status IN ('validado','rejeitado','correcao_solicitada')) = 0 THEN NULL ELSE round(count(*) FILTER (WHERE status = 'validado')::numeric / count(*) FILTER (WHERE status IN ('validado','rejeitado','correcao_solicitada')) * 100, 1) END FROM public.producao_tecnica WHERE tecnico_id = auth.uid() AND data_execucao BETWEEN p_from AND p_to),
    'meta', CASE WHEN NOT v_tem_meta THEN NULL ELSE jsonb_build_object(
      'tipo', v_meta.tipo_meta, 'inicio', v_meta.inicio, 'fim', v_meta.fim,
      'valor_meta', v_meta.valor_meta, 'quantidade_meta', v_meta.quantidade_meta,
      'realizado_valor', v_realizado_valor, 'realizado_qtd', v_realizado_qtd,
      'percentual', v_percentual, 'projecao', v_projecao, 'nivel', v_nivel
    ) END
  );
END $$;

-- 18) Fila de validação (gerência)
CREATE OR REPLACE FUNCTION public.producao_fila_indicadores() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (timezone('America/Manaus', now()))::date;
BEGIN
  IF NOT (
    public.has_permission(auth.uid(), 'producao', 'validar')
    OR public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
    OR public.has_role(auth.uid(), 'administrador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para acessar a fila de validação.';
  END IF;

  RETURN jsonb_build_object(
    'aguardando_validacao', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'enviado_validacao'),
    'correcao_solicitada', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'correcao_solicitada'),
    'validados_hoje', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'validado' AND (validado_em AT TIME ZONE 'America/Manaus')::date = v_hoje),
    'validados_mes', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'validado' AND (validado_em AT TIME ZONE 'America/Manaus')::date >= date_trunc('month', v_hoje)::date),
    'rejeitados_mes', (SELECT count(*) FROM public.producao_tecnica WHERE status = 'rejeitado' AND data_execucao >= date_trunc('month', v_hoje)::date),
    'valor_validado_mes', (SELECT coalesce(sum(valor_servico), 0) FROM public.producao_tecnica WHERE status = 'validado' AND (validado_em AT TIME ZONE 'America/Manaus')::date >= date_trunc('month', v_hoje)::date),
    'tempo_medio_fila_horas', (SELECT round(coalesce(avg(EXTRACT(EPOCH FROM (now() - enviado_em)) / 3600.0), 0)::numeric, 1) FROM public.producao_tecnica WHERE status = 'enviado_validacao')
  );
END $$;

-- 19) Relatório de produção (técnico só o próprio; gerência qualquer um)
CREATE OR REPLACE FUNCTION public.producao_relatorio(p_from date, p_to date, p_tecnico_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tecnico uuid := coalesce(p_tecnico_id, auth.uid());
BEGIN
  IF v_tecnico <> auth.uid() AND NOT (
    public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
    OR public.has_permission(auth.uid(), 'producao', 'validar')
    OR public.has_role(auth.uid(), 'administrador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para consultar a produção de outro técnico.';
  END IF;

  RETURN jsonb_build_object(
    'resumo', (SELECT jsonb_build_object(
      'registrados', count(*) FILTER (WHERE status <> 'cancelado'),
      'validados', count(*) FILTER (WHERE status = 'validado'),
      'rejeitados', count(*) FILTER (WHERE status = 'rejeitado'),
      'correcoes', count(*) FILTER (WHERE status = 'correcao_solicitada'),
      'pendentes', count(*) FILTER (WHERE status = 'enviado_validacao'),
      'valor_validado', coalesce(sum(valor_servico) FILTER (WHERE status = 'validado'), 0),
      'ticket_medio', coalesce(avg(valor_servico) FILTER (WHERE status = 'validado'), 0)
    ) FROM public.producao_tecnica WHERE tecnico_id = v_tecnico AND data_execucao BETWEEN p_from AND p_to),
    'por_tipo', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tipo', coalesce(t.nome, 'Sem tipo'), 'quantidade', x.qtd, 'valor', x.valor
    ) ORDER BY x.qtd DESC), '[]'::jsonb) FROM (
      SELECT tipo_servico_id, count(*) AS qtd, coalesce(sum(valor_servico), 0) AS valor
      FROM public.producao_tecnica
      WHERE tecnico_id = v_tecnico AND data_execucao BETWEEN p_from AND p_to AND status = 'validado'
      GROUP BY tipo_servico_id
    ) x LEFT JOIN public.tipos_servico_tecnico t ON t.id = x.tipo_servico_id),
    'registros', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'data_execucao', p.data_execucao, 'os', p.os, 'cliente', p.cliente,
      'marca_tv', p.marca_tv, 'modelo_tv', p.modelo_tv, 'servico_executado', p.servico_executado,
      'valor_servico', p.valor_servico, 'status', p.status
    ) ORDER BY p.data_execucao DESC, p.created_at DESC), '[]'::jsonb)
    FROM public.producao_tecnica p
    WHERE p.tecnico_id = v_tecnico AND p.data_execucao BETWEEN p_from AND p_to AND p.status <> 'cancelado')
  );
END $$;

-- 20) Ranking da equipe
CREATE OR REPLACE FUNCTION public.producao_ranking(p_from date, p_to date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (
    public.has_permission(auth.uid(), 'producao', 'visualizar_todos')
    OR public.has_permission(auth.uid(), 'producao', 'validar')
    OR public.has_role(auth.uid(), 'administrador')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para acessar o ranking.';
  END IF;

  RETURN (
    WITH dados AS (
      SELECT p.id AS tecnico_id, p.full_name AS nome,
        (SELECT count(*) FROM public.producao_tecnica pr WHERE pr.tecnico_id = p.id AND pr.data_execucao BETWEEN p_from AND p_to AND pr.status = 'validado') AS validados,
        (SELECT coalesce(sum(pr.valor_servico), 0) FROM public.producao_tecnica pr WHERE pr.tecnico_id = p.id AND pr.data_execucao BETWEEN p_from AND p_to AND pr.status = 'validado') AS valor,
        (SELECT m.valor_meta FROM public.metas_tecnicos m WHERE m.tecnico_id = p.id AND m.ativo AND m.inicio <= p_to AND m.fim >= p_from ORDER BY m.inicio DESC LIMIT 1) AS meta_valor,
        (SELECT m.quantidade_meta FROM public.metas_tecnicos m WHERE m.tecnico_id = p.id AND m.ativo AND m.inicio <= p_to AND m.fim >= p_from ORDER BY m.inicio DESC LIMIT 1) AS meta_qtd
      FROM public.profiles p
      WHERE EXISTS (
        SELECT 1 FROM public.producao_tecnica pr
        WHERE pr.tecnico_id = p.id AND pr.data_execucao BETWEEN p_from AND p_to AND pr.status <> 'cancelado'
      ) OR EXISTS (
        SELECT 1 FROM public.metas_tecnicos m WHERE m.tecnico_id = p.id AND m.ativo AND m.inicio <= p_to AND m.fim >= p_from
      )
    ), calculado AS (
      SELECT d.*,
        CASE
          WHEN coalesce(d.meta_valor, 0) > 0 THEN round(d.valor / d.meta_valor * 100, 1)
          WHEN coalesce(d.meta_qtd, 0) > 0 THEN round(d.validados::numeric / d.meta_qtd * 100, 1)
          ELSE NULL
        END AS percentual
      FROM dados d
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'tecnico_id', c.tecnico_id,
      'tecnico', c.nome,
      'validados', c.validados,
      'valor_validado', c.valor,
      'meta_valor', c.meta_valor,
      'meta_qtd', c.meta_qtd,
      'percentual', c.percentual,
      'nivel', (SELECT n.nome FROM public.niveis_desempenho n
                WHERE n.ativo AND c.percentual IS NOT NULL
                  AND c.percentual >= n.percentual_minimo
                  AND (n.percentual_maximo IS NULL OR c.percentual <= n.percentual_maximo)
                ORDER BY n.ordem LIMIT 1)
    ) ORDER BY c.valor DESC), '[]'::jsonb)
    FROM calculado c
  );
END $$;

-- 21) Bloquear EXECUTE das RPCs para anon
REVOKE EXECUTE ON FUNCTION public.producao_registrar(text, date, text, text, text, integer, text, text, uuid, text, numeric, numeric, text, text, boolean, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_atualizar(uuid, date, text, text, text, integer, text, text, uuid, text, numeric, numeric, text, text, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_enviar(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_validar(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_solicitar_correcao(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_rejeitar(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_cancelar(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_meus_indicadores(date, date) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_fila_indicadores() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_relatorio(date, date, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.producao_ranking(date, date) FROM public, anon;