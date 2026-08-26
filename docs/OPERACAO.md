# GESTÃO ITV CENTRO TÉCNICO — Manual de Operação e Go-Live

Sistema interno complementar ao **INFOR OS**. Não substitui e não recria Ordem de
Serviço, diagnóstico, orçamento ou cadastro de televisão — apenas consome o número
da OS como chave de ligação.

## 1. Arquitetura

- **Frontend**: React + TypeScript + Tailwind (TanStack Start / Router).
- **Backend**: Lovable Cloud (PostgreSQL + Auth + RLS + Storage).
- **Timezone oficial**: America/Manaus. **Moeda**: BRL. **Valores**: `NUMERIC(12,2)`.
- Toda regra financeira roda no banco (funções `SECURITY DEFINER` que validam
  permissão internamente). O frontend nunca calcula saldo, comissão ou fechamento.

## 2. Módulos

| Módulo | Rota | Função |
| --- | --- | --- |
| Dashboard | `/dashboard` | Indicadores consolidados do mês |
| Caixa Diário | `/caixa` | Lançamentos, pagamentos múltiplos, fechamento |
| Peças e Custos | `/pecas` | Custos por OS, devoluções, margem parcial |
| Comissões | `/comissoes` | Geração, conferência, aprovação e pagamento |
| Comissão de Entrega | `/comissao-entrega` | Incentivo do entregador (não afeta faturamento) |
| Financeiro | `/financeiro` | Despesas, contas a pagar/receber, fluxo projetado |
| Produção | `/producao` · `/tecnicos` | Registro técnico com validação gerencial |
| Colaboradores | `/colaboradores` | Cadastro, salários, benefícios, folha |
| Metas | `/metas` | Metas de empresa e técnicos, ritmo e projeção |
| Relatórios | `/relatorios` | Histórico, mix de produção, simulador, resumo executivo |
| Administração | `/admin?aba=...` | Usuários, perfis, cadastros, parâmetros, auditoria, backup |
| Modo TV | `/modo-tv` | Painel de gestão à vista (chromeless) |

## 3. Regras críticas (não alterar sem decisão de diretoria)

1. **Caixa** abre automaticamente no primeiro lançamento do dia; fechamento é manual
   e confere dinheiro esperado × informado. Período fechado bloqueia novos lançamentos.
2. **Estorno/cancelamento** nunca apaga registro: gera log auditável e desfaz o impacto.
3. **Comissão técnica** usa receita líquida menos custos diretos confirmados da OS.
4. **Produção técnica** é registro de desempenho — só vira métrica após validação
   gerencial e nunca dispara pagamento automático.
5. **Comissão de entrega** é incentivo operacional; não entra no faturamento nem no
   ticket médio. É cancelada automaticamente se o lançamento do caixa for estornado.
6. **EBITDA** = Receita líquida − Custos − Comissões − Despesas − Folha. Despesa
   vinculada a conta a pagar é contada uma única vez.
7. **Marcas de TV** são normalizadas apenas na leitura (relatórios e Modo TV); o valor
   digitado pelo técnico é preservado.

## 4. Segurança

- RLS ativa em todas as tabelas, *deny by default*.
- Permissões por perfil (`role_permissions`) e por usuário (`user_permissions`),
  resolvidas pela função `has_permission`.
- `usuario_ativo(uuid)`: usuário inativo ou bloqueado perde acesso mesmo com sessão
  antiga — validado no banco (RLS) e no frontend (tela "Acesso suspenso").
- Funções internas de recálculo/sincronização têm `EXECUTE` revogado: não podem ser
  chamadas diretamente por usuários autenticados.
- E-mail de colaboradores só é exposto a Administrador e Gerente.
- Perfil `tv_display` só acessa `/modo-tv`.
- Fotos de produção ficam em bucket privado, acessadas por URL assinada.

## 5. Backup e exportação

- Backup do banco é gerenciado pela plataforma (point-in-time).
- Exportação operacional: `/admin?aba=backup` gera CSV por tabela permitida.
- Auditoria completa (valor anterior × novo): `/admin?aba=auditoria`.

## 6. Checklist de go-live

- [ ] Criar os usuários reais e atribuir perfis em `/admin?aba=usuarios`.
- [ ] Revisar a matriz de permissões por perfil em `/admin?aba=perfis`.
- [ ] Conferir cadastros mestres: formas de pagamento e taxas, tipos de receita,
      tipos de custo, categorias, centros de custo, fornecedores.
- [ ] Cadastrar regras de comissão vigentes por técnico.
- [ ] Cadastrar colaboradores, salários e quem recebe comissão de entrega.
- [ ] Definir metas do mês corrente (empresa e técnicos).
- [ ] Configurar a mensagem institucional do Modo TV.
- [ ] Fazer um lançamento piloto no Caixa, conferir indicadores e cancelá-lo.
- [ ] Realizar o primeiro fechamento de caixa acompanhado.
