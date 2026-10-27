# Acesso financeiro HML — implementação

## Mecanismo
Endpoint servidor `GET /api/public/integracao-financeiro`, autenticado por `Authorization: Bearer` com segredo `GESTAO_ITV_READ_TOKEN`. O token não é uma conta de funcionário nem uma credencial de banco e não é aceito pela autenticação dos usuários existentes. Nenhuma permissão ou registro operacional existente foi alterado.

O servidor de origem utiliza sua credencial administrativa internamente, somente após autenticar o token, para executar uma única função fixa de leitura `integracao_financeiro_hml_ler`, marcada STABLE. Essa credencial nunca é entregue ao consumidor; a integração não concede acesso administrativo ao HML. Não há SQL dinâmico, nome de tabela, coluna ou função fornecido pelo consumidor.

## Consulta
Parâmetros obrigatórios: `recurso`, `inicio`, `fim` (datas YYYY-MM-DD). Paginação: `offset` (padrão 0) e `limite` (padrão 100, máximo 500). Intervalo máximo 366 dias. Campos/parâmetros não reconhecidos e duplicados são rejeitados.

Recursos: `recebimentos`, `pagamentos`, `formas_pagamento`, `taxas`, `titulos`, `recebimentos_titulos`. Resposta: objeto com recurso, intervalo, paginação e array `dados`; continuar páginas até uma página com menos registros que o limite. Os valores originais não são recalculados nem inseridos novamente no Caixa.

Recebimentos e pagamentos consultam lançamentos com condição `imediato`, preservando status e identificadores para distinguir ativos/cancelados. Títulos são filtrados por emissão; recebimentos de títulos por data do recebimento. Os recebimentos de títulos e seus reflexos no Caixa podem representar o mesmo evento: correlacionar `caixa_lancamento_id` e `liquida_conta_receber_id`, nunca somar ambos como receitas novas. Status, estornos e valores assinados devem ser preservados no consumidor. Formas e taxas são cadastros sem filtro de data.

Sem nomes de clientes, dados de funcionários, observações, descrições livres ou acesso a cadastros operacionais. Documento e nota fiscal são identificadores financeiros; arquivos e códigos de barras de boletos não fazem parte desta consulta.

## Evidências atuais
- 12 testes automatizados da integração passaram: GET autorizado com leitor de teste; POST/PUT/PATCH/DELETE bloqueados antes da leitura; falta de credencial; integração sem configuração; recursos operacionais e RPCs mutáveis recusados; parâmetros arbitrários recusados.
- Consulta HTTP real sem token: 401.
- Função SQL existe, é STABLE e não tem execução concedida a anon/authenticated; somente servidor de origem.
- Página de acesso abre normalmente; compilação sem erros após correção.
- Leitura autenticada real e testes negativos com token real ainda pendentes da configuração segura. Nenhuma escrita foi tentada em registros operacionais.

## Configurar no HML
O adaptador atual do HML usa usuário/senha e Data API: deve ser ajustado para este endpoint, sem usar `GESTAO_ITV_USUARIO`/`GESTAO_ITV_SENHA` de funcionário.
1. Registrar um token compartilhado no formulário seguro da origem e no gerenciamento de segredos do HML, ambos como `GESTAO_ITV_READ_TOKEN`. Gerar uma vez no formulário seguro e copiar somente entre formulários; nunca no chat ou GitHub.
2. No servidor HML, consultar a URL publicada da Gestão ITV acrescida de `/api/public/integracao-financeiro`, com parâmetros acima e token no cabeçalho Authorization. Não fazer a consulta no navegador nem usar variáveis VITE para o segredo.
3. Publicar a versão da origem quando autorizado. A versão publicada anterior não contém este endpoint. Configuração e alterações no HML não podem ser efetuadas pelo snapshot somente leitura disponível nesta conversa.
4. Validar leitura real, bloqueios com token válido e comportamento do consumidor antes de declarar a conexão liberada. Para revogar, substituir/remover o segredo na origem.

Estado: acesso implementado na prévia, ainda não liberado para uso HML. Este documento substitui o impedimento de implementação descrito na inspeção anterior; permanecem configuração do segredo, validação real, publicação e adaptação do consumidor.