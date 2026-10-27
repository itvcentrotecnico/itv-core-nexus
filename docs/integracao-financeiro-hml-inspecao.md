# Integração financeira HML — inspeção e impedimento

## Estado

Não liberada. Nenhuma identidade ou credencial foi criada. Nenhum dado operacional, política, permissão de usuário ou lógica financeira foi alterado.

## Inspeção realizada

- As seis tabelas do escopo abaixo têm RLS habilitada.
- Caixa utiliza permissões de módulo para leitura e escrita; formas de pagamento têm leitura para usuários autenticados.
- Contas a Receber e seus recebimentos têm leitura concedida ao papel autenticado. A política permissiva `ALL` com `USING true` merece revisão separada: políticas permissivas são combinadas por OR e não garantem isolamento de leitura por módulo. Não foi alterada nesta inspeção.
- O papel `authenticated` pode executar funções financeiras de escrita como `caixa_registrar_lancamento`, `caixa_registrar_faturado` e `contas_receber_receber`; isso não prova autorização interna, mas demonstra que um simples acesso autenticado não equivale a uma credencial sem capacidade de execução dessas funções.
- Não foi encontrado papel técnico dedicado com nome referente a integração/financeiro.
- A autenticação do aplicativo usa token verificado e permissões em banco. Reutilizar um usuário financeiro concederia um escopo diferente do solicitado.

## Impedimento

O acesso de inspeção disponível não pode criar papéis de login. Não foi identificado um mecanismo disponível que provisione uma credencial de banco dedicada, guarde sua senha com segurança e configure o consumidor no outro projeto. O snapshot do ITV FINANCEIRO é somente leitura; não permite cadastrar segredos ou alterar o HML.

Não usar uma credencial `service_role` nem um usuário comum como substituto. Não inserir senhas em migrações. Uma identidade criada sem mecanismo validado de autenticação não atende à entrega.

## Escopo mínimo proposto — ainda não autorizado

Somente os campos abaixo; sem acesso livre às tabelas de origem:

| Origem | Campos propostos |
| --- | --- |
| `caixa_lancamentos` | `id`, `data_lancamento`, `tipo_receita_id`, `grupo_receita`, `valor_bruto`, `desconto`, `valor_final`, `taxas_total`, `receita_liquida`, `status`, `condicao_recebimento`, `liquida_conta_receber_id`, `created_at`, `updated_at` |
| `caixa_pagamentos` | `id`, `lancamento_id`, `forma_pagamento_id`, `valor`, `parcelas`, `taxa_percentual`, `taxa_valor`, `valor_liquido`, `adquirente`, `canal`, `meio_pagamento`, `modalidade`, `taxa_regra_id`, `taxa_vigencia_inicio`, `taxa_cliente_percentual`, `taxa_cliente_valor`, `taxa_origem`, `created_at` |
| `formas_pagamento` | `id`, `nome`, `ativo`, `ordem`, `eh_dinheiro`, `taxa_padrao_percentual`, `tipo`, `permite_parcelamento`, `max_parcelas`, `liquidacao_imediata`, `prazo_liquidacao_dias`, `meio_taxa` |
| `formas_pagamento_taxas` | `id`, `forma_pagamento_id`, `parcelas`, `taxa_percentual`, `created_at`, `updated_at` |
| `contas_receber` | `id`, `origem`, `competencia`, `data_emissao`, `vencimento`, `valor_original`, `status`, `parcela_atual`, `parcela_total`, `grupo_parcela`, `caixa_lancamento_id`, `cliente_cnpj_id`, `documento`, `nota_fiscal`, `renegociado`, `created_at`, `updated_at` |
| `contas_receber_recebimentos` | `id`, `conta_receber_id`, `data_recebimento`, `valor`, `forma_pagamento_id`, `caixa_lancamento_id`, `referencia`, `estorno_de_id`, `created_at` |

Excluir nomes de clientes, descrições livres, observações, dados pessoais de colaboradores e informações operacionais. Identificadores de títulos não equivalem a acesso ao cadastro da empresa. Boletos são títulos financeiros existentes; não se presume disponibilidade de arquivo ou código de barras.

## Resultado dos testes

- Leitura: estrutura, RLS, concessões e funções consultadas com a identidade de inspeção, não com identidade de integração. Teste funcional da integração **não executado**.
- Escrita: nenhuma tentativa em dados reais. Testes negativos com a identidade dedicada **não executados**, pois ela não foi provisionada.
- Fora do escopo e funções mutáveis: **não validados** com identidade dedicada.

## Próximo passo seguro

O snapshot do ITV FINANCEIRO confirma que o adaptador atual espera autenticação por usuário/senha da origem, usando os segredos de servidor `GESTAO_ITV_USUARIO` e `GESTAO_ITV_SENHA`, e consulta a Data API, não uma conexão PostgreSQL. Também espera a view `contas_receber_saldos`, cuja existência foi confirmada; os campos e o isolamento dessa view ainda precisam de validação. A implementação do HML declara que a identidade e a leitura real ainda não foram configuradas. Não preencher esses segredos com uma conta de Administrador, ADM Financeiro ou outro usuário existente.

Definir no projeto ITV FINANCEIRO HML um mecanismo provisionável de autenticação de integração. Preferir acesso mediado exclusivamente de leitura com projeção fixa de campos e credencial própria, ou um papel de banco dedicado quando houver provisionamento seguro disponível. O acesso mediado não pode abrir leitura anônima nem utilizar privilégios administrativos como substituto do isolamento.

Se o mecanismo escolhido usar token compartilhado, registrar `GESTAO_ITV_READ_TOKEN` através de formulário seguro nos dois projetos, gerando-o uma única vez e copiando-o somente entre esses formulários. Guardar apenas no servidor do HML, nunca em variável `VITE_`, código, GitHub, chat ou relatório. Configurar a URL real somente depois de o acesso estar disponível e publicado.

Antes de liberar: testar consulta real, negar INSERT/UPDATE/DELETE e funções mutáveis com a mesma identidade, negar acesso fora do escopo e comprovar preservação das permissões atuais. Revogação deve remover apenas a identidade/credencial da integração.