CREATE POLICY "Gerencia envia comprovantes entrega" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'comissao-entrega-comprovantes' AND public.has_permission(auth.uid(),'comissao_entrega','validar'));
CREATE POLICY "Gerencia le comprovantes entrega" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'comissao-entrega-comprovantes' AND public.has_permission(auth.uid(),'comissao_entrega','visualizar'));