import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/tecnicos")({
  head: () => ({
    meta: [
      { title: "Técnicos — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Informações e desempenho dos técnicos da operação." },
      { property: "og:title", content: "Técnicos — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Informações e desempenho dos técnicos da operação." },
    ],
  }),
  component: tecnicosPage,
});

function tecnicosPage() {
  return <ModulePlaceholder title="Técnicos" description="Informações e desempenho dos técnicos da operação." />;
}
