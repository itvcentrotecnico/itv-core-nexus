
revoke execute on function public.estoque_buscar(text, text, uuid, text, uuid, text, integer, integer) from anon;
revoke execute on function public.estoque_duplicidade(text, uuid, text, text, text, uuid) from anon;
revoke execute on function public.estoque_item_salvar(jsonb, text[], uuid) from anon;
revoke execute on function public.estoque_marca_salvar(text, boolean, uuid) from anon;
revoke execute on function public.estoque_localizacao_salvar(text, integer, text, boolean, uuid) from anon;
revoke execute on function public.estoque_gaveta_detalhe(uuid) from anon;
revoke execute on function public.estoque_norm(text) from anon;
