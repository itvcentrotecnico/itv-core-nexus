import { createFileRoute } from "@tanstack/react-router";

import { RelatoriosOperacionais } from "@/components/gerencia/relatorios-operacionais";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/relatorios")({
  component: RelatoriosOperacionais,
});
