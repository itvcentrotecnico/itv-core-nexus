import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/contas-pagar")({
  head: () => ({
    meta: [
      { title: "Contas a Pagar — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Gestão das obrigações e pagamentos programados." },
      { property: "og:title", content: "Contas a Pagar — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Gestão das obrigações e pagamentos programados." },
    ],
  }),
  component: contas_pagarPage,
});

function contas_pagarPage() {
  return <ModulePlaceholder title="Contas a Pagar" description="Gestão das obrigações e pagamentos programados." />;
}
