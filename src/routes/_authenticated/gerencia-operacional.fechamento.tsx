import { createFileRoute } from "@tanstack/react-router";

import { FechamentoSemanal } from "@/components/operacional/fechamento-semanal";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/fechamento")({
  component: FechamentoPage,
});

function FechamentoPage() {
  return <FechamentoSemanal />;
}
