import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Configurações gerais do sistema GESTÃO ITV." },
      { property: "og:title", content: "Configurações — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Configurações gerais do sistema GESTÃO ITV." },
    ],
  }),
  component: configuracoesPage,
});

function configuracoesPage() {
  return <ModulePlaceholder title="Configurações" description="Configurações gerais do sistema GESTÃO ITV." />;
}
