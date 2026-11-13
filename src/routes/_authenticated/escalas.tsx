import { createFileRoute } from "@tanstack/react-router";
import { EscalasPage } from "@/components/escalas/escalas-page";
export const Route = createFileRoute("/_authenticated/escalas")({
  head: () => ({
    meta: [
      { title: "Escalas e Jornadas — GESTÃO ITV" },
      {
        name: "description",
        content: "Grade semanal, validação administrativa e publicação das jornadas da equipe ITV.",
      },
      { property: "og:title", content: "Escalas e Jornadas — GESTÃO ITV" },
      {
        property: "og:description",
        content: "Gestão dos horários e cobertura semanal da equipe ITV Manaus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EscalasPage,
});
