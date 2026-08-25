import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Definição e acompanhamento das metas da operação." },
      { property: "og:title", content: "Metas — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Definição e acompanhamento das metas da operação." },
    ],
  }),
  component: metasPage,
});

function metasPage() {
  return <ModulePlaceholder title="Metas" description="Definição e acompanhamento das metas da operação." />;
}
