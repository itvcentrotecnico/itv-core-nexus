CREATE OR REPLACE FUNCTION public.caixa_pagamentos_gravar(p_lancamento uuid, p_data date, p_pagamentos jsonb, p_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- valor_liquido é coluna gerada pelo banco: nunca informar no insert
    insert into public.caixa_pagamentos (
      lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor,
      adquirente, canal, meio_pagamento, modalidade, taxa_regra_id, taxa_vigencia_inicio,
      responsavel_taxa, taxa_cliente_percentual, taxa_cliente_valor, taxa_origem, taxa_motivo,
      taxa_definida_por, taxa_definida_em
    ) values (
      p_lancamento, v_forma.id, v_valor, v_parc, v_pct, v_taxa,
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
end; $function$;