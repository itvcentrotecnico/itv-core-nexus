# Comissão de entrega: R$ 5,00 + bonificação R$ 2,50 com conferência obrigatória

## Regras confirmadas
- Vale imediatamente para todo lançamento novo.
- Entrega normal: R$ 5,00. Entrega + avaliação Google: R$ 5,00 base + R$ 2,50 bonificação **solicitada**, status da bonificação "Aguardando conferência".
- Registros antigos ainda não pagos com avaliação (ex.: setembro, R$ 7,00) são recalculados para R$ 5,00 + R$ 2,50 aguardando conferência. Registros pagos ficam intactos.
- Três valores separados: informado (solicitado) ≠ validado ≠ pago. Financeiro paga somente o validado.

## O que muda
1. **Valores separados por entrega:** valor-base, bonificação solicitada, bonificação validada, total validado e situação da avaliação (Sem avaliação / Aguardando conferência / Validada / Não validada).
2. **Caixa:** ao marcar "Entrega + Avaliação", a tela mostra "R$ 5,00 + R$ 2,50 aguardando conferência". O valor nunca é digitado.
3. **Conferência (nova aba "Conferência de avaliações" em Entregas dos Motoristas, só Gerência):** OS, cliente, data, motorista, base, bonificação, total solicitado, comprovação, situação, responsável e data/hora.
   - **Aprovar avaliação:** escolhe a forma (Google, print, confirmação do cliente, outro), observação e anexo de imagem opcional → R$ 7,50, "Validado".
   - **Não validar:** motivo obrigatório → R$ 5,00 preservados, "Avaliação não validada".
   - Ação em lote para várias entregas.
4. **Trava financeira (no banco):** pagar só é possível depois da conferência; o valor pago é sempre base + bonificação validada. Bonificação aguardando conferência nunca entra no pagamento nem no "a pagar".
5. **Painel de conferência:** entregas, avaliações informadas, validadas, não validadas, aguardando, comissão-base, bonificações validadas, total a pagar e **taxa de conversão** (validadas ÷ entregas × 100), no total e por motorista. Os relatórios "Por entregador" e "Por período" passam a usar o valor validado.
6. **Auditoria:** cada conferência guarda quem, data/hora em Manaus, valor e situação anteriores e finais, em um histórico que não pode ser apagado.

## Detalhes técnicos
- Migração: em `comissoes_entrega`, adicionar `valor_base`, `bonificacao_solicitada`, `bonificacao_validada`, `avaliacao_status` (enum), `conferencia_forma`, `conferencia_obs`, `conferencia_anexo_path`, `conferido_por`, `conferido_em`; manter `valor` como total validado. Tabela `comissoes_entrega_conferencias` (histórico só-inserção, RLS, GRANTs). Bucket privado para anexos.
- Config `comissao_entrega`: `valor_taxa_fixa = 5`, `valor_bonificacao_avaliacao = 2.5`.
- RPCs: `comissao_entrega_conferir(ids, aprovar, forma, obs, anexo)` (has_permission validar, SECURITY DEFINER); ajustar `comissao_entrega_sync_lancamento`, `comissao_entrega_status_alterar` (bloqueia pagar com avaliação aguardando), `comissao_entrega_listar`, `comissao_entrega_relatorio` (novos campos + conversão).
- Backfill: registros não pagos e não cancelados recalculados conforme regra acima.
- Frontend: `comissao-entrega-section.tsx`, `admin/comissao-entrega.tsx`, `routes/_authenticated/comissao-entrega.tsx`, `lib/comissao-entrega.ts`.
- Teste no banco com dados fictícios (desfeitos): solicitar, aprovar, não validar e tentar pagar pendente (deve recusar).
