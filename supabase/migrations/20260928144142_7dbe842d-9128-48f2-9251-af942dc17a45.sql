create or replace function public.clientes_cnpj_salvar(
  p_razao_social text, p_cnpj text, p_nome_fantasia text default null, p_telefone text default null,
  p_email text default null, p_contato text default null, p_observacao text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_cnpj text := regexp_replace(coalesce(p_cnpj,''),'\D','','g'); v_id uuid;
  d int[]; s int; r int; i int;
begin
  if v_uid is null or not (public.has_permission(v_uid,'caixa','criar') or public.has_permission(v_uid,'financeiro','criar')) then
    return jsonb_build_object('ok',false,'code','SEM_PERMISSAO','message','Você não tem permissão para cadastrar empresas.');
  end if;
  if nullif(btrim(coalesce(p_razao_social,'')),'') is null then
    return jsonb_build_object('ok',false,'code','RAZAO_OBRIGATORIA','message','Informe a razão social.');
  end if;
  if length(v_cnpj) <> 14 or v_cnpj ~ '^(\d)\1{13}$' then
    return jsonb_build_object('ok',false,'code','CNPJ_INVALIDO','message','CNPJ inválido.');
  end if;
  d := regexp_split_to_array(v_cnpj,'')::int[];
  s := 0; for i in 1..12 loop s := s + d[i] * (array[5,4,3,2,9,8,7,6,5,4,3,2])[i]; end loop;
  r := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if r <> d[13] then return jsonb_build_object('ok',false,'code','CNPJ_INVALIDO','message','CNPJ inválido (dígito verificador).'); end if;
  s := 0; for i in 1..13 loop s := s + d[i] * (array[6,5,4,3,2,9,8,7,6,5,4,3,2])[i]; end loop;
  r := case when s % 11 < 2 then 0 else 11 - s % 11 end;
  if r <> d[14] then return jsonb_build_object('ok',false,'code','CNPJ_INVALIDO','message','CNPJ inválido (dígito verificador).'); end if;

  select id into v_id from public.clientes_cnpj where cnpj = v_cnpj;
  if v_id is not null then
    update public.clientes_cnpj set
      razao_social = btrim(p_razao_social),
      nome_fantasia = coalesce(nullif(btrim(coalesce(p_nome_fantasia,'')),''), nome_fantasia),
      telefone = coalesce(nullif(btrim(coalesce(p_telefone,'')),''), telefone),
      email_financeiro = coalesce(nullif(btrim(coalesce(p_email,'')),''), email_financeiro),
      contato = coalesce(nullif(btrim(coalesce(p_contato,'')),''), contato),
      observacao = coalesce(nullif(btrim(coalesce(p_observacao,'')),''), observacao),
      updated_at = now()
    where id = v_id;
    perform public.registrar_auditoria('caixa','cliente_cnpj_atualizar',null,(select to_jsonb(c) from public.clientes_cnpj c where c.id=v_id));
    return jsonb_build_object('ok',true,'id',v_id,'existente',true);
  end if;
  insert into public.clientes_cnpj (razao_social, nome_fantasia, cnpj, telefone, email_financeiro, contato, observacao, created_by)
  values (btrim(p_razao_social), nullif(btrim(coalesce(p_nome_fantasia,'')),''), v_cnpj,
          nullif(btrim(coalesce(p_telefone,'')),''), nullif(btrim(coalesce(p_email,'')),''),
          nullif(btrim(coalesce(p_contato,'')),''), nullif(btrim(coalesce(p_observacao,'')),''), v_uid)
  returning id into v_id;
  perform public.registrar_auditoria('caixa','cliente_cnpj_criar',null,(select to_jsonb(c) from public.clientes_cnpj c where c.id=v_id));
  return jsonb_build_object('ok',true,'id',v_id,'existente',false);
end $$;