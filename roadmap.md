# Roadmap

## Concluído
- [x] Estoque Técnico: lançamentos exclusivos da Gerência (permissões, RLS de leitura, telas de permissão, auditoria conferida)

## Aguardando autorização
- [ ] Compra de peças vinculada à OS (Caixa Diário + Estoque Técnico) — plano escrito em .lovable/plan.md

## Integração financeira HML
- [x] Inspecionar autenticação, RLS e escopo financeiro solicitado
- [x] Implementar endpoint isolado e função SQL de leitura fixa sem alterar usuários existentes
- [x] Validar acesso autenticado real e bloqueios na prévia — seis recursos 200, escrita 405, fora do escopo 400, sem token 401; títulos sem registros no período consultado
- [ ] Configurar consumidor HML e disponibilizar versão publicada — requer configuração no projeto Financeiro e publicação
