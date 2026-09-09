import { createFileRoute } from "@tanstack/react-router";

import { ServicosTerceirizados } from "@/components/operacional/terceirizados";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/terceirizados")({
  component: ServicosTerceirizados,
});
