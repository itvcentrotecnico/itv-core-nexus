INSERT INTO public.fornecedores (nome, ativo, categoria, observacao)
SELECT 'EWERTON', true, 'Serviços terceirizados', 'Prestador terceirizado / avulso. Sem acesso ao sistema.'
WHERE NOT EXISTS (SELECT 1 FROM public.fornecedores WHERE upper(nome) = 'EWERTON');

CREATE TEMP TABLE _contas_teste AS
SELECT l.conta_pagar_id AS id FROM public.terceirizados_lotes l
 WHERE l.teste = true AND l.conta_pagar_id IS NOT NULL;

DELETE FROM public.terceirizados_lote_itens i
 USING public.terceirizados_lotes l
 WHERE i.lote_id = l.id AND l.teste = true;

DELETE FROM public.terceirizados_lotes l WHERE l.teste = true;

DELETE FROM public.contas_pagar cp WHERE cp.id IN (SELECT id FROM _contas_teste);

DELETE FROM public.fornecedores f WHERE upper(f.nome) = 'PRESTADOR TESTE (HOMOLOGACAO)';

DROP TABLE _contas_teste;