# CNPJ / Boletos / Contas a Receber integrados ao Caixa Diário

## O que já existe (e será reaproveitado)
- `contas_receber` já nasce do lançamento do Caixa (Boleto/Bemol) com `caixa_lancamento_id`, parcelas, vencimento, responsável, cancelamento e `contas_receber_recebimentos`.
- O lançamento do Caixa já guarda a Categoria da Receita (Serviços/Acessórios/TVs) — é ele que conta no Faturamento e na Meta, na data da venda.
- Nada de estrutura paralela: o Caixa vira a interface operacional do mesmo título financeiro.

## Regra central
```text
Venda faturada (data da venda) -> Faturamento + Categoria + Meta (se Serviços)
                                -> Conta a Receber (vencimento)
Confirmar recebimento (data real) -> Entrada financeira do dia (caixa físico/recebimentos)
                                  -> NÃO soma de novo no Faturamento nem na Meta
```

## O que será construído
1. **Cadastro de empresas CNPJ** (reutilizável, CNPJ único e validado): Razão Social, Fantasia, CNPJ, WhatsApp, e-mail financeiro, contato, observações.
2. **No formulário de lançamento**: "Condição de recebimento" = Imediato ou Faturado / Boleto. No boleto: buscar/cadastrar empresa, emissão, 1 ou mais boletos (vencimento + valor + nº documento), NF opcional, responsável pelo acompanhamento (padrão: quem lança). Soma dos boletos obrigatoriamente = valor faturado.
3. **Confirmar recebimento** (total ou parcial): data real, valor, forma efetiva (PIX, dinheiro, etc.), observação. Gera a entrada do dia no Caixa como "Recebimento de Boleto" reaproveitando empresa/OS/categoria — marcada como liquidação, fora do Faturamento e da Meta.
4. **Status automáticos**: A receber, Vence hoje, Vencido (com dias de atraso), Recebido parcialmente, Recebido, Cancelado, Renegociado.
5. **Alterar vencimento** (Gerência): guarda anterior/novo/motivo/usuário/hora. **Cancelar** só com motivo; bloqueado se já houver recebimento (exige estorno).
6. **Aba "Boletos / A receber" no Caixa Diário**: cards A receber, Vence hoje, Vencem em 7 dias, Vencidos, Recebidos no mês; lista com empresa, CNPJ, OS, categoria, valor, emissão, vencimento, status, dias, responsável, ações; filtros por status, categoria, empresa, responsável, período. Layout de cartões no celular.
7. **Alertas** 5, 3, 1 dia antes, no dia e após vencer — um por título por dia, no sino/painel do responsável e da Gerência, com botões Ver título / Confirmar recebimento.
8. **Dashboard**: card "Contas a Receber" (total, próximos 7 dias, vencido) respeitando permissões.
9. **Caixa do dia**: separar "Receitas faturadas" de "Recebimentos do dia"; boleto não recebido não entra no dinheiro esperado.
10. **Auditoria** completa (America/Manaus) e permissões atuais mantidas — nenhuma ampliação automática.

## Testes
Cenário "TESTE CNPJ LTDA" (CNPJ fictício), Serviço R$ 10.000 em 28/09, vencimento 15/10: Serviços +10.000, Meta +10.000, A receber 10.000, recebido 0 → recebimento: Caixa +10.000, A receber 0, Serviços/Meta inalterados. Também parcial (5.000 → 3.000 + saldo 2.000), 3 boletos somando o total, TV por boleto fora da Meta. Tudo desfeito ao final.

## Detalhes técnicos
- Nova tabela `clientes_cnpj` (cnpj unique, RLS por permissão caixa/financeiro, GRANTs); `contas_receber` ganha `cliente_cnpj_id`, `documento`, `nota_fiscal`, `data_recebimento_final` e histórico `contas_receber_vencimentos`; novo status `renegociado` no enum.
- `caixa_lancamentos` ganha `condicao_recebimento` ('imediato'|'faturado') e `liquida_conta_receber_id` (entrada de liquidação). `caixa_indicadores`, `metas_realizado`, `metas_evolucao`, relatórios e Modo TV passam a excluir lançamentos de liquidação (evita contar duas vezes). Caixa físico conta só o efetivamente recebido.
- RPCs: `cr_faturar` (dentro do registrar lançamento, atômico), `cr_confirmar_recebimento`, `cr_alterar_vencimento`, `cr_cancelar`, `cr_painel`, `cr_alertas`; status derivado por data Manaus; alertas em tabela com unique(conta, dia, tipo).
- Frontend: `src/components/caixa/boletos.tsx`, ajuste em `lancamento-form.tsx`, aba em `caixa.tsx`, card em `dashboard.tsx`.
