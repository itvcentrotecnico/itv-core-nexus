GRANT SELECT, INSERT, DELETE ON public.producao_fotos TO authenticated;
GRANT ALL ON public.producao_fotos TO service_role;

DROP POLICY IF EXISTS "Dono anexa fotos em rascunho ou correcao" ON public.producao_fotos;
CREATE POLICY "Dono anexa fotos" ON public.producao_fotos
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.producao_tecnica p
  WHERE p.id = producao_fotos.producao_id
    AND p.tecnico_id = auth.uid()
    AND p.status = ANY (ARRAY['rascunho'::producao_status,'correcao_solicitada'::producao_status,'enviado_validacao'::producao_status])
));

DROP POLICY IF EXISTS "Dono remove fotos em rascunho ou correcao" ON public.producao_fotos;
CREATE POLICY "Dono remove fotos" ON public.producao_fotos
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.producao_tecnica p
  WHERE p.id = producao_fotos.producao_id
    AND p.tecnico_id = auth.uid()
    AND p.status = ANY (ARRAY['rascunho'::producao_status,'correcao_solicitada'::producao_status,'enviado_validacao'::producao_status])
));