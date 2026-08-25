import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  Landmark,
  Package,
  Percent,
  Receipt,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão Geral — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content: "Painel gerencial da ITV Centro Técnico com indicadores financeiros e operacionais.",
      },
      { property: "og:title", content: "Visão Geral — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Painel gerencial da ITV Centro Técnico com indicadores financeiros e operacionais.",
      },
    ],
  }),
  component: DashboardPage,
});

type Period = "hoje" | "semana" | "mes" | "mes-anterior" | "personalizado";

const PERIODS: { key: Period; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta Semana" },
  { key: "mes", label: "Este Mês" },
  { key: "mes-anterior", label: "Mês Anterior" },
  { key: "personalizado", label: "Personalizado" },
];

interface KpiDef {
  label: string;
  icon: LucideIcon;
  format: "currency" | "count";
}

const KPIS: KpiDef[] = [
  { label: "Faturamento", icon: Wallet, format: "currency" },
  { label: "Receita Líquida", icon: TrendingUp, format: "currency" },
  { label: "Custo de Peças", icon: Package, format: "currency" },
  { label: "Comissões", icon: Percent, format: "currency" },
  { label: "Despesas", icon: Receipt, format: "currency" },
  { label: "Resultado Operacional", icon: Landmark, format: "currency" },
  { label: "Ticket Médio", icon: ArrowUpCircle, format: "currency" },
  { label: "OS Faturadas", icon: ClipboardList, format: "count" },
  { label: "Meta", icon: Target, format: "currency" },
];

function DashboardPage() {
  const [period, setPeriod] = useState<Period>("mes");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Visão Geral</h1>
          <p className="mt-1 text-sm text-muted-foreground">Gestão ITV Centro Técnico</p>
        </div>

        <div
          role="group"
          aria-label="Filtro de período"
          className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                period === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === "personalizado" && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <label htmlFor="periodo-inicio" className="mb-1 block text-xs font-medium text-muted-foreground">
              De
            </label>
            <input
              id="periodo-inicio"
              type="date"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div>
            <label htmlFor="periodo-fim" className="mb-1 block text-xs font-medium text-muted-foreground">
              Até
            </label>
            <input
              id="periodo-fim"
              type="date"
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {KPIS.map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
              <kpi.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-3 font-display text-2xl font-bold text-card-foreground">
              {kpi.format === "currency" ? "R$ 0,00" : "0"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Sem dados no período</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Os indicadores serão ativados automaticamente quando os módulos financeiros e operacionais
          forem implementados.
        </p>
        <ArrowDownCircle className="mx-auto mt-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}
