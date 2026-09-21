drop policy if exists "Estoque: ver movimentações" on public.estoque_movimentos;
create policy "Estoque: ver movimentações" on public.estoque_movimentos
  for select to authenticated
  using (
    public.has_permission(auth.uid(), 'estoque', 'movimentar')
    or public.has_permission(auth.uid(), 'estoque', 'administrar')
    or public.has_permission(auth.uid(), 'estoque', 'estornar')
    or tecnico_id = auth.uid()
  );

drop policy if exists "Estoque: ver reservas" on public.estoque_reservas;
create policy "Estoque: ver reservas" on public.estoque_reservas
  for select to authenticated
  using (
    public.has_permission(auth.uid(), 'estoque', 'reservar')
    or tecnico_id = auth.uid()
  );