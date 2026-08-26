-- 1) Formas de pagamento: liquidação e taxas por parcelamento
ALTER TABLE public.formas_pagamento
  ADD COLUMN IF NOT EXISTS liquidacao_imediata boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS prazo_liquidacao_dias integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS observacao text;

CREATE TABLE IF NOT EXISTS public.formas_pagamento_taxas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  forma_pagamento_id uuid NOT NULL REFERENCES public.formas_pagamento(id) ON DELETE CASCADE,
  parcelas integer NOT NULL CHECK (parcelas >= 1 AND parcelas <= 24),
  taxa_percentual numeric(6,3) NOT NULL DEFAULT 0 CHECK (taxa_percentual >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (forma_pagamento_id, parcelas)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.formas_pagamento_taxas TO authenticated;
GRANT ALL ON public.formas_pagamento_taxas TO service_role;
ALTER TABLE public.formas_pagamento_taxas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "formas_taxas_select" ON public.formas_pagamento_taxas
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "formas_taxas_manage" ON public.formas_pagamento_taxas
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'caixa', 'administrar'))
  WITH CHECK (public.has_permission(auth.uid(), 'caixa', 'administrar'));

CREATE TRIGGER update_formas_pagamento_taxas_updated_at
  BEFORE UPDATE ON public.formas_pagamento_taxas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Vínculo da conta a receber com o lançamento de caixa de origem
ALTER TABLE public.contas_receber
  ADD COLUMN IF NOT EXISTS caixa_lancamento_id uuid REFERENCES public.caixa_lancamentos(id);

-- 3) Cargos com função de entrega
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS funcao_entrega boolean NOT NULL DEFAULT false;

-- 4) Caixa: parcelas válidas + geração de contas a receber para formas sem liquidação imediata
CREATE OR REPLACE FUNCTION public.caixa_registrar_lancamento(p_data date, p_os text DEFAULT NULL::text, p_cliente text DEFAULT NULL::text, p_tipo_receita_id uuid DEFAULT NULL::uuid, p_descricao text DEFAULT NULL::text, p_tecnico_id uuid DEFAULT NULL::uuid, p_valor_bruto numeric DEFAULT NULL::numeric, p_desconto numeric DEFAULT 0, p_observacao text DEFAULT NULL::text, p_pagamentos jsonb DEFAULT '[]'::jsonb, p_confirmar_duplicidade boolean DEFAULT false, p_desconto_autorizacao_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os,'')),'');
  v_valor_final numeric(12,2); v_soma numeric(12,2); v_id uuid; v_dup record; v_pg jsonb;
  v_pct numeric; v_lim numeric; v_aut record; v_forma record; v_parc int; v_cr int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'code','NAO_AUTENTICADO','message','Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid,'caixa','criar') then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para criar lançamentos.');
  end if;
  if p_data is null then return jsonb_build_object('ok',false,'code','DATA_OBRIGATORIA','message','Informe a data do lançamento.'); end if;
  if p_data > ((now() at time zone 'America/Manaus')::date) and not public.has_permission(v_uid,'caixa','administrar') then
    return jsonb_build_object('ok',false,'code','DATA_FUTURA','message','Não é permitido lançar em data futura.');
  end if;
  if public.caixa_periodo_fechado(p_data) and not public.has_permission(v_uid,'caixa','administrar') then
    return jsonb_build_object('ok',false,'code','PERIODO_FECHADO','message','O caixa desta data já foi fechado. Fale com um administrador.');
  end if;
  if p_tipo_receita_id is null or not exists (select 1 from public.tipos_receita t where t.id=p_tipo_receita_id and t.ativo) then
    return jsonb_build_object('ok',false,'code','TIPO_INVALIDO','message','Selecione o tipo de receita.');
  end if;
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    return jsonb_build_object('ok',false,'code','VALOR_OBRIGATORIO','message','Informe o valor bruto.');
  end if;
  if coalesce(p_desconto,0) < 0 then
    return jsonb_build_object('ok',false,'code','DESCONTO_INVALIDO','message','O desconto não pode ser negativo.');
  end if;
  v_valor_final := round(p_valor_bruto,2) - round(coalesce(p_desconto,0),2);
  if v_valor_final < 0 then
    return jsonb_build_object('ok',false,'code','VALOR_FINAL_NEGATIVO','message','O desconto não pode ser maior que o valor bruto.');
  end if;

  if coalesce(p_desconto,0) > 0 then
    v_pct := round(round(coalesce(p_desconto,0),2) / round(p_valor_bruto,2) * 100, 4);
    v_lim := public.desconto_limite(v_uid);
    if v_lim is not null and v_pct > v_lim then
      if p_desconto_autorizacao_id is null then
        return jsonb_build_object('ok',false,'code','DESCONTO_ACIMA_ALCADA',
          'message','Desconto acima da sua alçada. Solicite autorização de um gestor.',
          'percentual', v_pct, 'limite', v_lim);
      end if;
      select * into v_aut from public.descontos_autorizacoes d where d.id = p_desconto_autorizacao_id;
      if v_aut is null or v_aut.status <> 'aprovado' or v_aut.lancamento_id is not null then
        return jsonb_build_object('ok',false,'code','AUTORIZACAO_INVALIDA','message','Autorização de desconto inválida, já utilizada ou não aprovada.');
      end if;
      if round(coalesce(p_desconto,0),2) > v_aut.valor_desconto then
        return jsonb_build_object('ok',false,'code','AUTORIZACAO_VALOR','message','O desconto informado é maior que o valor autorizado.');
      end if;
    end if;
  end if;

  if p_tecnico_id is not null and not exists (select 1 from public.profiles pr where pr.id=p_tecnico_id and pr.active) then
    return jsonb_build_object('ok',false,'code','TECNICO_INVALIDO','message','Técnico não encontrado ou inativo.');
  end if;

  if v_os is not null and not p_confirmar_duplicidade then
    select l.id, l.data_lancamento, l.cliente, l.valor_final, pr.full_name as responsavel
      into v_dup
      from public.caixa_lancamentos l
      left join public.profiles pr on pr.id = l.responsavel_id
     where l.os = v_os and l.status='ativo'
     order by l.created_at desc limit 1;
    if v_dup.id is not null then
      return jsonb_build_object('ok',false,'code','OS_DUPLICADA',
        'message','Já existe lançamento ativo para esta OS. Confirme para prosseguir.',
        'existente', jsonb_build_object('os',v_os,'data',v_dup.data_lancamento,'cliente',v_dup.cliente,
                                        'valor',v_dup.valor_final,'responsavel',v_dup.responsavel));
    end if;
  end if;

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos)=0 then
    return jsonb_build_object('ok',false,'code','PAGAMENTO_OBRIGATORIO','message','Informe ao menos uma forma de pagamento.');
  end if;

  select coalesce(sum(round((pg->>'valor')::numeric,2)),0) into v_soma from jsonb_array_elements(p_pagamentos) as pg;
  if v_soma <> v_valor_final then
    return jsonb_build_object('ok',false,'code','SOMA_PAGAMENTOS','message','A soma dos pagamentos não corresponde ao valor final.',
      'valor_final',v_valor_final,'total_informado',v_soma,'diferenca',v_valor_final - v_soma);
  end if;

  for v_pg in select * from jsonb_array_elements(p_pagamentos) loop
    select * into v_forma from public.formas_pagamento f where f.id=(v_pg->>'forma_pagamento_id')::uuid and f.ativo;
    if v_forma is null then
      return jsonb_build_object('ok',false,'code','FORMA_INVALIDA','message','Forma de pagamento inválida ou inativa.');
    end if;
    if coalesce((v_pg->>'valor')::numeric,0) <= 0 then
      return jsonb_build_object('ok',false,'code','PAGAMENTO_VALOR','message','Todo pagamento deve ter valor maior que zero.');
    end if;
    v_parc := greatest(coalesce((v_pg->>'parcelas')::integer,1),1);
    if v_parc > 1 and not v_forma.permite_parcelamento then
      return jsonb_build_object('ok',false,'code','PARCELAMENTO_NAO_PERMITIDO',
        'message', format('A forma %s não permite parcelamento.', v_forma.nome));
    end if;
    if v_parc > greatest(v_forma.max_parcelas,1) then
      return jsonb_build_object('ok',false,'code','PARCELAS_ACIMA_LIMITE',
        'message', format('A forma %s permite no máximo %sx.', v_forma.nome, greatest(v_forma.max_parcelas,1)));
    end if;
    if coalesce((v_pg->>'taxa_valor')::numeric,0) < 0 or coalesce((v_pg->>'taxa_valor')::numeric,0) > (v_pg->>'valor')::numeric then
      return jsonb_build_object('ok',false,'code','TAXA_INVALIDA','message','A taxa não pode ser negativa nem maior que o pagamento.');
    end if;
  end loop;

  insert into public.caixa_lancamentos (
    data_lancamento, os, cliente, tipo_receita_id, descricao, tecnico_id,
    responsavel_id, valor_bruto, desconto, receita_liquida, observacao,
    alerta_duplicidade, desconto_autorizacao_id, created_by, updated_by
  ) values (
    p_data, v_os, nullif(btrim(coalesce(p_cliente,'')),''), p_tipo_receita_id,
    nullif(btrim(coalesce(p_descricao,'')),''), p_tecnico_id,
    v_uid, round(p_valor_bruto,2), round(coalesce(p_desconto,0),2), v_valor_final,
    nullif(btrim(coalesce(p_observacao,'')),''),
    (v_os is not null and p_confirmar_duplicidade), p_desconto_autorizacao_id, v_uid, v_uid
  ) returning id into v_id;

  insert into public.caixa_pagamentos (lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor)
  select v_id, (pg->>'forma_pagamento_id')::uuid, round((pg->>'valor')::numeric,2),
         greatest(coalesce((pg->>'parcelas')::integer,1),1),
         round(coalesce((pg->>'taxa_percentual')::numeric,0),2),
         round(coalesce((pg->>'taxa_valor')::numeric,0),2)
    from jsonb_array_elements(p_pagamentos) as pg;

  -- Formas sem liquidação imediata (ex.: Boleto/Bemol) geram conta a receber pendente
  insert into public.contas_receber (
    cliente, os, descricao, origem, competencia, data_emissao, vencimento,
    valor_original, observacao, responsavel_id, created_by, updated_by, caixa_lancamento_id
  )
  select coalesce(nullif(btrim(coalesce(p_cliente,'')),''), 'Cliente não informado'),
         v_os,
         format('%s — recebimento em %s', coalesce(v_os, 'Lançamento de caixa'), f.nome),
         'caixa',
         date_trunc('month', p_data)::date,
         p_data,
         p_data + make_interval(days => greatest(f.prazo_liquidacao_dias,0))::interval,
         round((pg->>'valor')::numeric,2),
         'Gerado automaticamente pelo Caixa Diário: valor faturado ainda não recebido.',
         v_uid, v_uid, v_uid, v_id
    from jsonb_array_elements(p_pagamentos) as pg
    join public.formas_pagamento f on f.id = (pg->>'forma_pagamento_id')::uuid
   where f.liquidacao_imediata = false;
  get diagnostics v_cr = row_count;

  if p_desconto_autorizacao_id is not null then
    update public.descontos_autorizacoes set lancamento_id = v_id, utilizado_em = now()
     where id = p_desconto_autorizacao_id and lancamento_id is null;
  end if;

  perform public.registrar_auditoria('caixa','criar',null,(select to_jsonb(l) from public.caixa_lancamentos l where l.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id,'valor_final',v_valor_final,'contas_receber_geradas',v_cr);
end; $function$;

-- 5) Cancelamento/estorno do lançamento cancela a conta a receber gerada
CREATE OR REPLACE FUNCTION public.caixa_sync_contas_receber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.status in ('cancelado','estornado') and old.status = 'ativo' then
    update public.contas_receber
       set status = 'cancelado',
           cancelado_em = now(),
           motivo_cancelamento = coalesce(motivo_cancelamento, 'Lançamento de caixa de origem cancelado/estornado.')
     where caixa_lancamento_id = new.id
       and status in ('pendente','parcialmente_recebido');
  end if;
  return new;
end; $function$;

DROP TRIGGER IF EXISTS caixa_lancamentos_sync_contas_receber ON public.caixa_lancamentos;
CREATE TRIGGER caixa_lancamentos_sync_contas_receber
  AFTER UPDATE OF status ON public.caixa_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.caixa_sync_contas_receber();

-- 6) Cadastro de colaborador: salário opcional, status e função de entrega
DROP FUNCTION IF EXISTS public.colaboradores_registrar(text, text, uuid, uuid, date, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.colaboradores_registrar(
  p_nome text,
  p_nome_exibicao text DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_setor_id uuid DEFAULT NULL,
  p_data_admissao date DEFAULT NULL,
  p_salario_base numeric DEFAULT 0,
  p_tipo_vinculo text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_status colaborador_status DEFAULT 'ativo',
  p_recebe_comissao_entrega boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_salario numeric(12,2) := round(coalesce(p_salario_base, 0), 2);
  v_entrega boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'criar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para cadastrar colaboradores.');
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    return jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO', 'message', 'Informe o nome do colaborador.');
  end if;
  if p_cargo_id is null then
    return jsonb_build_object('ok', false, 'code', 'CARGO_OBRIGATORIO', 'message', 'Selecione o cargo / função do colaborador.');
  end if;
  if not exists (select 1 from public.cargos c where c.id = p_cargo_id) then
    return jsonb_build_object('ok', false, 'code', 'CARGO_INVALIDO', 'message', 'Cargo não encontrado.');
  end if;
  if p_setor_id is not null and not exists (select 1 from public.setores s where s.id = p_setor_id) then
    return jsonb_build_object('ok', false, 'code', 'SETOR_INVALIDO', 'message', 'Setor não encontrado.');
  end if;
  if v_salario < 0 then
    return jsonb_build_object('ok', false, 'code', 'SALARIO_INVALIDO', 'message', 'O salário base não pode ser negativo.');
  end if;

  select coalesce(p_recebe_comissao_entrega, c.funcao_entrega) into v_entrega
    from public.cargos c where c.id = p_cargo_id;

  insert into public.colaboradores (nome, nome_exibicao, cargo_id, setor_id, data_admissao, tipo_vinculo,
                                    telefone, email, observacao, status, recebe_comissao_entrega, created_by)
  values (btrim(p_nome), nullif(btrim(coalesce(p_nome_exibicao, '')), ''), p_cargo_id,
          coalesce(p_setor_id, (select c.setor_id from public.cargos c where c.id = p_cargo_id)),
          p_data_admissao,
          nullif(btrim(coalesce(p_tipo_vinculo, '')), ''), nullif(btrim(coalesce(p_telefone, '')), ''),
          nullif(btrim(coalesce(p_email, '')), ''), nullif(btrim(coalesce(p_observacao, '')), ''),
          coalesce(p_status, 'ativo'), coalesce(v_entrega, false), v_uid)
  returning id into v_id;

  if v_salario > 0 then
    insert into public.colaborador_salarios (colaborador_id, valor, inicio_vigencia, motivo, created_by)
    values (v_id, v_salario, coalesce(p_data_admissao, (now() at time zone 'America/Manaus')::date),
            'Salário inicial de admissão', v_uid);
  end if;

  perform public.registrar_auditoria('colaboradores', 'criar', null,
    jsonb_build_object('id', v_id, 'nome', btrim(p_nome), 'cargo_id', p_cargo_id, 'salario_base', v_salario));
  return jsonb_build_object('ok', true, 'id', v_id);
end; $function$;

-- 7) Edição também atualiza a marcação de comissão de entrega
DROP FUNCTION IF EXISTS public.colaboradores_atualizar(uuid, text, text, uuid, uuid, date, text, text, text, text);

CREATE OR REPLACE FUNCTION public.colaboradores_atualizar(
  p_id uuid,
  p_nome text,
  p_nome_exibicao text DEFAULT NULL,
  p_cargo_id uuid DEFAULT NULL,
  p_setor_id uuid DEFAULT NULL,
  p_data_admissao date DEFAULT NULL,
  p_tipo_vinculo text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_observacao text DEFAULT NULL,
  p_recebe_comissao_entrega boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_old jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.'); end if;
  if not public.has_permission(v_uid, 'colaboradores', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar colaboradores.');
  end if;
  select to_jsonb(c) into v_old from public.colaboradores c where c.id = p_id;
  if v_old is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Colaborador não encontrado.');
  end if;
  if p_nome is null or btrim(p_nome) = '' then
    return jsonb_build_object('ok', false, 'code', 'NOME_OBRIGATORIO', 'message', 'Informe o nome do colaborador.');
  end if;
  if p_cargo_id is not null and not exists (select 1 from public.cargos c where c.id = p_cargo_id) then
    return jsonb_build_object('ok', false, 'code', 'CARGO_INVALIDO', 'message', 'Cargo não encontrado.');
  end if;

  update public.colaboradores set
    nome = btrim(p_nome),
    nome_exibicao = nullif(btrim(coalesce(p_nome_exibicao, '')), ''),
    cargo_id = p_cargo_id,
    setor_id = p_setor_id,
    data_admissao = p_data_admissao,
    tipo_vinculo = nullif(btrim(coalesce(p_tipo_vinculo, '')), ''),
    telefone = nullif(btrim(coalesce(p_telefone, '')), ''),
    email = nullif(btrim(coalesce(p_email, '')), ''),
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    recebe_comissao_entrega = coalesce(p_recebe_comissao_entrega, recebe_comissao_entrega),
    updated_by = v_uid
  where id = p_id;

  perform public.registrar_auditoria('colaboradores', 'editar', v_old,
    (select to_jsonb(c) from public.colaboradores c where c.id = p_id));
  return jsonb_build_object('ok', true, 'id', p_id);
end; $function$;

-- 8) Entregadores: apenas colaboradores ativos com função de entrega habilitada
CREATE OR REPLACE FUNCTION public.comissao_entrega_entregadores()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'nome', coalesce(c.nome_exibicao, c.nome),
           'cargo', cg.nome,
           'habilitado', true)
           order by coalesce(c.nome_exibicao, c.nome)), '[]'::jsonb)
    from public.colaboradores c
    left join public.cargos cg on cg.id = c.cargo_id
   where c.status = 'ativo'
     and c.recebe_comissao_entrega
     and (public.has_permission(auth.uid(), 'comissao_entrega', 'visualizar')
          or public.has_permission(auth.uid(), 'caixa', 'visualizar'));
$function$;

-- 9) Taxa configurada por parcelamento (usada pelo Caixa)
CREATE OR REPLACE FUNCTION public.forma_pagamento_taxa(p_forma_id uuid, p_parcelas integer DEFAULT 1)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select t.taxa_percentual from public.formas_pagamento_taxas t
      where t.forma_pagamento_id = p_forma_id and t.parcelas = greatest(coalesce(p_parcelas,1),1)),
    (select f.taxa_padrao_percentual from public.formas_pagamento f where f.id = p_forma_id),
    0);
$function$;