import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Apuração e acompanhamento das comissões da equipe." },
      { property: "og:title", content: "Comissões — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Apuração e acompanhamento das comissões da equipe." },
    ],
  }),
  component: comissoesPage,
});

function comissoesPage() {
  return <ModulePlaceholder title="Comissões" description="Apuração e acompanhamento das comissões da equipe." />;
}
