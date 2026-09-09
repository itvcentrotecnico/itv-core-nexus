import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";

import { GERENCIA_BASE, GERENCIA_SUBNAV, useGerenciaResumo } from "@/lib/gerencia";
import { useAccess } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const TITULO = "Gerência Operacional — GESTÃO ITV Centro Técnico";
const DESCRICAO =
  "Centro de comando da operação: validação técnica, comissões, pendências, fluxo de TVs, coletas, equipe externa e fechamento semanal.";

export const Route = createFileRoute("/_authenticated/gerencia-operacional")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GerenciaLayout,
  errorComponent: () => (
    <div
      role="alert"
      className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground"
    >
      Não foi possível abrir a Gerência Operacional agora. Atualize a página e tente novamente.
    </div>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Página não encontrada.</p>
  ),
});

function GerenciaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isAdmin, can } = useAccess();
  const { contadores } = useGerenciaResumo();

  const podeVer = (moduleKey: string) =>
    isAdmin ||
    can(moduleKey, "visualizar") ||
    can(moduleKey, "visualizar_todos") ||
    can(moduleKey, "administrar");

  const itens = GERENCIA_SUBNAV.filter((i) => podeVer(i.moduleKey));
  const atual =
    [...itens].sort((a, b) => b.to.length - a.to.length).find((i) => pathname.startsWith(i.to)) ??
    itens[0];

  return (
    <div className="space-y-4 pb-24">
      <header>
        <nav aria-label="Trilha de navegação" className="text-xs text-muted-foreground">
          <Link to={GERENCIA_BASE} className="hover:text-foreground">
            Gerência Operacional
          </Link>
          {atual && atual.to !== GERENCIA_BASE && (
            <>
              <span aria-hidden="true"> › </span>
              <span className="text-foreground">{atual.label}</span>
            </>
          )}
        </nav>
        <h1 className="font-display text-xl font-bold text-foreground">
          {atual?.to === GERENCIA_BASE ? "Gerência Operacional" : atual?.label}
        </h1>
        <p className="text-sm text-muted-foreground">
          Centro de comando do ADM Operacional: o que precisa de ação, o que validar, o que está
          parado e o que liberar para o Financeiro.
        </p>
      </header>

      <nav
        aria-label="Áreas da Gerência Operacional"
        className="-mx-1 flex gap-1 overflow-x-auto pb-1"
      >
        {itens.map((item) => {
          const contador = item.badge ? contadores[item.badge] : 0;
          const ativo = item.to === atual?.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
                ativo
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {contador > 0 && (
                <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                  {contador}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <Outlet />
    </div>
  );
}
