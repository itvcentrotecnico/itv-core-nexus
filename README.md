# GESTAO ITV CENTRO TECNICO

PROMPT 1 — FUNDAÇÃO DO SISTEMA

GESTÃO ITV CENTRO TÉCNICO

Vamos iniciar do zero o desenvolvimento do sistema GESTÃO ITV CENTRO TÉCNICO.

Este será um sistema interno de gestão financeira, operacional e gerencial da ITV Centro Técnico.

IMPORTANTE:

A ITV já utiliza o INFOR OS para:

* cadastro de clientes;
* abertura de Ordem de Serviço;
* controle da televisão;
* diagnóstico;
* orçamento;
* acompanhamento do reparo;
* status do equipamento;
* histórico técnico.

Portanto, NÃO recrie um sistema de Ordem de Serviço.

O novo sistema deverá complementar o INFOR OS, com foco em:

* Caixa Diário;
* faturamento;
* custos com peças;
* comissões;
* despesas;
* contas a pagar;
* contas a receber;
* colaboradores;
* produção;
* metas;
* relatórios;
* indicadores gerenciais;
* rentabilidade.

Nesta primeira etapa, porém, NÃO implemente esses módulos completos.

Quero apenas construir a base sólida do sistema.

⸻

1. NOME DO SISTEMA

Nome principal:

GESTÃO ITV

Subtítulo:

CENTRO TÉCNICO

Nome completo institucional:

GESTÃO ITV CENTRO TÉCNICO

⸻

2. OBJETIVO DESTA PRIMEIRA ETAPA

Construir apenas:

* estrutura visual;
* navegação;
* autenticação;
* usuários;
* perfis;
* permissões;
* banco Supabase;
* segurança;
* Dashboard inicial;
* estrutura das futuras páginas.

Não avançar ainda para funcionalidades financeiras.

⸻

3. STACK

Utilizar:

* React;
* TypeScript;
* Tailwind CSS;
* Supabase PostgreSQL;
* Supabase Auth;
* Supabase Row Level Security;
* Supabase Storage quando necessário.

O Supabase deve ser a fonte oficial dos dados.

Não utilizar banco local como fonte principal.

⸻

4. AUTENTICAÇÃO

Criar tela de login.

Permitir:

* login com e-mail e senha;
* logout;
* persistência de sessão;
* recuperação segura da sessão;
* proteção das páginas privadas.

Fluxo:

Usuário não autenticado:

→ Login

Usuário autenticado:

→ Dashboard

⸻

5. ADMINISTRADOR PRINCIPAL

O administrador principal será:

Caio Fabio

E-mail:

scaiofabio@gmail.com

O usuário deve receber perfil:

Administrador

Não criar a segurança apenas comparando o e-mail no frontend.

A permissão deve existir no banco.

⸻

6. PERFIS INICIAIS

Criar os seguintes perfis:

Administrador

Acesso completo.

Gerente

Acesso gerencial e operacional conforme permissões.

Vendas

Acesso principalmente ao Caixa Diário e áreas comerciais permitidas.

Técnico

Acesso restrito às próprias informações, produção e comissões quando esses módulos forem implementados.

⸻

7. USUÁRIOS INICIAIS DA OPERAÇÃO

Preparar estrutura para cadastrar inicialmente:

Caio Fabio

Função:

Administrador

Daniel

Função:

Especialista de Vendas

Reis

Função:

Gerente de Loja

Não hardcode esses nomes nas regras de negócio.

Eles devem existir como usuários/perfis cadastrados.

⸻

8. ESTRUTURA DE PERMISSÕES

Criar permissões por:

* usuário;
* perfil;
* módulo;
* ação.

Ações futuras que o sistema deve suportar:

* visualizar;
* criar;
* editar;
* aprovar;
* pagar;
* cancelar;
* exportar;
* administrar.

O administrador poderá possuir acesso total.

Outros usuários deverão possuir acesso limitado.

⸻

9. SUPABASE — TABELAS INICIAIS

Nesta primeira fase criar somente as tabelas necessárias para:

* profiles;
* roles;
* permissions;
* user_roles ou estrutura equivalente;
* configurações básicas.

Não criar antecipadamente todas as tabelas financeiras.

Antes de criar qualquer tabela:

analise se realmente é necessária para esta etapa.

⸻

10. ROW LEVEL SECURITY

Ativar RLS nas tabelas relevantes.

Princípio:

deny by default

Usuários devem acessar somente aquilo que estiver autorizado.

Não confiar apenas em esconder botões no frontend.

A segurança deve existir no banco.

⸻

11. LAYOUT PRINCIPAL

Após login, criar estrutura principal contendo:

Desktop

Sidebar lateral fixa.

Header superior.

Área principal de conteúdo.

Mobile

Sidebar vira drawer/menu.

A aplicação deve funcionar corretamente a partir de:

375px

⸻

12. MENU PRINCIPAL

Criar a estrutura do menu com:

* Dashboard
* Caixa Diário
* Peças e Custos
* Comissões
* Despesas
* Financeiro
* Contas a Pagar
* Contas a Receber
* Produção
* Técnicos
* Colaboradores
* Metas
* Entregas
* Logística
* Relatórios
* Configurações

Criar também seção:

Administração

* Usuários
* Permissões
* Auditoria

Nesta primeira etapa, os módulos futuros podem funcionar apenas como páginas placeholder.

⸻

13. CONTROLE DO MENU

O menu deve respeitar as permissões.

Exemplo:

Um técnico não deve visualizar:

* Financeiro;
* folha;
* contas;
* administração;
* usuários;
* permissões.

O administrador poderá visualizar tudo.

⸻

14. DASHBOARD INICIAL

Criar a primeira tela após login.

Título:

Visão Geral

Subtítulo:

Gestão ITV Centro Técnico

Criar estrutura para futuros indicadores:

* Faturamento
* Receita Líquida
* Custo de Peças
* Comissões
* Despesas
* Resultado Operacional
* Ticket Médio
* OS Faturadas
* Meta

IMPORTANTE:

Não inventar números.

Enquanto não houver dados:

mostrar:

R$ 0,00

ou

Sem dados

Nunca preencher com dados fictícios como se fossem reais.

⸻

15. FILTRO DE PERÍODO

Preparar no Dashboard:

* Hoje
* Esta Semana
* Este Mês
* Mês Anterior
* Personalizado

Mesmo que os indicadores ainda não estejam funcionais.

⸻

16. IDENTIDADE VISUAL

A interface deve transmitir:

* Centro Técnico Premium;
* organização;
* tecnologia;
* confiança;
* profissionalismo.

Estilo:

* clean;
* moderno;
* elegante;
* corporativo;
* funcional.

Utilizar como cor institucional principal:

Verde ITV

Mas sem exagero.

Utilizar predominantemente:

* branco;
* cinza claro;
* grafite;
* verde ITV em ações e destaques.

⸻

17. DESIGN

Priorizar:

* ótima legibilidade;
* espaços bem distribuídos;
* navegação simples;
* cards discretos;
* tabelas organizadas;
* botões claros;
* poucos elementos por tela.

Evitar:

* excesso de gradientes;
* excesso de verde;
* animações desnecessárias;
* gráficos decorativos;
* sombras exageradas;
* layout poluído.

⸻

18. RESPONSIVIDADE

O sistema deve funcionar em:

* computador;
* notebook;
* tablet;
* celular.

A operação principal precisa ser confortável em celular.

Não permitir overflow horizontal desnecessário.

⸻

19. TIMEZONE

Timezone oficial da operação:

America/Manaus

Datas e horários apresentados ao usuário devem respeitar o horário de Manaus.

⸻

20. PADRÃO FINANCEIRO FUTURO

Quando os módulos financeiros forem criados:

usar:

NUMERIC / DECIMAL

Nunca utilizar:

FLOAT

Preferência:

NUMERIC(12,2)

Moeda:

BRL — Real Brasileiro.

⸻

21. SEGURANÇA

Nunca:

* expor service_role;
* colocar senha no frontend;
* hardcode credenciais;
* armazenar secrets no código;
* confiar somente no frontend para permissões.

Todas as operações sensíveis deverão futuramente ser validadas no backend/RLS.

⸻

22. NÃO CONSTRUIR AINDA

Não implementar nesta fase:

* Caixa Diário funcional;
* Peças;
* Comissões;
* Despesas;
* Contas;
* Folha;
* Estoque;
* Produção técnica;
* Metas;
* Logística;
* Entregas;
* relatórios financeiros;
* DRE;
* WhatsApp;
* integração com INFOR OS.

Somente preparar as páginas e rotas.

⸻

23. NÃO DUPLICAR O INFOR OS

Não criar:

* abertura de OS;
* diagnóstico;
* orçamento técnico;
* acompanhamento do reparo;
* cadastro completo do televisor;
* portal de acompanhamento do cliente.

Essas funções continuam no INFOR OS.

⸻

24. ROTAS INICIAIS

Criar:

/dashboard

/caixa

/pecas

/comissoes

/despesas

/financeiro

/contas-pagar

/contas-receber

/producao

/tecnicos

/colaboradores

/metas

/entregas

/logistica

/relatorios

/configuracoes

/admin/usuarios

/admin/permissoes

/admin/auditoria

⸻

25. PÁGINAS PLACEHOLDER

Para os módulos ainda não implementados:

mostrar uma página padronizada contendo:

Nome do módulo

Descrição curta

Mensagem:

Módulo em desenvolvimento

Não criar funcionalidades incompletas apenas para preencher a tela.

⸻

26. AUDITORIA — PREPARAÇÃO

Preparar a arquitetura para futuramente registrar:

* usuário;
* data;
* hora;
* módulo;
* ação;
* valor anterior;
* valor novo.

Mas não é necessário desenvolver o sistema completo de auditoria agora.

⸻

27. GITHUB

Preparar o projeto para versionamento.

O código deve poder ser mantido em repositório GitHub privado da ITV.

Não criar dependência que impeça exportar ou manter o código fora do Lovable.

⸻

28. PRINCÍPIO DE INDEPENDÊNCIA

A arquitetura deve permitir que futuramente:

* o frontend seja migrado;
* o código seja utilizado fora do Lovable;
* o banco permaneça no Supabase;
* os dados permaneçam sob controle da ITV.

O Lovable deve ser ferramenta de desenvolvimento.

Não deve ser o único local onde o sistema exista.

⸻

29. GUARDRAILS

Não alterar ou criar funcionalidades fora deste escopo.

Não tentar antecipar módulos futuros.

Não criar banco complexo agora.

Não gerar dados fictícios.

Não reconstruir o INFOR OS.

Não criar lógica financeira antes do módulo correspondente.

Não refatorar partes não relacionadas sem necessidade.

⸻

30. CRITÉRIOS DE ACEITE DESTA FASE

Esta primeira etapa somente estará concluída quando:

* Supabase estiver conectado;
* login funcionar;
* logout funcionar;
* sessão persistir;
* rotas privadas estiverem protegidas;
* estrutura de perfis existir;
* estrutura de permissões existir;
* RLS estiver ativa;
* Admin possuir acesso adequado;
* sidebar funcionar;
* menu respeitar permissões;
* layout funcionar no desktop;
* layout funcionar no mobile;
* Dashboard inicial estiver funcionando;
* páginas futuras estiverem estruturadas;
* nenhum módulo financeiro tiver sido desenvolvido prematuramente.

⸻

31. ENTREGA

Ao concluir esta etapa, apresente um resumo contendo:

Banco

* tabelas criadas;
* relacionamentos;
* políticas RLS.

Usuários

* estrutura de profiles;
* roles;
* permissões.

Interface

* páginas;
* rotas;
* menu;
* Dashboard.

Segurança

* proteção de rotas;
* regras implementadas.

Responsividade

* comportamento desktop;
* comportamento mobile.

Testes

Liste os testes realizados.

Pendências

Informe claramente qualquer item ainda não concluído.

⸻

REGRA FINAL

Não avance automaticamente para o Caixa Diário ou qualquer outro módulo.

Finalize apenas a fundação do GESTÃO ITV CENTRO TÉCNICO e aguarde a próxima solicitação.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://itv-core-nexus.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6c6015ac-fa4e-460c-9123-c80d81831b6b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
