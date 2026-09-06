import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { PERIODO_PRESETS, presetRange, type PeriodoPreset } from "@/lib/relatorios";
import { FaturamentoTab } from "@/components/relatorios/faturamento";
import { ProducaoTab } from "@/components/relatorios/producao";
import { TecnicosTab } from "@/components/relatorios/tecnicos";
import { RentabilidadeTab } from "@/components/relatorios/rentabilidade";
import { PlanejamentoTab } from "@/components/relatorios/planejamento";
import { OrigensTab } from "@/components/relatorios/origens";
import { ResumoExecutivoButton } from "@/components/relatorios/executivo";

export const Route = createFileRoute("/_authenticated/relatorios")({
  head: () => ({
    meta: [
      { title: "Relatórios Gerenciais — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content:
          "Faturamento, produção, técnicos, rentabilidade, origem dos clientes e planejamento da ITV.",
      },
      { property: "og:title", content: "Relatórios Gerenciais — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content:
          "Faturamento, produção, técnicos, rentabilidade, origem dos clientes e planejamento da ITV.",
      },
    ],
  }),
  component: RelatoriosPage,
});

type Aba = "faturamento" | "producao" | "tecnicos" | "rentabilidade" | "origens" | "planejamento";

const ABAS: { key: Aba; label: string }[] = [
  { key: "faturamento", label: "Faturamento" },
  { key: "producao", label: "Produção" },
  { key: "tecnicos", label: "Técnicos" },
  { key: "rentabilidade", label: "Rentabilidade" },
  { key: "origens", label: "Origem dos Clientes" },
  { key: "planejamento", label: "Planejamento" },
];

function RelatoriosPage() {
  const { isAdmin, can, isLoading } = useAccess();
  const [preset, setPreset] = useState<PeriodoPreset>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [aba, setAba] = useState<Aba>("faturamento");

  const range = useMemo(() => presetRange(preset, de, ate), [preset, de, ate]);
  const podeVer = isAdmin || can("relatorios", "visualizar");
  const podeExportar = isAdmin || can("relatorios", "exportar");

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (!podeVer) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-dashed border-border bg-card p-10 text-center">
        <h1 className="font-display text-xl font-bold text-foreground">Relatórios Gerenciais</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário não possui acesso a este módulo. Solicite liberação ao administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">Relatórios Gerenciais</h1>
          <p className="text-sm text-muted-foreground">
            Consolidado das fontes oficiais: Caixa, Produção validada, Custos, Comissões e Despesas.
          </p>
        </div>
        {range && <ResumoExecutivoButton range={range} />}
      </header>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {PERIODO_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPreset(p.key)}
              className={cn(
                "h-9 rounded-md border px-3 text-xs font-semibold transition-colors",
                preset === p.key
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === "personalizado" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="rel-de">
                De
              </label>
              <input
                id="rel-de"
                type="date"
                className={inputClass}
                value={de}
                onChange={(e) => setDe(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="rel-ate">
                Até
              </label>
              <input
                id="rel-ate"
                type="date"
                className={inputClass}
                value={ate}
                onChange={(e) => setAte(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {ABAS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAba(a.key)}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              aba === a.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {!range && aba !== "planejamento" ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Selecione as datas inicial e final para ver o relatório.
        </div>
      ) : (
        <>
          {aba === "faturamento" && range && (
            <FaturamentoTab range={range} podeExportar={podeExportar} />
          )}
          {aba === "producao" && range && <ProducaoTab range={range} podeExportar={podeExportar} />}
          {aba === "tecnicos" && range && <TecnicosTab range={range} podeExportar={podeExportar} />}
          {aba === "rentabilidade" && range && (
            <RentabilidadeTab range={range} podeExportar={podeExportar} />
          )}
          {aba === "origens" && range && <OrigensTab range={range} podeExportar={podeExportar} />}
          {aba === "planejamento" && <PlanejamentoTab podeExportar={podeExportar} />}
        </>
      )}
    </div>
  );
}
