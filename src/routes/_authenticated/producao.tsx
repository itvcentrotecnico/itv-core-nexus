import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/producao")({
  head: () => ({
    meta: [
      { title: "Produção — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Acompanhamento da produção técnica da equipe." },
      { property: "og:title", content: "Produção — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Acompanhamento da produção técnica da equipe." },
    ],
  }),
  component: producaoPage,
});

function producaoPage() {
  return <ModulePlaceholder title="Produção" description="Acompanhamento da produção técnica da equipe." />;
}
