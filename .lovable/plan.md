# Compra de peças vinculada à OS — Caixa Diário + Estoque Técnico

Hoje o Caixa Diário registra apenas entradas (recebimentos). As compras ficam no Financeiro (despesas) e em Peças e Custos por OS. Este ajuste cria a **saída operacional** no Caixa, com destino da compra, vínculo real com a OS e rastreio até o Estoque Técnico — sem duplicar valor financeiro e sem recriar o que já existe.

## 1. Destino da compra

Novo campo obrigatório quando a categoria for de peças (Kit de LED, Placa Main, Compra de Peças, Material Técnico):

- **Para uma OS** → número da OS obrigatório
- **Para estoque** → OS fica vazia, nunca exigida

Nenhum número fictício é aceito para conseguir salvar.

## 2. Formulário de saída

Categoria*, Destino da compra*, OS* (só quando "Para uma OS"), Descrição da peça*, Valor*, Forma de pagamento*, Fornecedor, Documento/NF, Comprovante, Observação, Responsável (automático).

## 3. Caixa Diário

- Nova aba **Saídas**, no mesmo padrão visual das abas atuais, listando: data, tipo (Entrada/Saída), categoria, descrição, OS, valor, forma de pagamento e responsável.
- Qualquer usuário com acesso ao Caixa vê a linha completa da saída, inclusive valor e OS.
- **Busca por OS**: digitar `3521` retorna todas as movimentações daquela OS — recebimentos (+) e compras (−) lado a lado.

## 4. Visibilidade

| Item | Quem vê |
| --- | --- |
| Linha individual da movimentação (valor, OS, forma) | todos com acesso ao Caixa |
| Totais de saídas/despesas, resultado, margem, custos consolidados, gastos por fornecedor/categoria, rentabilidade | somente Gerências autorizadas |

A separação é aplicada nas telas **e** nas regras do banco (não basta esconder botão).

## 5. Rastreio compra → estoque → OS

Cada compra ganha status de recebimento:

```text
Compra registrada -> Aguardando recebimento -> Recebida -> Entrada no estoque -> Baixa na OS
```

- Compra para estoque: ao confirmar o recebimento, o sistema oferece **Dar entrada no estoque**, já vinculada à compra.
- Compra para OS entregue direto ao técnico: permite **uso direto na OS**, sem criar estoque artificial, mantendo o rastro.
- O valor financeiro é registrado **uma única vez** (na compra). A baixa da peça é movimentação física com custo atribuído — nunca gera nova saída no Caixa.

## 6. Visão gerencial da OS (restrita)

Painel consolidado por OS para as Gerências: receita, compras vinculadas, outros custos diretos, comissões e resultado da OS. Não visível a Técnico/Vendedor sem permissão.

## Detalhes técnicos

- **Banco:** estender `despesas` com `destino_compra` (`os` | `estoque`), `os_numero`, `status_recebimento` (`nao_aplica` | `aguardando` | `recebido` | `uso_direto`), `forma_pagamento_id` e `documento`. Trigger de validação garante OS preenchida quando destino = `os` e vazia quando destino = `estoque`. Índice em `os_numero`.
- **Vínculo estoque:** coluna `despesa_id` em `estoque_movimentos`, preenchida na entrada/baixa originada de uma compra; RPC `compra_receber_estoque` (entrada) e `compra_uso_direto` (baixa direta na OS) em transação única, idempotentes.
- **Permissões:** nova ação `saidas` no módulo `caixa` (ver/registrar a linha) separada de `financeiro:visualizar` (consolidados). RPCs de agregação continuam exigindo permissão gerencial; RPC de listagem da linha exige apenas `caixa:visualizar`.
- **RPCs novas:** `caixa_saidas_listar(p_from, p_to, p_busca)`, `caixa_os_movimentos(p_os)` (entradas + saídas da OS, sem consolidado), `os_resultado(p_os)` (restrita às Gerências).
- **Frontend:** `src/lib/caixa-saidas.ts` (tipos/helpers), `src/components/caixa/saidas.tsx` (lista + formulário + recebimento), nova aba em `src/routes/_authenticated/caixa.tsx`, busca por OS reaproveitando o padrão de filtros atual. Visão de resultado da OS em Gerência Operacional.
- **Sem duplicidade:** a baixa de estoque vinculada a `despesa_id` nunca cria `custos_os` com desembolso; apenas custo atribuído para a rentabilidade.

## Testes

1. Compra Kit de LED, destino "Para uma OS", OS 3521, R$ 180 → movimentação criada, OS vinculada em campo próprio, linha visível no Caixa.
2. Compra Kit de LED, destino "Para estoque", R$ 1.250 → salva sem OS, oferece entrada no estoque.
3. Busca `3521` → retorna recebimento e compra da OS.
4. Usuário sem permissão gerencial → vê a linha, não vê totais/margem/resultado.
5. Entrada no estoque a partir da compra e baixa na OS → nenhum valor financeiro duplicado.

Dados fictícios de teste são removidos ao final, com relatório de conferência.
