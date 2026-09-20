-- ============================================================
-- ESTOQUE TÉCNICO — PARTE 3
-- Solicitação (técnico) → Reserva (gerente) → Entrega/Baixa
-- + correções da auditoria das Partes 1 e 2
-- ============================================================

-- 1) INVARIANTES ------------------------------------------------------------
ALTER TABLE public.estoque_itens
  DROP CONSTRAINT IF EXISTS estoque_itens_reservado_le_fisico;
ALTER TABLE public.estoque_itens
  ADD CONSTRAINT estoque_itens_reservado_le_fisico
  CHECK (quantidade_reservada <= quantidade);

-- 2) RESERVAS: vínculo com solicitação, status novos ------------------------
ALTER TABLE public.estoque_reservas
  ADD COLUMN IF NOT EXISTS solicitacao_id uuid,
  ADD COLUMN IF NOT EXISTS quantidade_original integer,
  ADD COLUMN IF NOT EXISTS quantidade_entregue integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS encerrada_em timestamptz;
UPDATE public.estoque_reservas SET quantidade_original = quantidade WHERE quantidade_original IS NULL;
ALTER TABLE public.estoque_reservas DROP CONSTRAINT IF EXISTS estoque_reservas_status_check;
ALTER TABLE public.estoque_reservas ADD CONSTRAINT estoque_reservas_status_check
  CHECK (status = ANY (ARRAY['ativa','atendida','parcialmente_utilizada','liberada','cancelada']));

-- 3) SOLICITAÇÕES -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.estoque_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE RESTRICT,
  tecnico_id uuid NOT NULL REFERENCES public.profiles(id),
  os text NOT NULL,
  quantidade integer NOT NULL CHECK (quantidade > 0),
  quantidade_reservada integer NOT NULL DEFAULT 0 CHECK (quantidade_reservada >= 0),
  quantidade_entregue integer NOT NULL DEFAULT 0 CHECK (quantidade_entregue >= 0),
  status text NOT NULL DEFAULT 'aguardando'
    CHECK (status = ANY (ARRAY['aguardando','reservada','parcialmente_atendida','entregue','rejeitada','cancelada'])),
  observacao text,
  motivo_rejeicao text,
  analisado_por uuid REFERENCES auth.users(id),
  analisado_em timestamptz,
  teste boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

GRANT SELECT ON public.estoque_solicitacoes TO authenticated;
GRANT ALL ON public.estoque_solicitacoes TO service_role;
ALTER TABLE public.estoque_solicitacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estoque_solic_select ON public.estoque_solicitacoes;
CREATE POLICY estoque_solic_select ON public.estoque_solicitacoes
  FOR SELECT TO authenticated
  USING (tecnico_id = auth.uid() OR public.has_permission(auth.uid(), 'estoque', 'reservar'));

CREATE INDEX IF NOT EXISTS idx_estoque_solic_status ON public.estoque_solicitacoes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_solic_tecnico ON public.estoque_solicitacoes (tecnico_id, created_at DESC);
-- proteção contra duplo clique: uma solicitação pendente idêntica por vez
CREATE UNIQUE INDEX IF NOT EXISTS estoque_solic_pendente_uk
  ON public.estoque_solicitacoes (item_id, tecnico_id, public.estoque_norm(os), quantidade)
  WHERE status = 'aguardando';

DROP TRIGGER IF EXISTS trg_estoque_solic_updated ON public.estoque_solicitacoes;
CREATE TRIGGER trg_estoque_solic_updated BEFORE UPDATE ON public.estoque_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.estoque_reservas
  DROP CONSTRAINT IF EXISTS estoque_reservas_solicitacao_id_fkey;
ALTER TABLE public.estoque_reservas
  ADD CONSTRAINT estoque_reservas_solicitacao_id_fkey
  FOREIGN KEY (solicitacao_id) REFERENCES public.estoque_solicitacoes(id) ON DELETE SET NULL;

-- 4) PERMISSÕES -------------------------------------------------------------
INSERT INTO public.role_permissions (role, module_key, action) VALUES
  ('tecnico','estoque','solicitar'),
  ('adm_operacional','estoque','solicitar'),
  ('adm_operacional','estoque','liberar_reserva'),
  ('adm_operacional','estoque','entregar_reserva')
ON CONFLICT DO NOTHING;
-- técnico NÃO reserva (item 76): reserva é ato da Gerência
DELETE FROM public.role_permissions WHERE role = 'tecnico' AND module_key = 'estoque' AND action = 'reservar';

-- 5) BUSCA: disponibilidade considera reservas, status reflete disponível ----
CREATE OR REPLACE FUNCTION public.estoque_buscar(
  p_busca text DEFAULT NULL, p_tipo text DEFAULT NULL, p_marca_id uuid DEFAULT NULL,
  p_polegada text DEFAULT NULL, p_localizacao_id uuid DEFAULT NULL,
  p_disponibilidade text DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_q text := nullif(public.estoque_norm(p_busca), '');
  v_total integer;
  v_itens jsonb;
  v_ver_custo boolean := public.has_permission(auth.uid(), 'estoque', 'movimentar');
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  create temp table if not exists _estoque_busca_tmp (x int) on commit drop;

  with base as (
    select i.id
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo
       and (p_tipo is null or i.tipo = p_tipo)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_polegada is null or i.polegada = p_polegada)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_disponibilidade is null
            or (p_disponibilidade = 'com_estoque' and (i.quantidade - i.quantidade_reservada) > 0)
            or (p_disponibilidade = 'sem_estoque' and (i.quantidade - i.quantidade_reservada) <= 0)
            or (p_disponibilidade = 'baixo' and (i.quantidade - i.quantidade_reservada) > 0
                and (i.quantidade - i.quantidade_reservada) <= i.estoque_minimo))
       and (v_q is null
            or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%'
            or public.estoque_norm(l.codigo) like '%' || v_q || '%'
            or public.estoque_norm(l.grupo || ' Gaveta ' || lpad(l.numero::text, 2, '0')) like '%' || v_q || '%'
            or exists (select 1 from public.estoque_compatibilidades c
                        where c.item_id = i.id
                          and public.estoque_norm(c.modelo) like '%' || v_q || '%'))
  )
  select count(*)::int into v_total from base;

  with base as (
    select i.*, m.nome as marca_nome, l.grupo, l.numero, l.codigo as gaveta_codigo,
           (select coalesce(jsonb_agg(c.modelo order by c.modelo), '[]'::jsonb)
              from public.estoque_compatibilidades c where c.item_id = i.id) as compatibilidades,
           (select coalesce(sum(r.quantidade), 0) from public.estoque_reservas r
             where r.item_id = i.id and r.status = 'ativa' and r.tecnico_id = auth.uid()) as minha_reserva,
           (select r.os from public.estoque_reservas r
             where r.item_id = i.id and r.status = 'ativa' and r.tecnico_id = auth.uid()
             order by r.created_at desc limit 1) as minha_reserva_os
      from public.estoque_itens i
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
     where i.ativo
       and (p_tipo is null or i.tipo = p_tipo)
       and (p_marca_id is null or i.marca_id = p_marca_id)
       and (p_polegada is null or i.polegada = p_polegada)
       and (p_localizacao_id is null or i.localizacao_id = p_localizacao_id)
       and (p_disponibilidade is null
            or (p_disponibilidade = 'com_estoque' and (i.quantidade - i.quantidade_reservada) > 0)
            or (p_disponibilidade = 'sem_estoque' and (i.quantidade - i.quantidade_reservada) <= 0)
            or (p_disponibilidade = 'baixo' and (i.quantidade - i.quantidade_reservada) > 0
                and (i.quantidade - i.quantidade_reservada) <= i.estoque_minimo))
       and (v_q is null
            or public.estoque_norm(i.modelo) like '%' || v_q || '%'
            or public.estoque_norm(i.codigo_placa) like '%' || v_q || '%'
            or public.estoque_norm(m.nome) like '%' || v_q || '%'
            or public.estoque_norm(l.codigo) like '%' || v_q || '%'
            or public.estoque_norm(l.grupo || ' Gaveta ' || lpad(l.numero::text, 2, '0')) like '%' || v_q || '%'
            or exists (select 1 from public.estoque_compatibilidades c
                        where c.item_id = i.id
                          and public.estoque_norm(c.modelo) like '%' || v_q || '%'))
     order by m.nome, i.modelo
     limit greatest(coalesce(p_limit, 50), 1) offset greatest(coalesce(p_offset, 0), 0)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'tipo', b.tipo, 'marca_id', b.marca_id, 'marca_nome', b.marca_nome,
           'polegada', b.polegada, 'modelo', b.modelo, 'codigo_placa', b.codigo_placa,
           'localizacao_id', b.localizacao_id, 'gaveta_codigo', b.gaveta_codigo,
           'gaveta_grupo', b.grupo, 'gaveta_numero', b.numero,
           'gaveta_label', b.grupo || ' — Gaveta ' || lpad(b.numero::text, 2, '0'),
           'quantidade', b.quantidade, 'quantidade_reservada', b.quantidade_reservada,
           'quantidade_disponivel', greatest(b.quantidade - b.quantidade_reservada, 0),
           'minha_reserva', b.minha_reserva, 'minha_reserva_os', b.minha_reserva_os,
           'estoque_minimo', b.estoque_minimo, 'observacao', b.observacao,
           'custo_unitario', case when v_ver_custo then b.custo_unitario else null end,
           'compatibilidades', b.compatibilidades,
           'status', case when greatest(b.quantidade - b.quantidade_reservada, 0) = 0 then 'sem_estoque'
                          when (b.quantidade - b.quantidade_reservada) <= b.estoque_minimo then 'baixo'
                          else 'em_estoque' end
         )), '[]'::jsonb) into v_itens from base b;

  return jsonb_build_object('ok', true, 'total', v_total, 'itens', v_itens);
end;
$function$;

-- 6) SOLICITAR (técnico) ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.estoque_solicitar(
  p_item_id uuid, p_quantidade integer, p_os text, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_item record; v_os text := nullif(btrim(coalesce(p_os,'')), ''); v_id uuid; v_disp int;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'solicitar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;
  if v_os is null then
    return jsonb_build_object('ok', false, 'code', 'OS_OBRIGATORIA');
  end if;

  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id and i.ativo;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO');
  end if;

  v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);

  begin
    insert into public.estoque_solicitacoes (item_id, tecnico_id, os, quantidade, observacao,
      teste, created_by, updated_by)
    values (p_item_id, auth.uid(), v_os, p_quantidade,
      nullif(btrim(coalesce(p_observacao,'')), ''), coalesce(v_item.teste, false),
      auth.uid(), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'SOLICITACAO_DUPLICADA');
  end;

  perform public.registrar_auditoria('estoque', 'solicitacao_criar', null,
    jsonb_build_object('solicitacao_id', v_id, 'item_id', p_item_id,
      'quantidade', p_quantidade, 'os', v_os));

  return jsonb_build_object('ok', true, 'id', v_id,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'tipo', v_item.tipo,
    'gaveta', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'quantidade', p_quantidade, 'os', v_os, 'disponivel', v_disp,
    'status', 'aguardando');
end;
$function$;

-- 7) LISTAR SOLICITAÇÕES ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.estoque_solicitacoes_listar(
  p_status text DEFAULT NULL, p_escopo text DEFAULT 'minhas')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_todas boolean; v_lista jsonb;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_todas := p_escopo = 'todas' and public.has_permission(auth.uid(), 'estoque', 'reservar');

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_lista
  from (
    select jsonb_build_object(
      'id', s.id, 'item_id', s.item_id, 'os', s.os, 'quantidade', s.quantidade,
      'quantidade_reservada', s.quantidade_reservada, 'quantidade_entregue', s.quantidade_entregue,
      'status', s.status, 'observacao', s.observacao, 'motivo_rejeicao', s.motivo_rejeicao,
      'created_at', s.created_at, 'analisado_em', s.analisado_em,
      'analisado_por_nome', ap.full_name,
      'tecnico_id', s.tecnico_id, 'tecnico_nome', t.full_name,
      'tipo', i.tipo, 'marca_nome', m.nome, 'modelo', i.modelo,
      'polegada', i.polegada, 'codigo_placa', i.codigo_placa,
      'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
      'fisico', i.quantidade, 'reservado', i.quantidade_reservada,
      'disponivel', greatest(i.quantidade - i.quantidade_reservada, 0)
    ) as x
      from public.estoque_solicitacoes s
      join public.estoque_itens i on i.id = s.item_id
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
      left join public.profiles t on t.id = s.tecnico_id
      left join public.profiles ap on ap.id = s.analisado_por
     where (v_todas or s.tecnico_id = auth.uid())
       and (p_status is null or s.status = p_status)
     order by s.created_at desc
     limit 300
  ) q;

  return jsonb_build_object('ok', true, 'solicitacoes', v_lista, 'todas', v_todas);
end;
$function$;

-- 8) CANCELAR SOLICITAÇÃO (técnico dono enquanto aguardando) ----------------
CREATE OR REPLACE FUNCTION public.estoque_solicitacao_cancelar(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_s record;
begin
  select * into v_s from public.estoque_solicitacoes where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if v_s.status <> 'aguardando' then
    return jsonb_build_object('ok', false, 'code', 'SOLICITACAO_NAO_PENDENTE');
  end if;
  if not (v_s.tecnico_id = auth.uid() or public.has_permission(auth.uid(), 'estoque', 'reservar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  update public.estoque_solicitacoes
     set status = 'cancelada',
         motivo_rejeicao = nullif(btrim(coalesce(p_motivo,'')), ''),
         analisado_por = auth.uid(), analisado_em = now(), updated_by = auth.uid()
   where id = p_id;

  perform public.registrar_auditoria('estoque', 'solicitacao_cancelar', null,
    jsonb_build_object('solicitacao_id', p_id, 'motivo', p_motivo));
  return jsonb_build_object('ok', true);
end;
$function$;

-- 9) REJEITAR SOLICITAÇÃO (gerente, motivo obrigatório) ---------------------
CREATE OR REPLACE FUNCTION public.estoque_solicitacao_rejeitar(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_s record;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'reservar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO');
  end if;
  select * into v_s from public.estoque_solicitacoes where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if v_s.status <> 'aguardando' then
    return jsonb_build_object('ok', false, 'code', 'SOLICITACAO_NAO_PENDENTE');
  end if;

  update public.estoque_solicitacoes
     set status = 'rejeitada', motivo_rejeicao = btrim(p_motivo),
         analisado_por = auth.uid(), analisado_em = now(), updated_by = auth.uid()
   where id = p_id;

  perform public.registrar_auditoria('estoque', 'solicitacao_rejeitar', null,
    jsonb_build_object('solicitacao_id', p_id, 'motivo', btrim(p_motivo)));
  return jsonb_build_object('ok', true);
end;
$function$;

-- 10) RESERVAR (gerente) ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.estoque_reservar(
  p_item_id uuid, p_quantidade integer, p_os text DEFAULT NULL, p_observacao text DEFAULT NULL,
  p_tecnico_id uuid DEFAULT NULL, p_solicitacao_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_item record; v_disp int; v_id uuid; v_tec uuid; v_s record; v_status text;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'reservar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;

  -- trava a linha do item: duas reservas simultâneas não consomem a mesma unidade
  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id for update of i;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  v_tec := coalesce(p_tecnico_id, auth.uid());

  if p_solicitacao_id is not null then
    select * into v_s from public.estoque_solicitacoes where id = p_solicitacao_id for update;
    if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
    if v_s.status <> 'aguardando' then
      return jsonb_build_object('ok', false, 'code', 'SOLICITACAO_NAO_PENDENTE');
    end if;
    if p_quantidade > v_s.quantidade then
      return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_ACIMA_SOLICITADA');
    end if;
    v_tec := v_s.tecnico_id;
  end if;

  v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);
  if p_quantidade > v_disp then
    return jsonb_build_object('ok', false, 'code', 'SEM_DISPONIBILIDADE',
      'disponivel', v_disp, 'reservado', v_item.quantidade_reservada);
  end if;

  insert into public.estoque_reservas (item_id, quantidade, quantidade_original, os, tecnico_id,
    observacao, solicitacao_id, created_by, updated_by)
  values (p_item_id, p_quantidade, p_quantidade,
    nullif(btrim(coalesce(coalesce(p_os, v_s.os), '')), ''), v_tec,
    nullif(btrim(coalesce(p_observacao,'')), ''), p_solicitacao_id, auth.uid(), auth.uid())
  returning id into v_id;

  update public.estoque_itens
     set quantidade_reservada = quantidade_reservada + p_quantidade, updated_by = auth.uid()
   where id = p_item_id;

  if p_solicitacao_id is not null then
    v_status := case when p_quantidade < v_s.quantidade then 'parcialmente_atendida' else 'reservada' end;
    update public.estoque_solicitacoes
       set status = v_status, quantidade_reservada = p_quantidade,
           analisado_por = auth.uid(), analisado_em = now(), updated_by = auth.uid()
     where id = p_solicitacao_id;
  end if;

  perform public.registrar_auditoria('estoque', 'reserva_criar', null,
    jsonb_build_object('reserva_id', v_id, 'item_id', p_item_id, 'quantidade', p_quantidade,
      'os', coalesce(p_os, v_s.os), 'tecnico_id', v_tec, 'solicitacao_id', p_solicitacao_id));

  return jsonb_build_object('ok', true, 'id', v_id,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'gaveta', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'quantidade', p_quantidade,
    'os', coalesce(nullif(btrim(coalesce(p_os,'')), ''), v_s.os),
    'tecnico', (select full_name from public.profiles where id = v_tec),
    'fisico', v_item.quantidade,
    'reservado', v_item.quantidade_reservada + p_quantidade,
    'disponivel_antes', v_disp,
    'disponivel', v_disp - p_quantidade,
    'solicitacao_status', v_status);
end;
$function$;

-- 11) LIBERAR RESERVA (motivo obrigatório, sem movimento físico) ------------
CREATE OR REPLACE FUNCTION public.estoque_reserva_liberar(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_r record; v_item record;
begin
  select * into v_r from public.estoque_reservas where id = p_id for update;
  if not found or v_r.status not in ('ativa','parcialmente_utilizada') then
    return jsonb_build_object('ok', false, 'code', 'RESERVA_INVALIDA');
  end if;
  if not (public.has_permission(auth.uid(), 'estoque', 'liberar_reserva')
          or public.has_permission(auth.uid(), 'estoque', 'reservar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO');
  end if;

  select * into v_item from public.estoque_itens where id = v_r.item_id for update;

  update public.estoque_reservas
     set status = 'liberada', motivo_cancelamento = btrim(p_motivo),
         encerrada_em = now(), updated_by = auth.uid()
   where id = p_id;

  update public.estoque_itens
     set quantidade_reservada = greatest(quantidade_reservada - v_r.quantidade, 0),
         updated_by = auth.uid()
   where id = v_r.item_id;

  if v_r.solicitacao_id is not null then
    update public.estoque_solicitacoes
       set status = case when quantidade_entregue > 0 then 'entregue' else 'cancelada' end,
           quantidade_reservada = 0,
           motivo_rejeicao = coalesce(motivo_rejeicao, btrim(p_motivo)),
           updated_by = auth.uid()
     where id = v_r.solicitacao_id;
  end if;

  perform public.registrar_auditoria('estoque', 'reserva_liberar', null,
    jsonb_build_object('reserva_id', p_id, 'motivo', btrim(p_motivo), 'quantidade', v_r.quantidade));

  return jsonb_build_object('ok', true,
    'fisico', v_item.quantidade,
    'reservado', greatest(v_item.quantidade_reservada - v_r.quantidade, 0),
    'disponivel', greatest(v_item.quantidade - greatest(v_item.quantidade_reservada - v_r.quantidade, 0), 0));
end;
$function$;

-- compatibilidade: cancelar agora exige motivo e delega para liberar
CREATE OR REPLACE FUNCTION public.estoque_reserva_cancelar(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
  return public.estoque_reserva_liberar(p_id, p_motivo);
end;
$function$;

-- 12) ENTREGAR RESERVA = baixa física atômica -------------------------------
CREATE OR REPLACE FUNCTION public.estoque_reserva_entregar(
  p_id uuid, p_quantidade integer DEFAULT NULL, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_r record; v_qtd int; v_res jsonb; v_restante int;
begin
  if not (public.has_permission(auth.uid(), 'estoque', 'entregar_reserva')
          or public.has_permission(auth.uid(), 'estoque', 'movimentar')) then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;

  select * into v_r from public.estoque_reservas where id = p_id for update;
  if not found or v_r.status not in ('ativa','parcialmente_utilizada') then
    return jsonb_build_object('ok', false, 'code', 'RESERVA_INVALIDA');
  end if;

  v_qtd := coalesce(nullif(p_quantidade, 0), v_r.quantidade);
  if v_qtd <= 0 then return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA'); end if;
  if v_qtd > v_r.quantidade then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_ACIMA_RESERVA');
  end if;

  v_res := public.estoque_baixar(v_r.item_id, v_qtd, 'uso_os', v_r.os, v_r.tecnico_id,
    coalesce(nullif(btrim(coalesce(p_observacao,'')), ''), 'Entrega de peça reservada.'), p_id);
  if not (v_res->>'ok')::boolean then
    return v_res;
  end if;

  v_restante := greatest(v_r.quantidade - v_qtd, 0);
  update public.estoque_reservas
     set quantidade_entregue = quantidade_entregue + v_qtd,
         status = case when v_restante = 0 then 'atendida' else 'parcialmente_utilizada' end,
         encerrada_em = case when v_restante = 0 then now() else null end,
         updated_by = auth.uid()
   where id = p_id;

  if v_r.solicitacao_id is not null then
    update public.estoque_solicitacoes
       set quantidade_entregue = quantidade_entregue + v_qtd,
           quantidade_reservada = greatest(quantidade_reservada - v_qtd, 0),
           status = case when v_restante = 0 then 'entregue' else 'parcialmente_atendida' end,
           updated_by = auth.uid()
     where id = v_r.solicitacao_id;
  end if;

  return v_res || jsonb_build_object('reserva_restante', v_restante,
    'reserva_status', case when v_restante = 0 then 'atendida' else 'parcialmente_utilizada' end);
end;
$function$;

-- 13) RESERVAS ATIVAS -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.estoque_reservas_listar(p_status text DEFAULT 'ativa')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_lista jsonb; v_todas boolean;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_todas := public.has_permission(auth.uid(), 'estoque', 'reservar');

  select coalesce(jsonb_agg(x order by x->>'created_at' asc), '[]'::jsonb) into v_lista
  from (
    select jsonb_build_object(
      'id', r.id, 'item_id', r.item_id, 'quantidade', r.quantidade,
      'quantidade_entregue', r.quantidade_entregue, 'status', r.status,
      'os', r.os, 'tecnico_id', r.tecnico_id, 'tecnico_nome', t.full_name,
      'observacao', r.observacao, 'created_at', r.created_at,
      'dias', greatest((current_date - (r.created_at at time zone 'America/Manaus')::date), 0),
      'reservado_por', rp.full_name,
      'tipo', i.tipo, 'marca_nome', m.nome, 'modelo', i.modelo, 'codigo_placa', i.codigo_placa,
      'gaveta_label', l.grupo || ' — Gaveta ' || lpad(l.numero::text, 2, '0'),
      'fisico', i.quantidade, 'reservado_item', i.quantidade_reservada,
      'disponivel', greatest(i.quantidade - i.quantidade_reservada, 0),
      'solicitacao_id', r.solicitacao_id
    ) as x
      from public.estoque_reservas r
      join public.estoque_itens i on i.id = r.item_id
      join public.estoque_marcas m on m.id = i.marca_id
      join public.estoque_localizacoes l on l.id = i.localizacao_id
      left join public.profiles t on t.id = r.tecnico_id
      left join public.profiles rp on rp.id = r.created_by
     where (p_status is null or r.status = p_status
            or (p_status = 'ativa' and r.status = 'parcialmente_utilizada'))
       and (v_todas or r.tecnico_id = auth.uid())
     order by r.created_at asc
     limit 300
  ) q;

  return jsonb_build_object('ok', true, 'reservas', v_lista);
end;
$function$;

-- 14) TRANSFERÊNCIA ATÔMICA ENTRE GAVETAS -----------------------------------
CREATE OR REPLACE FUNCTION public.estoque_transferir(
  p_item_id uuid, p_localizacao_id uuid, p_quantidade integer, p_observacao text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_item record; v_destino record; v_dest_id uuid; v_disp int;
  v_novo_origem int; v_dest_qtd int; v_obs text;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'movimentar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if coalesce(p_quantidade, 0) <= 0 then
    return jsonb_build_object('ok', false, 'code', 'QUANTIDADE_INVALIDA');
  end if;

  select i.*, m.nome as marca_nome, l.grupo, l.numero into v_item
    from public.estoque_itens i
    join public.estoque_marcas m on m.id = i.marca_id
    join public.estoque_localizacoes l on l.id = i.localizacao_id
   where i.id = p_item_id for update of i;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  if p_localizacao_id = v_item.localizacao_id then
    return jsonb_build_object('ok', false, 'code', 'LOCALIZACAO_IGUAL');
  end if;

  select * into v_destino from public.estoque_localizacoes where id = p_localizacao_id and ativo;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;

  -- só a quantidade disponível pode mudar de gaveta
  v_disp := greatest(v_item.quantidade - v_item.quantidade_reservada, 0);
  if p_quantidade > v_disp then
    return jsonb_build_object('ok', false, 'code', 'SEM_DISPONIBILIDADE',
      'disponivel', v_disp, 'reservado', v_item.quantidade_reservada);
  end if;

  v_obs := coalesce(nullif(btrim(coalesce(p_observacao,'')), ''), '')
    || case when coalesce(btrim(coalesce(p_observacao,'')), '') = '' then '' else ' — ' end
    || 'Transferência ' || v_item.grupo || '-G' || lpad(v_item.numero::text, 2, '0')
    || ' → ' || v_destino.grupo || '-G' || lpad(v_destino.numero::text, 2, '0');

  -- item de destino: mesma peça na outra gaveta (cria se ainda não existir)
  select id, quantidade into v_dest_id, v_dest_qtd from public.estoque_itens
   where tipo = v_item.tipo and marca_id = v_item.marca_id
     and public.estoque_norm(modelo) = public.estoque_norm(v_item.modelo)
     and coalesce(public.estoque_norm(codigo_placa), '') = coalesce(public.estoque_norm(v_item.codigo_placa), '')
     and localizacao_id = p_localizacao_id
   for update;

  if v_dest_id is null then
    insert into public.estoque_itens (tipo, marca_id, polegada, modelo, codigo_placa,
      localizacao_id, quantidade, estoque_minimo, observacao, custo_unitario, teste,
      created_by, updated_by)
    values (v_item.tipo, v_item.marca_id, v_item.polegada, v_item.modelo, v_item.codigo_placa,
      p_localizacao_id, 0, v_item.estoque_minimo, v_item.observacao, v_item.custo_unitario,
      coalesce(v_item.teste, false), auth.uid(), auth.uid())
    returning id, quantidade into v_dest_id, v_dest_qtd;

    insert into public.estoque_compatibilidades (item_id, modelo, created_by)
    select v_dest_id, c.modelo, auth.uid() from public.estoque_compatibilidades c
     where c.item_id = p_item_id
    on conflict do nothing;
  end if;

  v_novo_origem := v_item.quantidade - p_quantidade;

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, observacao,
    saldo_anterior, saldo_posterior, custo_unitario, created_by)
  values (p_item_id, 'saida', 'transferencia', p_quantidade, v_obs,
    v_item.quantidade, v_novo_origem, coalesce(v_item.custo_unitario, 0), auth.uid());

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, observacao,
    saldo_anterior, saldo_posterior, custo_unitario, created_by)
  values (v_dest_id, 'entrada', 'transferencia', p_quantidade, v_obs,
    v_dest_qtd, v_dest_qtd + p_quantidade, coalesce(v_item.custo_unitario, 0), auth.uid());

  update public.estoque_itens set quantidade = v_novo_origem, updated_by = auth.uid()
   where id = p_item_id;
  update public.estoque_itens set quantidade = v_dest_qtd + p_quantidade, updated_by = auth.uid()
   where id = v_dest_id;

  perform public.registrar_auditoria('estoque', 'transferencia', null,
    jsonb_build_object('item_id', p_item_id, 'destino_item_id', v_dest_id,
      'quantidade', p_quantidade, 'localizacao_id', p_localizacao_id));

  return jsonb_build_object('ok', true,
    'peca', v_item.marca_nome || ' ' || v_item.modelo,
    'origem', v_item.grupo || ' — Gaveta ' || lpad(v_item.numero::text, 2, '0'),
    'destino', v_destino.grupo || ' — Gaveta ' || lpad(v_destino.numero::text, 2, '0'),
    'quantidade', p_quantidade,
    'saldo_origem', v_novo_origem, 'saldo_destino', v_dest_qtd + p_quantidade);
end;
$function$;

-- 15) RESUMO PARA A GERÊNCIA OPERACIONAL ------------------------------------
CREATE OR REPLACE FUNCTION public.estoque_resumo()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_hoje date := (now() at time zone 'America/Manaus')::date;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  return jsonb_build_object('ok', true,
    'solicitacoes_pendentes', (select count(*) from public.estoque_solicitacoes where status = 'aguardando'),
    'minhas_solicitacoes_pendentes', (select count(*) from public.estoque_solicitacoes
       where status = 'aguardando' and tecnico_id = auth.uid()),
    'reservas_ativas', (select count(*) from public.estoque_reservas where status in ('ativa','parcialmente_utilizada')),
    'reservas_antigas', (select count(*) from public.estoque_reservas
       where status in ('ativa','parcialmente_utilizada')
         and created_at < now() - interval '7 days'),
    'entregas_hoje', (select count(*) from public.estoque_movimentos
       where tipo = 'saida' and reserva_id is not null
         and (created_at at time zone 'America/Manaus')::date = v_hoje),
    'baixas_hoje', (select count(*) from public.estoque_movimentos
       where tipo = 'saida' and motivo <> 'estorno'
         and (created_at at time zone 'America/Manaus')::date = v_hoje),
    'itens_sem_disponibilidade', (select count(*) from public.estoque_itens
       where ativo and (quantidade - quantidade_reservada) <= 0)
  );
end;
$function$;

-- 16) HISTÓRICO DO ITEM: inclui reservas e solicitações ---------------------
CREATE OR REPLACE FUNCTION public.estoque_item_historico(p_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_mov jsonb; v_res jsonb; v_sol jsonb; v_ver_custo boolean; v_gestor boolean;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'visualizar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  v_ver_custo := public.has_permission(auth.uid(), 'estoque', 'movimentar');
  v_gestor := public.has_permission(auth.uid(), 'estoque', 'reservar');

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'tipo', m.tipo, 'motivo', m.motivo, 'quantidade', m.quantidade,
      'os', m.os, 'tecnico_nome', t.full_name, 'observacao', m.observacao,
      'saldo_anterior', m.saldo_anterior, 'saldo_posterior', m.saldo_posterior,
      'custo_unitario', case when v_ver_custo then m.custo_unitario else null end,
      'custo_os_id', m.custo_os_id, 'estornado_em', m.estornado_em, 'estorno_de', m.estorno_de,
      'reserva_id', m.reserva_id,
      'created_at', m.created_at, 'responsavel', r.full_name) order by m.created_at desc), '[]'::jsonb)
    into v_mov
    from public.estoque_movimentos m
    left join public.profiles t on t.id = m.tecnico_id
    left join public.profiles r on r.id = m.created_by
   where m.item_id = p_item_id and (v_gestor or m.tecnico_id = auth.uid() or m.tecnico_id is null);

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'quantidade', r.quantidade, 'quantidade_entregue', r.quantidade_entregue,
      'status', r.status, 'os', r.os, 'tecnico_nome', p.full_name,
      'observacao', r.observacao, 'created_at', r.created_at,
      'dias', greatest((current_date - (r.created_at at time zone 'America/Manaus')::date), 0),
      'reservado_por', rp.full_name) order by r.created_at desc), '[]'::jsonb)
    into v_res
    from public.estoque_reservas r
    left join public.profiles p on p.id = r.tecnico_id
    left join public.profiles rp on rp.id = r.created_by
   where r.item_id = p_item_id and r.status in ('ativa','parcialmente_utilizada')
     and (v_gestor or r.tecnico_id = auth.uid());

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'quantidade', s.quantidade, 'os', s.os, 'status', s.status,
      'tecnico_nome', p.full_name, 'created_at', s.created_at) order by s.created_at desc), '[]'::jsonb)
    into v_sol
    from public.estoque_solicitacoes s
    left join public.profiles p on p.id = s.tecnico_id
   where s.item_id = p_item_id and s.status = 'aguardando'
     and (v_gestor or s.tecnico_id = auth.uid());

  return jsonb_build_object('ok', true, 'movimentos', v_mov, 'reservas', v_res, 'solicitacoes', v_sol);
end;
$function$;

-- 17) BAIXA GENÉRICA: mensagem com reservado; ESTORNO com restauro opcional -
CREATE OR REPLACE FUNCTION public.estoque_movimento_estornar(
  p_id uuid, p_motivo text, p_restaurar_reserva boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_mov record; v_item record; v_novo int; v_novo_id uuid; v_reserva_restaurada boolean := false;
begin
  if not public.has_permission(auth.uid(), 'estoque', 'estornar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO');
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 3 then
    return jsonb_build_object('ok', false, 'code', 'MOTIVO_OBRIGATORIO');
  end if;

  select * into v_mov from public.estoque_movimentos where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO'); end if;
  if v_mov.estornado_em is not null then
    return jsonb_build_object('ok', false, 'code', 'JA_ESTORNADO');
  end if;
  if v_mov.motivo = 'estorno' then
    return jsonb_build_object('ok', false, 'code', 'MOVIMENTO_NAO_ESTORNAVEL');
  end if;

  select * into v_item from public.estoque_itens where id = v_mov.item_id for update;

  if v_mov.tipo = 'saida' then
    v_novo := v_item.quantidade + v_mov.quantidade;
  else
    v_novo := v_item.quantidade - v_mov.quantidade;
    if v_novo < 0 or v_novo < v_item.quantidade_reservada then
      return jsonb_build_object('ok', false, 'code', 'SALDO_INSUFICIENTE');
    end if;
  end if;

  insert into public.estoque_movimentos (item_id, tipo, motivo, quantidade, os, tecnico_id,
    observacao, saldo_anterior, saldo_posterior, custo_unitario, estorno_de, created_by)
  values (v_mov.item_id, case when v_mov.tipo = 'saida' then 'entrada' else 'saida' end,
    'estorno', v_mov.quantidade, v_mov.os, v_mov.tecnico_id, btrim(p_motivo),
    v_item.quantidade, v_novo, coalesce(v_item.custo_unitario, 0), v_mov.id, auth.uid())
  returning id into v_novo_id;

  update public.estoque_itens set quantidade = v_novo, updated_by = auth.uid() where id = v_mov.item_id;
  update public.estoque_movimentos set estornado_em = now() where id = v_mov.id;

  -- reserva só volta se o gerente decidir explicitamente
  if coalesce(p_restaurar_reserva, false) and v_mov.reserva_id is not null and v_mov.tipo = 'saida' then
    update public.estoque_reservas
       set quantidade = quantidade + v_mov.quantidade,
           quantidade_entregue = greatest(quantidade_entregue - v_mov.quantidade, 0),
           status = 'ativa', encerrada_em = null, updated_by = auth.uid()
     where id = v_mov.reserva_id;
    update public.estoque_itens
       set quantidade_reservada = quantidade_reservada + v_mov.quantidade, updated_by = auth.uid()
     where id = v_mov.item_id;
    v_reserva_restaurada := true;
  end if;

  if v_mov.custo_os_id is not null then
    update public.custos_os
       set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(),
           motivo_cancelamento = 'Estorno da baixa no Estoque Técnico: ' || btrim(p_motivo),
           updated_by = auth.uid()
     where id = v_mov.custo_os_id and status <> 'cancelado';
  end if;

  perform public.registrar_auditoria('estoque', 'estorno_movimento', null,
    jsonb_build_object('movimento_id', v_mov.id, 'motivo', btrim(p_motivo),
      'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo,
      'reserva_restaurada', v_reserva_restaurada));

  return jsonb_build_object('ok', true, 'id', v_novo_id,
    'saldo_anterior', v_item.quantidade, 'saldo_posterior', v_novo,
    'reserva_restaurada', v_reserva_restaurada);
end;
$function$;

-- 18) GRANTS/REVOKES nas RPCs ----------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure::text AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'estoque%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;