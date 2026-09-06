import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { competenciaRange, mesAtual, useMetasPainel } from "@/components/metas/shared";
import { VisaoGeralTab } from "@/components/metas/visao-geral";
import { EmpresaTab } from "@/components/metas/empresa-tab";
import { TecnicosTab } from "@/components/metas/tecnicos-tab";
import { IndicadoresTab, RankingTab } from "@/components/metas/indicadores-ranking";
import { HistoricoTab } from "@/components/metas/historico";
import { TecnicoPainel } from "@/components/metas/tecnico-painel";
import { mensagemErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/metas")({
  head: () => ({
    meta: [
      { title: "Metas e Desempenho — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Metas da empresa e dos técnicos, projeções e indicadores gerenciais da ITV." },
      { property: "og:title", content: "Metas e Desempenho — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Metas da empresa e dos técnicos, projeções e indicadores gerenciais da ITV." },
    ],
  }),
  component: MetasPage,
});

type Aba = "visao" | "empresa" | "tecnicos" | "indicadores" | "ranking" | "historico" | "minha";

const ABAS_GERENCIA: { key: Aba; label: string }[] = [
  { key: "visao", label: "Visão Geral" },
  { key: "empresa", label: "Metas da Empresa" },
  { key: "tecnicos", label: "Técnicos" },
  { key: "indicadores", label: "Indicadores" },
  { key: "ranking", label: "Ranking" },
  { key: "historico", label: "Histórico e Relatórios" },
];

function MetasPage() {
  const { isAdmin, can, profile, isLoading } = useAccess();
  const [mes, setMes] = useState(mesAtual());
  const [aba, setAba] = useState<Aba>("visao");

  const ehGerencia = isAdmin || can("metas", "visualizar") || can("metas", "visualizar_ranking");
  const vePropria = can("metas", "visualizar_propria") || can("producao", "visualizar_propria");
  const range = useMemo(() => competenciaRange(mes), [mes]);
  const painel = useMetasPainel(ehGerencia ? range : null);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  if (!ehGerencia && !vePropria) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <h1 className="font-display text-xl font-bold text-foreground">Metas e Desempenho</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário não possui acesso a este módulo. Solicite liberação ao administrador.
        </p>
      </div>
    );
  }

  const abas = ehGerencia ? ABAS_GERENCIA : [{ key: "minha" as Aba, label: "Minha Meta" }];
  const abaAtiva = ehGerencia ? aba : "minha";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Metas e Desempenho</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Realizado x planejado, projeções e desempenho da equipe — fontes oficiais do sistema.
          </p>
        </div>
        <div>
          <label htmlFor="competencia" className={cn(labelClass, "mb-1 text-xs")}>Competência</label>
          <input
            id="competencia"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={cn(inputClass, "w-auto")}
          />
        </div>
      </div>

      <div role="tablist" aria-label="Áreas de metas" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {abas.map((a) => (
          <button
            key={a.key}
            role="tab"
            aria-selected={abaAtiva === a.key}
            type="button"
            onClick={() => setAba(a.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              abaAtiva === a.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {!range ? (
        <p className="text-sm text-muted-foreground">Selecione uma competência válida.</p>
      ) : abaAtiva === "minha" && profile ? (
        <TecnicoPainel tecnicoId={profile.id} range={range} />
      ) : painel.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando indicadores…</p>
      ) : painel.error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            {mensagemErro(painel.error, "Falha ao carregar metas.")}
          </p>
        </div>
      ) : painel.data ? (
        <>
          {abaAtiva === "visao" && <VisaoGeralTab painel={painel.data} range={range} />}
          {abaAtiva === "empresa" && (
            <EmpresaTab
              painel={painel.data}
              podeCriar={isAdmin || can("metas", "criar")}
              podeEditar={isAdmin || can("metas", "editar")}
              podeEncerrar={isAdmin || can("metas", "encerrar")}
              podeConfigurar={isAdmin || can("metas", "configurar_indicadores")}
            />
          )}
          {abaAtiva === "tecnicos" && (
            <TecnicosTab range={range} podeConfigurar={isAdmin || can("metas", "configurar_metas") || can("producao", "configurar_metas")} />
          )}
          {abaAtiva === "indicadores" && <IndicadoresTab painel={painel.data} />}
          {abaAtiva === "ranking" && <RankingTab range={range} />}
          {abaAtiva === "historico" && <HistoricoTab painel={painel.data} range={range} mes={mes} />}
        </>
      ) : null}
    </div>
  );
}
