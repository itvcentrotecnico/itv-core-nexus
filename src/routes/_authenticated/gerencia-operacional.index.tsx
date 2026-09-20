import { createFileRoute, Link } from "@tanstack/react-router";

import { OperacionalDashboardView } from "@/components/operacional/dashboard";
import { PrecisaDaSuaAcao } from "@/components/gerencia/precisa-acao";
import { GERENCIA_BASE, useGerenciaResumo } from "@/lib/gerencia";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/")({
  component: VisaoGeral,
});

const ACOES = [
  { label: "+ Serviço Terceirizado", to: `${GERENCIA_BASE}/terceirizados`, search: undefined },
  { label: "+ Lançamento no Caixa", to: "/caixa", search: { novo: "1" } },
  { label: "Validar Serviços", to: `${GERENCIA_BASE}/validacao-tecnica`, search: undefined },
  { label: "Liberar Comissões", to: `${GERENCIA_BASE}/comissoes`, search: undefined },
  { label: "Fechar Semana", to: `${GERENCIA_BASE}/fechamento`, search: undefined },
  { label: "Ver TVs Críticas", to: `${GERENCIA_BASE}/pendencias`, search: undefined },
];

function CardValidacao() {
  const { contadores, isLoading } = useGerenciaResumo();
  return (
    <Link
      to={`${GERENCIA_BASE}/validacao-tecnica`}
      className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
    >
      <h2 className="font-display text-sm font-bold text-foreground">Validação Técnica</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Serviços lançados pelos técnicos que dependem da sua conferência.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-primary/5 p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {isLoading ? "…" : contadores.validacao}
          </p>
          <p className="text-xs text-muted-foreground">Aguardando sua validação</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {isLoading ? "…" : contadores.correcoes}
          </p>
          <p className="text-xs text-muted-foreground">Em correção</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {isLoading ? "…" : contadores.validadosHoje}
          </p>
          <p className="text-xs text-muted-foreground">Validados hoje</p>
        </div>
      </div>
    </Link>
  );
}

function CardEstoque() {
  const { contadores, isLoading } = useGerenciaResumo();
  const v = (n: number) => (isLoading ? "…" : n);
  return (
    <Link
      to="/estoque"
      className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
    >
      <h2 className="font-display text-sm font-bold text-foreground">Estoque Técnico</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Solicitações dos técnicos, peças reservadas e saídas do dia.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-lg bg-primary/5 p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.solicitacoesEstoque)}
          </p>
          <p className="text-xs text-muted-foreground">Aguardando análise</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.reservasEstoque)}
          </p>
          <p className="text-xs text-muted-foreground">Reservas ativas</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.reservasAntigas)}
          </p>
          <p className="text-xs text-muted-foreground">Reservas antigas</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.entregasEstoqueHoje)}
          </p>
          <p className="text-xs text-muted-foreground">Entregues hoje</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.baixasEstoqueHoje)}
          </p>
          <p className="text-xs text-muted-foreground">Baixas hoje</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.estoqueAbaixoMinimo)}
          </p>
          <p className="text-xs text-muted-foreground">Abaixo do alerta</p>
        </div>
        <div className="rounded-lg bg-background p-3">
          <p className="font-display text-2xl font-bold text-foreground">
            {v(contadores.divergenciasInventario)}
          </p>
          <p className="text-xs text-muted-foreground">Divergências (30 dias)</p>
        </div>
      </div>
    </Link>
  );
}

function VisaoGeral() {
  return (
    <div className="space-y-4">
      <PrecisaDaSuaAcao />

      <CardValidacao />

      <CardEstoque />


      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Ações rápidas</h2>
        <div className="flex flex-wrap gap-2">
          {ACOES.map((a) => (
            <Link
              key={a.label}
              to={a.to}
              search={a.search as never}
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
