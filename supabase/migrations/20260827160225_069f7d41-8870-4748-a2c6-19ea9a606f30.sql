CREATE POLICY "coletas_fotos_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'coletas' AND (public.coletas_pode('concluir') OR public.coletas_pode('editar')));

CREATE POLICY "coletas_fotos_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'coletas' AND public.coletas_pode('visualizar'));

CREATE POLICY "coletas_fotos_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'coletas' AND public.coletas_pode('editar'));