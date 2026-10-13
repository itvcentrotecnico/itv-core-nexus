# Resumo Executivo Semanal — ITV Manaus

Nova área dentro da Gerência Operacional, com indicadores calculados por regras fixas, narrativa redigida por IA (com versão estruturada se a IA falhar), 3 prioridades editáveis e histórico versionado.

## O que o sistema já tem (será reutilizado)

| Tema | Fonte existente | Cobertura |
|---|---|---|
| Leads | Coletas e Entregas (solicitações + origem do cliente) | Parcial: só leads que viraram solicitação de coleta |
| Entradas de TVs | Fechamento Semanal (entradas informadas pela Gerência) | Total semanal, sem por dia |
| Laboratório | Produção técnica (serviços lançados/validados) + Pendências por motivo | Sem as 8 etapas nem histórico de status |
| Logística | Coletas/entregas: agendada, realizada, não realizada, motorista | Boa |
| TVs prontas / bloqueios | Pendências operacionais (motivo, dias na ITV, técnico) | Parcial |
| Metas | Metas da empresa (faturamento de serviços 120/125/130 mil) | Boa |
| Financeiro | Caixa (faturamento por categoria), Boletos a receber | Boa, restrito por permissão |

## O que NÃO existe (fica no INFOR OS)

- Etapas do laboratório (análise, orçamento, aprovado, conserto, aguardando peça, teste, expedição) e o histórico de mudanças.
- Horário de recebimento da TV, envio do orçamento ao cliente → **prazo de 6h não pode ser medido hoje**.
- Vínculo lead → OS → conversão não pode ser calculada com segurança.

Nesses itens o resumo mostra "Dados insuficientes" com a explicação, nunca zero. Não vou recriar OS nem orçamento (regra do projeto).

## O que será construído

1. **Página "Resumo Executivo"** na Gerência Operacional (perfis de gerência/admin):
   - Seletor de semana (corte sábado 13h Manaus) ou intervalo personalizado; início e fim exibidos.
   - Cards com tendência vs. período anterior (diferença absoluta quando a base for zero).
   - Seções: Leads, Entradas, Laboratório, Logística, TVs paradas/bloqueios, Metas, Prazo 6h (com status "configuração pendente").
   - Cada indicador abre a lista de registros que o originaram.
   - Alertas por gravidade com texto (Crítico / Atenção / Informativo).
2. **Decisões pendentes**: registro simples (descrição, responsável opcional, prazo, situação, quem resolveu e quando).
3. **Geração**: botões "Atualizar prévia" (período em andamento) e "Gerar resumo agora" (período encerrado). Cada geração salva uma versão congelada: indicadores, regras usadas e narrativa. Regerar o mesmo período cria v2, preservando v1.
4. **Narrativa com IA**: recebe só os indicadores calculados; estrutura Visão da semana / Desvios / Bloqueios e decisões / Próximos passos / 3 prioridades (ação, evidência, resultado esperado, responsável ou "A definir", prazo ou "Prazo sugerido"). Números citados são conferidos contra os indicadores; se houver número sem suporte ou falha, usa o resumo estruturado automático.
5. **Revisão**: Gerência ajusta as 3 prioridades e marca o relatório como "Revisado".
6. **Histórico** por período/versão + impressão (layout de impressão do navegador).
7. **Configurações**: dia/hora do corte e destinatários internos (avisos só dentro do sistema).
8. **Geração automática no servidor**: sábado 13h Manaus (17h UTC), 1 vez por semana, sem duplicar o mesmo período; registra sucesso/falha e permite "Tentar novamente". Só aparece como "Ativa" depois de confirmar que o agendamento rodou.

## Regras a confirmar com a Gerência

- Metas de 50 leads/dia e R$ 150.000/mês: ficam como **sugestões pendentes**, não vigentes (a meta vigente cadastrada é a de serviços, 120/125/130 mil).
- Prazo 6h: marco inicial (proposta: recebimento da TV), horas corridas ou de expediente — fica "pendente" até haver fonte de horários.

## Detalhes técnicos

- Tabelas novas: `resumos_executivos` (periodo_inicio/fim timestamptz, versao, tipo previa|fechado, status, indicadores jsonb, regras jsonb, narrativa jsonb, prioridades jsonb, origem ia|estruturado, revisado_por/em, gerado_por, unique(periodo_inicio, periodo_fim, versao)), `resumo_execucoes` (log de execução agendada/manual, idempotência por período), `decisoes_pendentes`; config em `settings` chave `resumo_executivo`. RLS por `has_permission('gerencia_operacional', ...)`; financeiro só com permissão financeira.
- RPC SECURITY DEFINER `resumo_executivo_indicadores(p_inicio, p_fim)` reunindo leads/coletas/entregas/pendências/produção/caixa/metas + período anterior equivalente; RPC de detalhamento por indicador.
- Server function `resumo.functions.ts` (requireSupabaseAuth) chama a RPC, gera narrativa via AI Gateway (`openai/gpt-6-astra`, Responses API, saída JSON estrita), valida números e salva a versão.
- Agendamento: rota `src/routes/api/public/resumo-semanal.ts` protegida por segredo, chamada por pg_cron semanal; trava de execução e verificação de período já gerado.
- Testes: limites de período no fuso de Manaus, variação com base zero, validador de números da narrativa.
