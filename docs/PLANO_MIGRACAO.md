# PLANO DE MIGRAÇÃO GESTÃO ITV

Auditoria de portabilidade do backend (Lovable Cloud → Supabase próprio da ITV).
Nenhuma operação destrutiva foi executada; nenhum dado foi apagado ou alterado.

Data da auditoria: 26/08/2026 · Projeto atual (Lovable Cloud): PostgreSQL + Auth + RLS + Storage.

---

## 1. Inventário do banco atual

| Objeto | Quantidade |
| --- | --- |
| Tabelas (schema `public`) | 51 |
| Views | 4 (`contas_pagar_saldos`, `contas_receber_saldos`, `folha_resumo_colaborador`, `colaboradores_view`) |
| Funções / RPC (`public`) | 139 |
| Triggers de aplicação | 24 (os 5 restantes são internos do Storage, recriados pela própria plataforma) |
| Políticas RLS (`public`) | 98 |
| Políticas RLS (`storage.objects`) | 3 |
| Índices (`public`) | 125 |
| Tipos ENUM | 20 |
| Extensões | `plpgsql`, `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault` |
| Buckets de Storage | 1 — `producao` (privado) |
| Edge Functions | 0 (toda a lógica está em funções SQL `SECURITY DEFINER`) |

RLS está **ativa em 100% das tabelas** e todas possuem `GRANT` para `anon`, `authenticated` e `service_role`.

## 2. Migrations disponíveis

- **31 arquivos** em `supabase/migrations/` (~9.6 mil linhas de SQL), do primeiro schema até a auditoria final de segurança.

Conferência automática banco × migrations:

| Categoria | Resultado |
| --- | --- |
| Tabelas | 51/51 representadas |
| Views | 4/4 representadas |
| Funções | 139/139 representadas |
| Policies `public` | 98/98 representadas |
| Policies `storage.objects` | 3/3 representadas |
| Triggers de aplicação | todos representados |
| Índices | todos representados (os "faltantes" na busca textual são índices automáticos de `UNIQUE` declarado inline) |
| Enums / extensões | representados |

**Única lacuna encontrada:** a criação do bucket `producao` não está em migration (foi criada pela plataforma).
Corrigido com o script novo `supabase/bootstrap/00_storage_bucket.sql`, que deve rodar **antes** das migrations de policies de storage.

Conclusão: com `bootstrap` + as 31 migrations na ordem cronológica, o banco é reconstruído do zero em qualquer Supabase externo.

## 3. Storage

- Bucket `producao`, **privado**, acessado por URL assinada.
- 3 policies em `storage.objects` (upload/leitura/remoção restritas por permissão).
- Objetos armazenados hoje: **0** — nada a copiar nesta etapa. Se houver upload antes do corte, os arquivos precisarão ser baixados e re-enviados.

## 4. Auth

- Método: e-mail/senha, sessão persistida no navegador.
- Usuários hoje: **1** (administrador principal). Nenhum usuário real cadastrado.
- `user_roles` hoje: 1 registro (`administrador`).
- Papéis disponíveis: `administrador`, `gerente`, `vendas`, `tecnico`, `tv_display`.
- Trigger `handle_new_user` cria o `profile` e concede papel de administrador ao e-mail fundador — precisa existir no destino **antes** de criar o primeiro usuário.
- Configurações de Auth (confirmação de e-mail, URLs de redirect, templates, tempo de sessão) **não vivem em migration** e serão reconfiguradas manualmente no novo projeto.

## 5. Variáveis / secrets a recriar

| Variável | Onde | Observação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend (`.env`) | URL do novo projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend (`.env`) | chave publicável do novo projeto |
| `VITE_SUPABASE_PROJECT_ID` | frontend (`.env`) | ref do novo projeto |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | servidor (SSR) | mesmos valores |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | gerada no novo projeto; nunca exposta ao frontend |
| `LOVABLE_CRON_SECRET` / `_PREVIOUS` | plataforma | só usadas pelo helper de cron gerado; hoje sem rota de cron ativa |

Nenhum secret de terceiros (pagamentos, e-mail, IA) está em uso.

## 6. Dados a exportar (CSV)

Cadastros mestres e configuração — obrigatórios para o sistema operar:
`modules`, `role_permissions` (63), `user_permissions`, `user_roles`, `profiles`,
`settings` (8 chaves: organization, identidade, metas, financeiro, custos, planejamento, comissao_entrega, modo_tv),
`formas_pagamento`, `tipos_receita`, `tipos_custo`, `categorias_pecas`, `categorias_financeiras`,
`subcategorias_financeiras`, `centros_custo`, `setores`, `cargos`, `fornecedores`,
`folha_tipos_lancamento`, `tipos_servico_tecnico`, `niveis_desempenho`.

Movimento: as tabelas transacionais (caixa, custos, comissões, financeiro, folha, produção, metas, relatórios) estão **vazias** — o sistema ainda não entrou em operação. `audit_logs` tem 2 registros de teste.

## 7. Arquivos a exportar

- Nenhum arquivo no Storage no momento (bucket `producao` vazio).
- Assets de identidade (logos, favicon) vivem no repositório do frontend — não dependem do backend.

## 8. Pontos de risco

1. **Ordem das migrations**: os arquivos são incrementais e alguns fazem `CREATE OR REPLACE` de funções já existentes. Executar sempre em ordem cronológica, uma única vez, do zero.
2. **Bucket antes das policies**: rodar `supabase/bootstrap/00_storage_bucket.sql` antes das migrations de storage, senão as policies falham.
3. **`SECURITY DEFINER` e owner**: as ~139 funções validam permissão internamente e têm `EXECUTE` revogado nas rotinas internas. No destino, o owner das funções deve ser o mesmo role usado na execução das migrations; conferir os `REVOKE`/`GRANT EXECUTE` ao final.
4. **Extensões**: habilitar `uuid-ossp` e `pgcrypto` no destino antes das migrations.
5. **IDs de usuário**: `profiles.id` referencia `auth.users.id`. Recriar usuários gera novos UUIDs — se algum dado transacional for migrado depois, será preciso remapear responsáveis/técnicos.
6. **Trigger em `auth.users`**: `handle_new_user` toca schema gerenciado; confirmar que foi recriado no destino.
7. **Config de Auth não versionada**: confirmação de e-mail, redirect URLs e templates precisam ser refeitos à mão.
8. **Sem Edge Functions**: vantagem — não há runtime a portar; mas todo o núcleo financeiro depende das funções SQL, que devem ser validadas por smoke test após a migração.

## 9. Dependências específicas do Lovable Cloud

| Item | Impacto na migração |
| --- | --- |
| `src/integrations/supabase/client.ts` | Autogerado; lê `VITE_SUPABASE_*`. Basta trocar as variáveis. |
| `src/integrations/supabase/previewAuthStorage.ts` | Armazenamento de sessão do preview Lovable. Continua funcionando; em produção usa `localStorage`. |
| `src/integrations/supabase/client.server.ts` | Cliente admin via `SUPABASE_SERVICE_ROLE_KEY`. Só troca o secret. |
| `src/integrations/supabase/auth-middleware.ts` / `auth-attacher.ts` | Genéricos do Supabase, sem amarração ao Cloud. |
| `src/integrations/supabase/cron-auth.ts` | Usa `LOVABLE_CRON_SECRET`. Hoje não há rota de cron; pode ser removido ou substituído por um secret próprio. |
| `src/integrations/supabase/types.ts` | Tipos gerados. Regerar contra o novo projeto. |
| `supabase/config.toml` | Contém o `project_id` atual; atualizar. |
| Backup point-in-time / export do Cloud | Passa a ser responsabilidade da ITV no plano Supabase escolhido. |

Nenhuma dependência de runtime proprietário: o backend é Supabase padrão.

## 10. Ordem recomendada de migração

1. Criar o projeto Supabase da ITV (região mais próxima; guardar senha do banco).
2. Habilitar extensões `uuid-ossp` e `pgcrypto`.
3. Rodar `supabase/bootstrap/00_storage_bucket.sql` (cria o bucket privado `producao`).
4. Rodar as 31 migrations em ordem cronológica.
5. Conferir o inventário: 51 tabelas, 4 views, 139 funções, 98 policies, RLS ativa em todas.
6. Configurar Auth: e-mail/senha, política de confirmação, Site URL e Redirect URLs.
7. Importar os cadastros mestres em CSV (seção 6), exceto `profiles`/`user_roles`.
8. Criar o usuário administrador (e-mail fundador) e validar que o papel foi atribuído pelo trigger.
9. Importar `role_permissions` e revisar a matriz em `/admin?aba=perfis`.
10. Apontar o frontend para o novo projeto (seção 11) e regerar os tipos.
11. Smoke test: lançamento piloto no Caixa → custo → comissão → fechamento → cancelamento; upload de foto na Produção; Modo TV.
12. Criar os usuários reais e ativar a operação.

## 11. Checklist para conectar o frontend ao novo Supabase

- [ ] `VITE_SUPABASE_URL` apontando para o novo projeto
- [ ] `VITE_SUPABASE_PUBLISHABLE_KEY` atualizada
- [ ] `VITE_SUPABASE_PROJECT_ID` atualizado
- [ ] `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` (SSR) atualizados
- [ ] `SUPABASE_SERVICE_ROLE_KEY` do novo projeto cadastrada como secret do servidor
- [ ] `supabase/config.toml` com o novo `project_id`
- [ ] `src/integrations/supabase/types.ts` regerado contra o novo banco
- [ ] Site URL e Redirect URLs incluindo o domínio de produção e o preview
- [ ] Login/logout, "Acesso suspenso" e redirecionamento do perfil `tv_display` testados
- [ ] Upload e leitura por URL assinada no bucket `producao` testados
- [ ] Indicadores do Dashboard e Modo TV carregando sem erro de permissão
- [ ] Backup/point-in-time configurado no plano Supabase da ITV

---

**Status:** projeto pronto para portabilidade. Nada foi migrado, apagado ou alterado nesta etapa.
