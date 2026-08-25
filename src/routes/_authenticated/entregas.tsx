import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/entregas")({
  head: () => ({
    meta: [
      { title: "Entregas — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Gestão das entregas de equipamentos aos clientes." },
      { property: "og:title", content: "Entregas — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Gestão das entregas de equipamentos aos clientes." },
    ],
  }),
  component: entregasPage,
});

function entregasPage() {
  return <ModulePlaceholder title="Entregas" description="Gestão das entregas de equipamentos aos clientes." />;
}
