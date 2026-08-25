import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSession } from "@/hooks/use-auth";
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

  useEffect(() => {
    if (loading) return;
    navigate({ to: isAuthenticated ? "/dashboard" : "/auth", replace: true });
  }, [isAuthenticated, loading, navigate]);

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
