import { createFileRoute } from "@tanstack/react-router";

import { CaixaEntradaOperacional } from "@/components/gerencia/caixa-entrada";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/caixa-entrada")({
  component: CaixaEntradaOperacional,
});
