-- 1) Cadastro central de taxas de recebimento
CREATE TABLE public.taxas_recebimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adquirente text NOT NULL,
  canal text NOT NULL,
  meio_pagamento text NOT NULL,
  modalidade text NOT NULL DEFAULT 'a_vista',
  parcelas integer NOT NULL DEFAULT 1,
  taxa_percentual numeric(7,4) NOT NULL DEFAULT 0,
  taxa_cliente_percentual numeric(7,4) NOT NULL DEFAULT 0,
  responsavel_taxa text NOT NULL DEFAULT 'itv',
  vigencia_inicio date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Manaus')::date,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CONSTRAINT taxas_recebimento_parcelas_ck CHECK (parcelas >= 1 AND parcelas <= 24),
  CONSTRAINT taxas_recebimento_pct_ck CHECK (taxa_percentual >= 0 AND taxa_percentual <= 100),
  CONSTRAINT taxas_recebimento_pct_cli_ck CHECK (taxa_cliente_percentual >= 0 AND taxa_cliente_percentual <= 100),
  CONSTRAINT taxas_recebimento_resp_ck CHECK (responsavel_taxa IN ('itv','cliente')),
  CONSTRAINT taxas_recebimento_meio_ck CHECK (meio_pagamento IN ('pix','debito','credito','saldo','boleto','outros')),
  CONSTRAINT taxas_recebimento_vig_ck CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);

CREATE UNIQUE INDEX taxas_recebimento_unica ON public.taxas_recebimento
  (lower(adquirente), lower(canal), lower(meio_pagamento), parcelas, vigencia_inicio);

GRANT SELECT, INSERT, UPDATE ON public.taxas_recebimento TO authenticated;
GRANT ALL ON public.taxas_recebimento TO service_role;

ALTER TABLE public.taxas_recebimento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados consultam taxas de recebimento"
  ON public.taxas_recebimento FOR SELECT TO authenticated USING (true);

CREATE POLICY "ADM gerencia taxas de recebimento (inserir)"
  ON public.taxas_recebimento FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'adm_financeiro'));

CREATE POLICY "ADM gerencia taxas de recebimento (editar)"
  ON public.taxas_recebimento FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'adm_financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'adm_financeiro'));

CREATE TRIGGER trg_taxas_recebimento_updated
  BEFORE UPDATE ON public.taxas_recebimento
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Meio de pagamento tarifável por forma
ALTER TABLE public.formas_pagamento
  ADD COLUMN IF NOT EXISTS meio_taxa text;

UPDATE public.formas_pagamento SET meio_taxa = 'pix' WHERE lower(nome) = 'pix';
UPDATE public.formas_pagamento SET meio_taxa = 'debito' WHERE lower(nome) LIKE 'd%bito';
UPDATE public.formas_pagamento SET meio_taxa = 'credito' WHERE lower(nome) LIKE 'cr%dito';
UPDATE public.formas_pagamento SET max_parcelas = 18 WHERE lower(nome) LIKE 'cr%dito';

INSERT INTO public.formas_pagamento (nome, ativo, ordem, eh_dinheiro, taxa_padrao_percentual, permite_parcelamento, max_parcelas, liquidacao_imediata, prazo_liquidacao_dias, meio_taxa)
SELECT 'Saldo Mercado Pago', true, 9, false, 0, false, 1, true, 0, 'saldo'
WHERE NOT EXISTS (SELECT 1 FROM public.formas_pagamento WHERE lower(nome) = 'saldo mercado pago');

-- 3) Snapshot da taxa em cada pagamento
ALTER TABLE public.caixa_pagamentos
  ADD COLUMN IF NOT EXISTS adquirente text,
  ADD COLUMN IF NOT EXISTS canal text,
  ADD COLUMN IF NOT EXISTS meio_pagamento text,
  ADD COLUMN IF NOT EXISTS modalidade text,
  ADD COLUMN IF NOT EXISTS taxa_regra_id uuid REFERENCES public.taxas_recebimento(id),
  ADD COLUMN IF NOT EXISTS taxa_vigencia_inicio date,
  ADD COLUMN IF NOT EXISTS responsavel_taxa text,
  ADD COLUMN IF NOT EXISTS taxa_cliente_percentual numeric(7,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_cliente_valor numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_origem text NOT NULL DEFAULT 'sem_taxa',
  ADD COLUMN IF NOT EXISTS taxa_motivo text,
  ADD COLUMN IF NOT EXISTS taxa_definida_por uuid,
  ADD COLUMN IF NOT EXISTS taxa_definida_em timestamptz;

-- 4) Resolvedor oficial da taxa
CREATE OR REPLACE FUNCTION public.taxa_recebimento_resolver(
  p_adquirente text, p_canal text, p_meio text, p_parcelas integer, p_data date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  r public.taxas_recebimento%rowtype;
  v_parc integer := greatest(coalesce(p_parcelas,1),1);
  v_data date := coalesce(p_data, (now() at time zone 'America/Manaus')::date);
begin
  if p_adquirente is null or btrim(p_adquirente) = '' then
    return jsonb_build_object('ok', false, 'code', 'ADQUIRENTE_OBRIGATORIO',
      'message', 'Selecione a adquirente e o canal para calcular a taxa deste pagamento.');
  end if;

  select * into r
    from public.taxas_recebimento t
   where t.ativo
     and lower(t.adquirente) = lower(btrim(p_adquirente))
     and lower(t.canal) = lower(btrim(coalesce(p_canal,'')))
     and lower(t.meio_pagamento) = lower(btrim(coalesce(p_meio,'')))
     and t.parcelas = v_parc
     and t.vigencia_inicio <= v_data
     and (t.vigencia_fim is null or t.vigencia_fim >= v_data)
   order by t.vigencia_inicio desc
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'TAXA_NAO_CONFIGURADA',
      'message', format('Taxa do %s para %s em %sx ainda não está configurada. Solicite a atualização da tabela antes de concluir este lançamento.',
        btrim(p_adquirente), coalesce(nullif(btrim(coalesce(p_canal,'')),''),'canal informado'), v_parc));
  end if;

  return jsonb_build_object(
    'ok', true,
    'regra_id', r.id,
    'adquirente', r.adquirente,
    'canal', r.canal,
    'meio_pagamento', r.meio_pagamento,
    'modalidade', r.modalidade,
    'parcelas', r.parcelas,
    'taxa_percentual', r.taxa_percentual,
    'taxa_cliente_percentual', r.taxa_cliente_percentual,
    'responsavel_taxa', r.responsavel_taxa,
    'vigencia_inicio', r.vigencia_inicio
  );
end; $$;

REVOKE ALL ON FUNCTION public.taxa_recebimento_resolver(text,text,text,integer,date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.taxa_recebimento_resolver(text,text,text,integer,date) TO authenticated;

-- 5) Gravação dos pagamentos com taxa resolvida no banco
CREATE OR REPLACE FUNCTION public.caixa_pagamentos_gravar(
  p_lancamento uuid, p_data date, p_pagamentos jsonb, p_uid uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_pg jsonb; v_forma record; v_parc integer; v_valor numeric(12,2);
  v_res jsonb; v_pct numeric(7,4); v_pct_cli numeric(7,4); v_resp text;
  v_regra uuid; v_vig date; v_origem text; v_mod text; v_meio text;
  v_adq text; v_canal text; v_motivo text; v_taxa numeric(12,2); v_taxa_cli numeric(12,2);
  v_pode_override boolean;
begin
  v_pode_override := public.has_role(p_uid,'administrador') or public.has_role(p_uid,'adm_financeiro');

  for v_pg in select value from jsonb_array_elements(p_pagamentos) loop
    select * into v_forma from public.formas_pagamento f
     where f.id = (v_pg->>'forma_pagamento_id')::uuid and f.ativo;
    if v_forma is null then
      return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Forma de pagamento inválida ou inativa.');
    end if;

    v_parc := greatest(coalesce((v_pg->>'parcelas')::integer,1),1);
    v_valor := round((v_pg->>'valor')::numeric, 2);
    v_meio := v_forma.meio_taxa;
    v_adq := nullif(btrim(coalesce(v_pg->>'adquirente','')),'');
    v_canal := nullif(btrim(coalesce(v_pg->>'canal','')),'');
    v_motivo := nullif(btrim(coalesce(v_pg->>'taxa_motivo','')),'');
    v_pct := 0; v_pct_cli := 0; v_resp := 'itv'; v_regra := null; v_vig := null;
    v_origem := 'sem_taxa'; v_mod := null;

    if v_forma.eh_dinheiro then
      v_adq := null; v_canal := null;
    end if;

    if v_meio is not null and v_adq is not null then
      v_res := public.taxa_recebimento_resolver(v_adq, v_canal, v_meio, v_parc, p_data);
      if not (v_res->>'ok')::boolean then
        return v_res;
      end if;
      v_pct := (v_res->>'taxa_percentual')::numeric;
      v_pct_cli := coalesce((v_res->>'taxa_cliente_percentual')::numeric, 0);
      v_resp := v_res->>'responsavel_taxa';
      v_regra := (v_res->>'regra_id')::uuid;
      v_vig := (v_res->>'vigencia_inicio')::date;
      v_mod := v_res->>'modalidade';
      v_origem := 'automatica';
    end if;

    if (v_pg ? 'taxa_percentual_manual') and nullif(v_pg->>'taxa_percentual_manual','') is not null then
      if not v_pode_override then
        return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO_TAXA',
          'message', 'Somente ADM Financeiro ou Administrador podem ajustar a taxa manualmente.');
      end if;
      if v_motivo is null then
        return jsonb_build_object('ok', false, 'code', 'TAXA_MOTIVO',
          'message', 'Informe o motivo do ajuste manual da taxa.');
      end if;
      v_pct := round((v_pg->>'taxa_percentual_manual')::numeric, 4);
      if v_pct < 0 or v_pct > 100 then
        return jsonb_build_object('ok', false, 'code', 'TAXA_INVALIDA',
          'message', 'A taxa informada deve estar entre 0% e 100%.');
      end if;
      v_resp := 'itv'; v_origem := 'manual';
    end if;

    -- Juros suportados pelo cliente nunca reduzem a receita líquida da ITV
    if v_resp = 'cliente' then
      v_taxa := 0;
      v_taxa_cli := round(v_valor * v_pct / 100, 2);
      v_pct_cli := v_pct;
      v_pct := 0;
    else
      v_taxa := round(v_valor * v_pct / 100, 2);
      v_taxa_cli := round(v_valor * v_pct_cli / 100, 2);
    end if;

    if v_taxa > v_valor then
      return jsonb_build_object('ok', false, 'code', 'TAXA_INVALIDA',
        'message', 'A taxa não pode ser maior que o valor do pagamento.');
    end if;

    insert into public.caixa_pagamentos (
      lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor, valor_liquido,
      adquirente, canal, meio_pagamento, modalidade, taxa_regra_id, taxa_vigencia_inicio,
      responsavel_taxa, taxa_cliente_percentual, taxa_cliente_valor, taxa_origem, taxa_motivo,
      taxa_definida_por, taxa_definida_em
    ) values (
      p_lancamento, v_forma.id, v_valor, v_parc, v_pct, v_taxa, v_valor - v_taxa,
      v_adq, v_canal, v_meio, v_mod, v_regra, v_vig,
      v_resp, v_pct_cli, v_taxa_cli, v_origem, v_motivo,
      case when v_origem = 'manual' then p_uid end,
      case when v_origem = 'manual' then now() end
    );

    if v_origem = 'manual' then
      perform public.registrar_auditoria('caixa', 'taxa_manual', null,
        jsonb_build_object('lancamento_id', p_lancamento, 'forma', v_forma.nome, 'parcelas', v_parc,
                           'valor', v_valor, 'taxa_percentual', v_pct, 'motivo', v_motivo));
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end; $$;

REVOKE ALL ON FUNCTION public.caixa_pagamentos_gravar(uuid,date,jsonb,uuid) FROM public, anon, authenticated;

-- 6) Registrar lançamento usando as taxas oficiais
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
  v_pct numeric; v_lim numeric; v_aut record; v_forma record; v_parc int; v_cr int := 0; v_res jsonb;
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

  for v_pg in select value from jsonb_array_elements(p_pagamentos) loop
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

  v_res := public.caixa_pagamentos_gravar(v_id, p_data, p_pagamentos, v_uid);
  if not (v_res->>'ok')::boolean then
    raise exception using errcode = 'P0001', message = coalesce(v_res->>'message','Não foi possível calcular a taxa de recebimento.'),
      detail = v_res::text;
  end if;

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
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'code', 'TAXA_NAO_CONFIGURADA', 'message', SQLERRM);
end; $function$;

-- 7) Atualizar lançamento usando as taxas oficiais
CREATE OR REPLACE FUNCTION public.caixa_atualizar_lancamento(p_id uuid, p_data date, p_os text DEFAULT NULL::text, p_cliente text DEFAULT NULL::text, p_tipo_receita_id uuid DEFAULT NULL::uuid, p_descricao text DEFAULT NULL::text, p_tecnico_id uuid DEFAULT NULL::uuid, p_valor_bruto numeric DEFAULT NULL::numeric, p_desconto numeric DEFAULT 0, p_observacao text DEFAULT NULL::text, p_pagamentos jsonb DEFAULT '[]'::jsonb, p_confirmar_duplicidade boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_os text := nullif(btrim(coalesce(p_os, '')), '');
  v_antigo public.caixa_lancamentos%rowtype;
  v_valor_final numeric(12,2);
  v_soma numeric(12,2);
  v_dup record;
  v_pg jsonb;
  v_forma record;
  v_parc int;
  v_res jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'NAO_AUTENTICADO', 'message', 'Sua sessão expirou. Entre novamente.');
  end if;
  if not public.has_permission(v_uid, 'caixa', 'editar') then
    return jsonb_build_object('ok', false, 'code', 'SEM_PERMISSAO', 'message', 'Você não tem permissão para editar lançamentos.');
  end if;

  select * into v_antigo from public.caixa_lancamentos l where l.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NAO_ENCONTRADO', 'message', 'Lançamento não encontrado.');
  end if;
  if v_antigo.status <> 'ativo' then
    return jsonb_build_object('ok', false, 'code', 'NAO_EDITAVEL', 'message', 'Somente lançamentos ativos podem ser editados.');
  end if;
  if p_data is null then
    return jsonb_build_object('ok', false, 'code', 'DATA_OBRIGATORIA', 'message', 'Informe a data do lançamento.');
  end if;
  if (public.caixa_periodo_fechado(v_antigo.data_lancamento) or public.caixa_periodo_fechado(p_data))
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'PERIODO_FECHADO', 'message', 'Este lançamento pertence a um período já fechado. Fale com um administrador.');
  end if;
  if p_data > ((now() at time zone 'America/Manaus')::date)
     and not public.has_permission(v_uid, 'caixa', 'administrar') then
    return jsonb_build_object('ok', false, 'code', 'DATA_FUTURA', 'message', 'Não é permitido lançar em data futura.');
  end if;
  if p_tipo_receita_id is null
     or not exists (select 1 from public.tipos_receita t where t.id = p_tipo_receita_id and t.ativo) then
    return jsonb_build_object('ok', false, 'code', 'TIPO_INVALIDO', 'message', 'Selecione o tipo de receita.');
  end if;
  if p_valor_bruto is null or p_valor_bruto <= 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_OBRIGATORIO', 'message', 'Informe o valor bruto.');
  end if;
  if coalesce(p_desconto, 0) < 0 then
    return jsonb_build_object('ok', false, 'code', 'DESCONTO_INVALIDO', 'message', 'O desconto não pode ser negativo.');
  end if;

  v_valor_final := round(p_valor_bruto, 2) - round(coalesce(p_desconto, 0), 2);
  if v_valor_final < 0 then
    return jsonb_build_object('ok', false, 'code', 'VALOR_FINAL_NEGATIVO', 'message', 'O desconto não pode ser maior que o valor bruto.');
  end if;

  if p_tecnico_id is not null
     and not exists (select 1 from public.profiles pr where pr.id = p_tecnico_id and pr.active) then
    return jsonb_build_object('ok', false, 'code', 'TECNICO_INVALIDO', 'message', 'Técnico não encontrado ou inativo.');
  end if;

  if v_os is not null and not p_confirmar_duplicidade then
    select l.id, l.data_lancamento, l.cliente, l.valor_final, pr.full_name as responsavel
      into v_dup
      from public.caixa_lancamentos l
      left join public.profiles pr on pr.id = l.responsavel_id
     where l.os = v_os and l.status = 'ativo' and l.id <> p_id
     order by l.created_at desc
     limit 1;
    if found then
      return jsonb_build_object('ok', false, 'code', 'OS_DUPLICADA',
        'message', 'Atenção — esta OS já possui lançamento financeiro.',
        'existente', jsonb_build_object('os', v_os, 'data', v_dup.data_lancamento, 'cliente', v_dup.cliente,
                                        'valor', v_dup.valor_final, 'responsavel', v_dup.responsavel));
    end if;
  end if;

  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) = 0 then
    return jsonb_build_object('ok', false, 'code', 'PAGAMENTO_OBRIGATORIO', 'message', 'Informe ao menos uma forma de pagamento.');
  end if;

  select coalesce(sum(round((pg ->> 'valor')::numeric, 2)), 0) into v_soma
    from jsonb_array_elements(p_pagamentos) as pg;
  if v_soma <> v_valor_final then
    return jsonb_build_object('ok', false, 'code', 'SOMA_PAGAMENTOS',
      'message', 'A soma dos pagamentos não corresponde ao valor final.',
      'valor_final', v_valor_final, 'total_informado', v_soma, 'diferenca', v_valor_final - v_soma);
  end if;

  for v_pg in select value from jsonb_array_elements(p_pagamentos) loop
    select * into v_forma from public.formas_pagamento f
     where f.id = (v_pg ->> 'forma_pagamento_id')::uuid and f.ativo;
    if v_forma is null then
      return jsonb_build_object('ok', false, 'code', 'FORMA_INVALIDA', 'message', 'Forma de pagamento inválida ou inativa.');
    end if;
    if coalesce((v_pg ->> 'valor')::numeric, 0) <= 0 then
      return jsonb_build_object('ok', false, 'code', 'PAGAMENTO_VALOR', 'message', 'Todo pagamento deve ter valor maior que zero.');
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
  end loop;

  update public.caixa_lancamentos set
    data_lancamento = p_data,
    os = v_os,
    cliente = nullif(btrim(coalesce(p_cliente, '')), ''),
    tipo_receita_id = p_tipo_receita_id,
    descricao = nullif(btrim(coalesce(p_descricao, '')), ''),
    tecnico_id = p_tecnico_id,
    valor_bruto = round(p_valor_bruto, 2),
    desconto = round(coalesce(p_desconto, 0), 2),
    receita_liquida = v_valor_final,
    observacao = nullif(btrim(coalesce(p_observacao, '')), ''),
    alerta_duplicidade = (v_os is not null and p_confirmar_duplicidade),
    updated_by = v_uid
  where id = p_id;

  delete from public.caixa_pagamentos where lancamento_id = p_id;

  v_res := public.caixa_pagamentos_gravar(p_id, p_data, p_pagamentos, v_uid);
  if not (v_res->>'ok')::boolean then
    raise exception using errcode = 'P0001', message = coalesce(v_res->>'message','Não foi possível calcular a taxa de recebimento.');
  end if;

  perform public.registrar_auditoria('caixa', 'editar', to_jsonb(v_antigo),
    (select to_jsonb(l) from public.caixa_lancamentos l where l.id = p_id));

  return jsonb_build_object('ok', true, 'id', p_id, 'valor_final', v_valor_final);
exception when sqlstate 'P0001' then
  return jsonb_build_object('ok', false, 'code', 'TAXA_NAO_CONFIGURADA', 'message', SQLERRM);
end;
$function$;

-- 8) Tabela oficial Mercado Pago (vigência a partir de hoje)
INSERT INTO public.taxas_recebimento (adquirente, canal, meio_pagamento, modalidade, parcelas, taxa_percentual, taxa_cliente_percentual, responsavel_taxa, vigencia_inicio, observacao)
VALUES
  ('Mercado Pago','Point','pix','a_vista',1,0.4900,0,'itv','2026-01-01','Tabela oficial Mercado Pago Point'),
  ('Mercado Pago','Point','debito','a_vista',1,0.9900,0,'itv','2026-01-01','Tabela oficial Mercado Pago Point'),
  ('Mercado Pago','Point','credito','a_vista',1,3.0500,0,'itv','2026-01-01','Tabela oficial Mercado Pago Point'),
  ('Mercado Pago','Point','credito','parcelado_vendedor',2,4.5500,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',3,5.4500,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',4,6.3500,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',5,7.2500,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',6,8.1500,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',7,8.8900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',8,9.7900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',9,10.6900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',10,11.5900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',11,12.4900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',12,13.3900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',14,14.7900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',15,15.6400,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',16,16.4900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',17,17.3400,0,'itv','2026-01-01',null),
  ('Mercado Pago','Point','credito','parcelado_vendedor',18,18.1900,0,'itv','2026-01-01',null),
  ('Mercado Pago','Link','pix','a_vista',1,0.4900,0,'itv','2026-01-01','Link de pagamento'),
  ('Mercado Pago','Link','saldo','a_vista',1,0.0000,0,'itv','2026-01-01','Saldo em conta Mercado Pago'),
  ('Mercado Pago','Link','credito','a_vista',1,3.0500,0,'itv','2026-01-01','Link de pagamento'),
  ('Mercado Pago','Link','credito','parcelado_cliente',18,2.8900,29.9900,'itv','2026-01-01','Taxa da venda paga pela ITV 2,89%; juros de parcelamento 29,99% pagos pelo cliente');