import { createFileRoute } from "@tanstack/react-router";

import { TecnicosPage } from "@/routes/_authenticated/tecnicos";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/producao")({
  component: ProducaoGerencial,
});

/** Consulta gerencial da produção validada — mesma base do módulo de Produção. */
function ProducaoGerencial() {
  return <TecnicosPage abaInicial="equipe" semTitulo />;
}
