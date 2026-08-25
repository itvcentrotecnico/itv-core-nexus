import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Visão financeira consolidada da operação." },
      { property: "og:title", content: "Financeiro — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Visão financeira consolidada da operação." },
    ],
  }),
  component: financeiroPage,
});

function financeiroPage() {
  return <ModulePlaceholder title="Financeiro" description="Visão financeira consolidada da operação." />;
}
