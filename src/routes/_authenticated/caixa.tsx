import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa Diário — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Registro das movimentações diárias de caixa da operação." },
      { property: "og:title", content: "Caixa Diário — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Registro das movimentações diárias de caixa da operação." },
    ],
  }),
  component: caixaPage,
});

function caixaPage() {
  return <ModulePlaceholder title="Caixa Diário" description="Registro das movimentações diárias de caixa da operação." />;
}
