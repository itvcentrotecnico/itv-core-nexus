import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/pecas")({
  head: () => ({
    meta: [
      { title: "Peças e Custos — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Controle de custos com peças utilizadas nos reparos." },
      { property: "og:title", content: "Peças e Custos — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Controle de custos com peças utilizadas nos reparos." },
    ],
  }),
  component: pecasPage,
});

function pecasPage() {
  return <ModulePlaceholder title="Peças e Custos" description="Controle de custos com peças utilizadas nos reparos." />;
}
