import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: () => ({
    meta: [
      { title: "Colaboradores — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Gestão dos colaboradores da ITV Centro Técnico." },
      { property: "og:title", content: "Colaboradores — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Gestão dos colaboradores da ITV Centro Técnico." },
    ],
  }),
  component: colaboradoresPage,
});

function colaboradoresPage() {
  return <ModulePlaceholder title="Colaboradores" description="Gestão dos colaboradores da ITV Centro Técnico." />;
}
