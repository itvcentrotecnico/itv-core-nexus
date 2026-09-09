import { createFileRoute } from "@tanstack/react-router";

import { ComissoesOperacional } from "@/components/operacional/comissoes-operacional";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/comissoes")({
  component: ComissoesTecnicas,
});

/** Conferência e liberação das comissões. O pagamento continua no Financeiro. */
function ComissoesTecnicas() {
  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Serviço validado → comissão gerada → conferência aqui → liberação para o Financeiro. O
        pagamento é feito pelo Financeiro, com os mesmos registros.
      </p>
      <ComissoesOperacional />
    </div>
  );
}
