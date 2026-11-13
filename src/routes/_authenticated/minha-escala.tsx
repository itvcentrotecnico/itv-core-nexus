import { createFileRoute } from "@tanstack/react-router";
import { MinhaEscalaPage } from "@/components/escalas/minha-escala-page";
export const Route = createFileRoute("/_authenticated/minha-escala")({
  head: () => ({
    meta: [
      { title: "Minha Escala — GESTÃO ITV" },
      {
        name: "description",
        content: "Consulta individual de horários, intervalos e folgas publicados pela gestão ITV.",
      },
      { property: "og:title", content: "Minha Escala — GESTÃO ITV" },
      { property: "og:description", content: "Horários e folgas da semana do colaborador ITV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinhaEscalaPage,
});
