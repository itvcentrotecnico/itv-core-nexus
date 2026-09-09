import { createFileRoute } from "@tanstack/react-router";

import { EquipeExternaPainel } from "@/components/coletas/equipe-externa";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/equipe-externa")({
  component: EquipeExterna,
});

function EquipeExterna() {
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Localização registrada apenas em expediente (08:00 às 18:00, horário de Manaus) e visível
        somente à gerência autorizada.
      </p>
      <EquipeExternaPainel />
    </div>
  );
}
