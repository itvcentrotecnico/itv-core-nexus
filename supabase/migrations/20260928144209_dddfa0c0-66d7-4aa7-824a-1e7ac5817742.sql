do $$ declare d text; begin
  d := pg_get_functiondef('public.caixa_registrar_faturado(date,uuid,numeric,uuid,jsonb,text,text,uuid,numeric,text,date,text,uuid,boolean,uuid)'::regprocedure);
  d := replace(d, 'case when v_n > 1 then v_id::text end', 'case when v_n > 1 then v_id end');
  execute d;
end $$;