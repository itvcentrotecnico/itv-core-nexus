do $$ declare d text; begin
  d := pg_get_functiondef('public.contas_receber_receber(uuid,date,numeric,uuid,text,text)'::regprocedure);
  d := replace(d, 'valor_bruto, desconto, valor_final, taxas_total, receita_liquida, status,', 'valor_bruto, desconto, taxas_total, receita_liquida, status, liquida_conta_receber_id,');
  d := replace(d, 'round(p_valor, 2), 0, round(p_valor, 2), v_taxa, round(p_valor, 2) - v_taxa, ''ativo'',', 'round(p_valor, 2), 0, v_taxa, round(p_valor, 2) - v_taxa, ''ativo'', p_conta_id,');
  d := replace(d, 'lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor, valor_liquido', 'lancamento_id, forma_pagamento_id, valor, parcelas, taxa_percentual, taxa_valor');
  d := replace(d, 'coalesce(v_forma.taxa_padrao_percentual, 0), v_taxa, round(p_valor, 2) - v_taxa
  );', 'coalesce(v_forma.taxa_padrao_percentual, 0), v_taxa
  );');
  if position('liquida_conta_receber_id' in d) = 0 or position('valor_liquido' in d) > 0 then raise exception 'patch falhou'; end if;
  execute d;
end $$;