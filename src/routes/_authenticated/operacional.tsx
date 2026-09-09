import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComissoesOperacional } from "@/components/operacional/comissoes-operacional";
import { OperacionalDashboardView } from "@/components/operacional/dashboard";
import { FechamentoSemanal } from "@/components/operacional/fechamento-semanal";
import { FilaValidacao } from "@/components/operacional/fila-validacao";
import { HistoricoOperacional } from "@/components/operacional/historico";
import { ServicosTerceirizados } from "@/components/operacional/terceirizados";

const TITULO = "Central Operacional — GESTÃO ITV Centro Técnico";
const DESCRICAO =
  "Controle do fluxo de TVs, validação da produção técnica, liberação de comissões e fechamento semanal do centro técnico.";

export const Route = createFileRoute("/_authenticated/operacional")({
  head: () => ({
    meta: [
      { title: TITULO },
      { name: "description", content: DESCRICAO },
      { property: "og:title", content: TITULO },
      { property: "og:description", content: DESCRICAO },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OperacionalPage,
});

function OperacionalPage() {
  const [aba, setAba] = useState("visao");
  const [motivoFiltro, setMotivoFiltro] = useState<string | undefined>();

  return (
    <div className="space-y-4 pb-24">
      <header>
        <h1 className="font-display text-xl font-bold text-foreground">Central Operacional</h1>
        <p className="text-sm text-muted-foreground">
          Camada de controle do Gerente Operacional: fluxo das TVs, validação técnica, comissões e
          fechamento semanal.
        </p>
      </header>

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="validacao">Validação</TabsTrigger>
          <TabsTrigger value="comissoes">Comissões</TabsTrigger>
          <TabsTrigger value="terceirizados">Serviços terceirizados</TabsTrigger>
          <TabsTrigger value="fechamento">Fechamento</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="mt-4">
          <OperacionalDashboardView
            onIrPara={(destino) => setAba(destino)}
            onEstoque={(motivo) => {
              setMotivoFiltro(motivo);
              setAba("fechamento");
            }}
          />
        </TabsContent>
        <TabsContent value="validacao" className="mt-4">
          <FilaValidacao />
        </TabsContent>
        <TabsContent value="comissoes" className="mt-4">
          <ComissoesOperacional />
        </TabsContent>
        <TabsContent value="terceirizados" className="mt-4">
          <ServicosTerceirizados />
        </TabsContent>
        <TabsContent value="fechamento" className="mt-4">
          {motivoFiltro && (
            <button
              type="button"
              className="mb-3 text-xs font-semibold text-primary"
              onClick={() => setMotivoFiltro(undefined)}
            >
              Limpar filtro de motivo
            </button>
          )}
          <FechamentoSemanal motivoFiltro={motivoFiltro} />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <HistoricoOperacional />
        </TabsContent>
      </Tabs>
    </div>
  );
}
