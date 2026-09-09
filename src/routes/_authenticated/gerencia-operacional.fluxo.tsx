import { createFileRoute } from "@tanstack/react-router";

import { FluxoTvs } from "@/components/gerencia/fluxo-tvs";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/fluxo")({
  component: FluxoTvs,
});
