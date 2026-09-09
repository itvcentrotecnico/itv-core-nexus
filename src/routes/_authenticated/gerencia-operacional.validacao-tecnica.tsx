import { createFileRoute } from "@tanstack/react-router";

import { FilaValidacao } from "@/components/operacional/fila-validacao";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/validacao-tecnica")({
  component: FilaValidacao,
});
