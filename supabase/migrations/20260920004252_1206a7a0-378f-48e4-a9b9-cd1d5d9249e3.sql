-- gavetas LED até 30 (idempotente)
INSERT INTO public.estoque_localizacoes (grupo, numero, codigo, descricao)
SELECT 'LED', n, 'LED-G' || lpad(n::text, 2, '0'), 'LED — Gaveta ' || lpad(n::text, 2, '0')
  FROM generate_series(1, 30) n
 WHERE NOT EXISTS (SELECT 1 FROM public.estoque_localizacoes l WHERE l.grupo = 'LED' AND l.numero = n);

-- motivo saldo de abertura + lote no movimento
ALTER TABLE public.estoque_movimentos DROP CONSTRAINT estoque_movimentos_motivo_check;
ALTER TABLE public.estoque_movimentos ADD CONSTRAINT estoque_movimentos_motivo_check
  CHECK (motivo = ANY (ARRAY['uso_os','defeito_perda','devolucao_fornecedor','transferencia','ajuste_inventario','entrada_inicial','entrada_compra','estorno','devolucao_tecnico','saldo_abertura']));
ALTER TABLE public.estoque_movimentos ADD COLUMN IF NOT EXISTS lote text;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_lote ON public.estoque_movimentos (lote);

-- custo pode ser "não informado"
ALTER TABLE public.estoque_itens ALTER COLUMN custo_unitario DROP NOT NULL;
ALTER TABLE public.estoque_itens ALTER COLUMN custo_unitario DROP DEFAULT;
ALTER TABLE public.estoque_movimentos ALTER COLUMN custo_unitario DROP NOT NULL;
ALTER TABLE public.estoque_movimentos ALTER COLUMN custo_unitario DROP DEFAULT;

-- conferência de gaveta (inventário físico)
CREATE TABLE IF NOT EXISTS public.estoque_inventarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  localizacao_id uuid NOT NULL REFERENCES public.estoque_localizacoes(id),
  item_id uuid NOT NULL REFERENCES public.estoque_itens(id) ON DELETE RESTRICT,
  quantidade_sistema integer NOT NULL,
  quantidade_contada integer NOT NULL CHECK (quantidade_contada >= 0),
  diferenca integer NOT NULL,
  observacao text,
  conferido_por uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.estoque_inventarios TO authenticated;
GRANT ALL ON public.estoque_inventarios TO service_role;
ALTER TABLE public.estoque_inventarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estoque_inv_select" ON public.estoque_inventarios FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'estoque', 'visualizar'));
CREATE POLICY "estoque_inv_insert" ON public.estoque_inventarios FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(auth.uid(), 'estoque', 'movimentar'));
CREATE TRIGGER update_estoque_inventarios_updated_at BEFORE UPDATE ON public.estoque_inventarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_estoque_inv_loc ON public.estoque_inventarios (localizacao_id, created_at DESC);