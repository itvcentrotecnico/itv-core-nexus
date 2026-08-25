import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/admin/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Registro de ações realizadas no sistema para rastreabilidade." },
      { property: "og:title", content: "Auditoria — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Registro de ações realizadas no sistema para rastreabilidade." },
    ],
  }),
  component: admin_auditoriaPage,
});

function admin_auditoriaPage() {
  return <ModulePlaceholder title="Auditoria" description="Registro de ações realizadas no sistema para rastreabilidade." />;
}
