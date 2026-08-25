import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Relatórios gerenciais e operacionais da ITV." },
      { property: "og:title", content: "Relatórios — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Relatórios gerenciais e operacionais da ITV." },
    ],
  }),
  component: relatoriosPage,
});

function relatoriosPage() {
  return <ModulePlaceholder title="Relatórios" description="Relatórios gerenciais e operacionais da ITV." />;
}
