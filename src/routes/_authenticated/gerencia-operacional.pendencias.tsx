import { createFileRoute } from "@tanstack/react-router";

import { PendenciasOperacionais } from "@/components/gerencia/pendencias";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/pendencias")({
  component: PendenciasOperacionais,
});
