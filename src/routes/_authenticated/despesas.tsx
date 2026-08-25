import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/despesas")({
  head: () => ({
    meta: [
      { title: "Despesas — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Gestão das despesas operacionais do centro técnico." },
      { property: "og:title", content: "Despesas — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Gestão das despesas operacionais do centro técnico." },
    ],
  }),
  component: despesasPage,
});

function despesasPage() {
  return <ModulePlaceholder title="Despesas" description="Gestão das despesas operacionais do centro técnico." />;
}
