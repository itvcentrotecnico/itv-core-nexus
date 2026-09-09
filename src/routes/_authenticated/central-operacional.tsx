import { createFileRoute, redirect } from "@tanstack/react-router";

/** Rota antiga preservada: leva para a nova Gerência Operacional. */
export const Route = createFileRoute("/_authenticated/central-operacional")({
  beforeLoad: () => {
    throw redirect({ to: "/gerencia-operacional", replace: true });
  },
});
