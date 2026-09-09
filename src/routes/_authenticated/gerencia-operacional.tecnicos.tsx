import { createFileRoute } from "@tanstack/react-router";

import { TecnicosPage } from "@/routes/_authenticated/tecnicos";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/tecnicos")({
  component: TecnicosGerencial,
});

/** Controle operacional por técnico (não é ranking punitivo: metas seguem no módulo Metas). */
function TecnicosGerencial() {
  return <TecnicosPage abaInicial="ranking" semTitulo />;
}
