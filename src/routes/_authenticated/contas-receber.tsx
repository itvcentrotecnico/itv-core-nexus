import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/contas-receber")({
  head: () => ({
    meta: [
      { title: "Contas a Receber — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Acompanhamento dos valores a receber da operação." },
      { property: "og:title", content: "Contas a Receber — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Acompanhamento dos valores a receber da operação." },
    ],
  }),
  component: contas_receberPage,
});

function contas_receberPage() {
  return <ModulePlaceholder title="Contas a Receber" description="Acompanhamento dos valores a receber da operação." />;
}
