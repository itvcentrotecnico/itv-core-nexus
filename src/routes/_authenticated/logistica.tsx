import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/logistica")({
  head: () => ({
    meta: [
      { title: "Logística — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Coordenação da logística de retirada e entrega." },
      { property: "og:title", content: "Logística — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Coordenação da logística de retirada e entrega." },
    ],
  }),
  component: logisticaPage,
});

function logisticaPage() {
  return <ModulePlaceholder title="Logística" description="Coordenação da logística de retirada e entrega." />;
}
