import { createFileRoute } from "@tanstack/react-router";

import { ColetasPage } from "@/routes/_authenticated/coletas";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/coletas")({
  component: ColetasPage,
});
