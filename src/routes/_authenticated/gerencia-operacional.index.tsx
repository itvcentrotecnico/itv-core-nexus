import { createFileRoute, Link } from "@tanstack/react-router";

import { OperacionalDashboardView } from "@/components/operacional/dashboard";
import { PrecisaDaSuaAcao } from "@/components/gerencia/precisa-acao";
import { GERENCIA_BASE } from "@/lib/gerencia";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/")({
  component: VisaoGeral,
});

const ACOES = [
  { label: "+ Serviço Terceirizado", to: `${GERENCIA_BASE}/terceirizados` },
  { label: "Validar Serviços", to: `${GERENCIA_BASE}/validacao-tecnica` },
  { label: "Liberar Comissões", to: `${GERENCIA_BASE}/comissoes` },
  { label: "Fechar Semana", to: `${GERENCIA_BASE}/fechamento` },
  { label: "Ver TVs Críticas", to: `${GERENCIA_BASE}/pendencias` },
];

function VisaoGeral() {
  return (
    <div className="space-y-4">
      <PrecisaDaSuaAcao />

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Ações rápidas</h2>
        <div className="flex flex-wrap gap-2">
          {ACOES.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground transition hover:border-primary/50 hover:bg-muted"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </section>

      <OperacionalDashboardView />
    </div>
  );
}
