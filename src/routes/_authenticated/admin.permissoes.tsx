import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/admin/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Administração das permissões por perfil, módulo e ação." },
      { property: "og:title", content: "Permissões — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Administração das permissões por perfil, módulo e ação." },
    ],
  }),
  component: admin_permissoesPage,
});

function admin_permissoesPage() {
  return <ModulePlaceholder title="Permissões" description="Administração das permissões por perfil, módulo e ação." />;
}
