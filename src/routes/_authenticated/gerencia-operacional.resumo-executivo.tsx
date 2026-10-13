import { createFileRoute } from "@tanstack/react-router";

import { ResumoExecutivo } from "@/components/gerencia/resumo-executivo";

const T = "Resumo Executivo Semanal — Gestão ITV";
const D = "Indicadores da semana, desvios, bloqueios, decisões pendentes e as 3 prioridades da operação ITV Manaus.";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/resumo-executivo")({
  head: () => ({
    meta: [
      { title: T },
      { name: "description", content: D },
      { property: "og:title", content: T },
      { property: "og:description", content: D },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResumoExecutivo,
});
