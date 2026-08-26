import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAccess, useSession } from "@/hooks/use-auth";
import logoColor from "@/assets/itv-logo-color.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GESTÃO ITV — Centro Técnico" },
      {
        name: "description",
        content:
          "Sistema interno de gestão financeira, operacional e gerencial da ITV Centro Técnico.",
      },
      { property: "og:title", content: "GESTÃO ITV — Centro Técnico" },
      {
        property: "og:description",
        content:
          "Sistema interno de gestão financeira, operacional e gerencial da ITV Centro Técnico.",
      },
    ],
  }),
  component: Index,
});

/** Porta de entrada: direciona para o Dashboard (autenticado) ou Login. */
function Index() {
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useSession();
  const { roles, isLoading: rolesLoading } = useAccess();

  useEffect(() => {
    if (loading || (isAuthenticated && rolesLoading)) return;
    if (!isAuthenticated) {
      navigate({ to: "/auth", replace: true });
      return;
    }
    // Perfil exclusivo de TV vai direto para o painel de desempenho.
    const somenteTv = roles.includes("tv_display") && !roles.some((r) => r !== "tv_display");
    navigate({ to: somenteTv ? "/modo-tv" : "/dashboard", replace: true });
  }, [isAuthenticated, loading, roles, rolesLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <img
        src={logoColor.url}
        alt="ITV Centro Técnico"
        className="h-14 w-auto animate-pulse"
      />
    </div>
  );
}
