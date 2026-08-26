grant insert, update, delete on public.regras_comissao to authenticated;
create policy regras_comissao_manage on public.regras_comissao for all to authenticated
  using (public.has_permission(auth.uid(), 'comissoes', 'administrar'))
  with check (public.has_permission(auth.uid(), 'comissoes', 'administrar'));