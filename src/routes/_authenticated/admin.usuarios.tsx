import { createFileRoute } from "@tanstack/react-router";

import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuários — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Administração dos usuários e perfis de acesso do sistema." },
      { property: "og:title", content: "Usuários — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Administração dos usuários e perfis de acesso do sistema." },
    ],
  }),
  component: admin_usuariosPage,
});

function admin_usuariosPage() {
  return <ModulePlaceholder title="Usuários" description="Administração dos usuários e perfis de acesso do sistema." />;
}
