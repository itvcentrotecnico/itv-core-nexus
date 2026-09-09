import { createFileRoute, redirect } from "@tanstack/react-router";

/** Central Operacional foi incorporada pela Gerência Operacional. */
export const Route = createFileRoute("/_authenticated/operacional")({
  beforeLoad: () => {
    throw redirect({ to: "/gerencia-operacional", replace: true });
  },
});
