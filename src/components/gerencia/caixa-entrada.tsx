import { Link } from "@tanstack/react-router";

import { GERENCIA_BASE, useGerenciaResumo } from "@/lib/gerencia";

/** Caixa de Entrada: fila única de tarefas do gerente, lida dos módulos oficiais. */
export function CaixaEntradaOperacional() {
  const { contadores, isLoading } = useGerenciaResumo();

  const tarefas = [
    {
      label: "Serviços para validar",
      valor: contadores.validacao,
      to: `${GERENCIA_BASE}/validacao-tecnica`,
      fonte: "Produção Técnica",
    },
    {
      label: "Correções técnicas",
      valor: contadores.correcoes,
      to: `${GERENCIA_BASE}/validacao-tecnica`,
      fonte: "Produção Técnica",
    },
    {
      label: "Comissões para liberar",
      valor: contadores.comissoes,
      to: `${GERENCIA_BASE}/comissoes`,
      fonte: "Comissões",
    },
    {
      label: "TVs críticas",
      valor: contadores.criticas,
      to: `${GERENCIA_BASE}/pendencias`,
      fonte: "Pendências",
    },
    {
      label: "TVs sem movimentação",
      valor: contadores.paradas,
      to: `${GERENCIA_BASE}/pendencias`,
      fonte: "Pendências",
    },
    {
      label: "Fechamento semanal pendente",
      valor: contadores.fechamento,
      to: `${GERENCIA_BASE}/fechamento`,
      fonte: "Fechamento",
    },
    {
      label: "Coletas sem motorista",
      valor: contadores.semMotorista,
      to: `${GERENCIA_BASE}/coletas`,
      fonte: "Coletas e Entregas",
    },
    {
      label: "Entregas não realizadas",
      valor: contadores.naoRealizadas,
      to: `${GERENCIA_BASE}/coletas`,
      fonte: "Coletas e Entregas",
    },
  ].filter((t) => t.valor > 0);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Precisa da sua ação
        </p>
        <p className="font-display text-4xl font-bold text-foreground">
          {isLoading ? "…" : contadores.total}
        </p>
        <p className="text-xs text-muted-foreground">
          Tarefas abertas somadas dos módulos oficiais — nada é duplicado aqui.
        </p>
      </section>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando tarefas…</p>
      ) : tarefas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Caixa de entrada vazia. Nenhuma tarefa operacional pendente.
        </p>
      ) : (
        <ul className="space-y-2">
          {tarefas.map((t) => (
            <li key={t.label}>
              <Link
                to={t.to}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 hover:bg-muted/50"
              >
                <span className="font-display text-2xl font-bold text-primary">{t.valor}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">Fonte: {t.fonte}</span>
                </span>
                <span className="text-xs font-semibold text-primary">Abrir</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
