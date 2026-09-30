import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
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

import { Link } from "@tanstack/react-router";
import { ClipboardCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ProjecaoMesCard } from "@/components/dashboard/projecao-mes";
import { ContasReceberCard } from "@/components/caixa/boletos";
import { useAccess } from "@/hooks/use-auth";
import { round2, type CaixaIndicadores } from "@/lib/caixa";
import type { CustosIndicadores } from "@/lib/custos";
import type { ComissoesIndicadores } from "@/lib/comissoes";
import type { ProducaoFilaIndicadores } from "@/lib/producao";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, todayManausISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão Geral — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content:
          "Painel gerencial da ITV Centro Técnico com indicadores financeiros e operacionais.",
      },
      { property: "og:title", content: "Visão Geral — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content:
          "Painel gerencial da ITV Centro Técnico com indicadores financeiros e operacionais.",
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

type KpiKey =
  | "faturamento"
  | "liquida"
  | "ticket"
  | "os"
  | "custo-pecas"
  | "custos-diretos"
  | "margem-parcial"
  | "comissoes"
  | "meta";

interface KpiDef {
  label: string;
  icon: LucideIcon;
  format: "currency" | "count";
  /** Indicadores alimentados pelo Caixa e por Peças e Custos; os demais aguardam os próximos módulos. */
  key?: KpiKey;
}

const KPIS: KpiDef[] = [
  { label: "Faturamento", icon: Wallet, format: "currency", key: "faturamento" },
  { label: "Receita Líquida", icon: TrendingUp, format: "currency", key: "liquida" },
  { label: "Custo de Peças", icon: Package, format: "currency", key: "custo-pecas" },
  { label: "Custos Diretos", icon: ArrowDownCircle, format: "currency", key: "custos-diretos" },
  { label: "Margem Parcial", icon: TrendingUp, format: "currency", key: "margem-parcial" },
  { label: "Comissões", icon: Percent, format: "currency", key: "comissoes" },
  { label: "Despesas", icon: Receipt, format: "currency" },
  { label: "Resultado Operacional", icon: Landmark, format: "currency" },
  { label: "Ticket Médio", icon: ArrowUpCircle, format: "currency", key: "ticket" },
  { label: "OS Faturadas", icon: ClipboardList, format: "count", key: "os" },
  { label: "Meta", icon: Target, format: "currency", key: "meta" },
];

function toISO(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`;
}

/** Intervalo do período no timezone da operação (America/Manaus). */
function periodRange(
  period: Period,
  customFrom: string,
  customTo: string,
): { from: string; to: string } | null {
  const todayIso = todayManausISO();
  const [y = 0, m = 1, d = 1] = todayIso.split("-").map(Number);
  const today = new Date(y, m - 1, d);

  switch (period) {
    case "hoje":
      return { from: todayIso, to: todayIso };
    case "semana": {
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      return { from: toISO(monday), to: todayIso };
    }
    case "mes":
      return { from: toISO(new Date(y, m - 1, 1)), to: todayIso };
    case "mes-anterior": {
      return { from: toISO(new Date(y, m - 2, 1)), to: toISO(new Date(y, m - 1, 0)) };
    }
    case "personalizado":
      return customFrom && customTo ? { from: customFrom, to: customTo } : null;
  }
}

function kpiValue(
  kpi: KpiDef,
  ind: CaixaIndicadores | undefined,
  custos: CustosIndicadores | undefined,
  comissoes?: ComissoesIndicadores,
  metaPrincipal?: {
    nome: string;
    realizado: number;
    valor_alvo: number;
    percentual: number;
  } | null,
): { value: string; sub: React.ReactNode } {
  const vazio = {
    value: kpi.format === "currency" ? "R$ 0,00" : "0",
    sub: "Sem dados no período" as React.ReactNode,
  };
  if (!kpi.key) return vazio;

  if (kpi.key === "meta") {
    if (!metaPrincipal) return { value: "—", sub: "Nenhuma meta principal ativa" };
    return {
      value: formatCurrencyBRL(metaPrincipal.realizado),
      sub: `${metaPrincipal.percentual.toFixed(1).replace(".", ",")}% de ${formatCurrencyBRL(metaPrincipal.valor_alvo)} — ${metaPrincipal.nome}`,
    };
  }

  if (kpi.key === "comissoes") {
    if (!comissoes?.ok) return vazio;
    return {
      value: formatCurrencyBRL(comissoes.comissao_gerada),
      sub:
        comissoes.tecnicos_com_comissao === 0
          ? "Sem comissões no período"
          : "Fonte: Comissões Técnicas",
    };
  }

  const deCustos =
    kpi.key === "custo-pecas" || kpi.key === "custos-diretos" || kpi.key === "margem-parcial";
  if (deCustos) {
    if (!custos?.ok) return vazio;
    const receita = custos.receita_liquida_relacionada;
    const mapCustos: Record<string, number> = {
      "custo-pecas": custos.custo_pecas,
      "custos-diretos": custos.custo_total,
      "margem-parcial": round2(receita - custos.custo_total),
    };
    return {
      value: formatCurrencyBRL(mapCustos[kpi.key] ?? 0),
      sub:
        custos.os_com_custos === 0
          ? "Sem custos no período"
          : kpi.key === "margem-parcial"
            ? "Antes das comissões (parcial)"
            : "Fonte: Peças e Custos",
    };
  }

  if (!ind || !ind.ok) return vazio;
  const map: Record<string, number> = {
    faturamento: ind.faturamento_final,
    liquida: ind.receita_liquida,
    ticket: ind.ticket_medio,
    os: ind.os_faturadas,
  };
  const v = map[kpi.key] ?? 0;
  const semClassificacao = round2(ind.receita_sem_classificacao ?? 0);
  return {
    value: kpi.format === "currency" ? formatCurrencyBRL(v) : String(v),
    sub:
      ind.quantidade === 0 ? (
        "Sem lançamentos no período"
      ) : kpi.key === "faturamento" ? (
        <>
          <span className="block">
            Serviços + Acessórios:{" "}
            {formatCurrencyBRL(
              round2((ind.receita_servicos ?? 0) + (ind.receita_acessorios ?? 0)),
            )}
          </span>
          <span className="block">
            Venda de TVs: {formatCurrencyBRL(ind.receita_venda_tv ?? 0)}
          </span>
          {semClassificacao > 0 && (
            <span className="block">Sem categoria: {formatCurrencyBRL(semClassificacao)}</span>
          )}
        </>
      ) : (
        "Fonte: Caixa Diário"
      ),
  };
}

function DashboardPage() {
  const { isAdmin, can } = useAccess();
  const [period, setPeriod] = useState<Period>("mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(
    () => periodRange(period, customFrom, customTo),
    [period, customFrom, customTo],
  );

  const indicadoresQuery = useQuery({
    queryKey: ["dashboard-indicadores", range?.from, range?.to],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_indicadores", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (error) throw error;
      return data as unknown as CaixaIndicadores;
    },
  });

  const comissoesQuery = useQuery({
    queryKey: ["dashboard-comissoes", range?.from, range?.to],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comissoes_indicadores", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (error) throw error;
      return data as unknown as ComissoesIndicadores;
    },
  });

  const custosQuery = useQuery({
    queryKey: ["dashboard-custos", range?.from, range?.to],
    enabled: !!range,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("custos_indicadores", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (error) throw error;
      return data as unknown as CustosIndicadores;
    },
  });

  const veOrigens = isAdmin || can("relatorios", "visualizar") || can("coletas", "visualizar");
  const origensQuery = useQuery({
    queryKey: ["dashboard-origens", range?.from, range?.to],
    enabled: !!range && veOrigens,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rel_origens", {
        p_ini: range!.from,
        p_fim: range!.to,
      });
      if (error) throw error;
      const r = data as unknown as {
        ok: boolean;
        por_origem: { origem: string; clientes: number; faturamento: number }[];
      };
      if (!r.ok) return [];
      return [...(r.por_origem ?? [])]
        .filter((o) => o.origem !== "Não informado")
        .sort((a, b) => b.clientes - a.clientes)
        .slice(0, 3);
    },
  });
  const topOrigens = origensQuery.data ?? [];

  const ehGerencia = isAdmin || can("producao", "validar");
  const veMetas = isAdmin || can("metas", "visualizar");

  const filaProducaoQuery = useQuery({
    queryKey: ["dashboard-producao-fila"],
    enabled: ehGerencia,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("producao_fila_indicadores");
      if (error) throw error;
      return data as unknown as ProducaoFilaIndicadores;
    },
  });

  const metasQuery = useQuery({
    queryKey: ["dashboard-meta-principal", range?.from, range?.to],
    enabled: !!range && veMetas,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("metas_painel", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (error) throw error;
      const painel = data as unknown as {
        ok: boolean;
        metas: {
          id: string;
          nome: string;
          principal: boolean;
          status: string;
          realizado: number;
          valor_alvo: number;
          percentual: number;
          status_projecao: string | null;
          projecao: number | null;
        }[];
      };
      if (!painel.ok) return null;
      const principal =
        painel.metas.find(
          (m) => m.principal && (m.status === "ativa" || m.status === "planejada"),
        ) ??
        painel.metas.find((m) => m.status === "ativa") ??
        null;
      return principal;
    },
  });

  const ind = indicadoresQuery.data;
  const custos = custosQuery.data;
  const comissoes = comissoesQuery.data;
  const filaProducao = filaProducaoQuery.data;
  const metaPrincipal = metasQuery.data;

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
            <label
              htmlFor="periodo-inicio"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              De
            </label>
            <input
              id="periodo-inicio"
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <div>
            <label
              htmlFor="periodo-fim"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Até
            </label>
            <input
              id="periodo-fim"
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
        </div>
      )}

      {ehGerencia && filaProducao && filaProducao.aguardando_validacao > 0 && (
        <Link
          to="/gerencia-operacional/validacao-tecnica"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 transition-colors hover:bg-amber-500/10"
        >
          <div className="flex items-center gap-3">
            <ClipboardCheck className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {filaProducao.aguardando_validacao}{" "}
                {filaProducao.aguardando_validacao === 1 ? "serviço aguarda" : "serviços aguardam"}{" "}
                validação técnica
              </p>
              <p className="text-xs text-muted-foreground">
                Tempo médio em fila: {filaProducao.tempo_medio_fila_horas.toFixed(1)}h — clique para
                abrir a fila
              </p>
            </div>
          </div>
        </Link>
      )}

      {veMetas && metaPrincipal && (
        <Link
          to="/metas"
          className="block rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Meta principal
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">{metaPrincipal.nome}</p>
            </div>
            <div className="text-right">
              <p className="font-display text-lg font-bold text-foreground">
                {metaPrincipal.percentual.toFixed(1).replace(".", ",")}%
              </p>
              <p className="text-[11px] text-muted-foreground">
                {formatCurrencyBRL(metaPrincipal.realizado)} de{" "}
                {formatCurrencyBRL(metaPrincipal.valor_alvo)}
                {metaPrincipal.projecao != null &&
                  ` · projeção ${formatCurrencyBRL(metaPrincipal.projecao)}`}
              </p>
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(metaPrincipal.percentual, 100)}%` }}
            />
          </div>
        </Link>
      )}

      <ProjecaoMesCard />

      <ContasReceberCard />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {KPIS.map((kpi) => {
          const { value, sub } = kpiValue(kpi, ind, custos, comissoes, metaPrincipal);
          return (
            <div key={kpi.label} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
                <kpi.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </div>
              <p className="mt-3 font-display text-2xl font-bold text-card-foreground">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            </div>
          );
        })}
      </div>

      {veOrigens && (
        <Link
          to="/relatorios"
          className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
        >
          <p className="text-sm font-medium text-muted-foreground">Origem dos clientes — período</p>
          {topOrigens.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Sem dados</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {topOrigens.map((o) => (
                <li key={o.origem} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-card-foreground">{o.origem}</span>
                  <span className="text-muted-foreground">
                    {o.clientes} cliente{o.clientes === 1 ? "" : "s"} ·{" "}
                    {formatCurrencyBRL(Number(o.faturamento))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Link>
      )}

      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Despesas e Resultado Operacional são consolidados no módulo Financeiro; a Meta é
          acompanhada no módulo Metas. A Margem Parcial ainda não desconta comissões.
        </p>
        <ArrowDownCircle
          className="mx-auto mt-3 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
