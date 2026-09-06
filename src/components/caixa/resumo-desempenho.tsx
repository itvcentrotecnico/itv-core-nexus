/**
 * RESUMO DE FATURAMENTO do Caixa Diário.
 * Lê exclusivamente a RPC oficial `caixa_desempenho`, que agrega os mesmos
 * lançamentos ativos usados pelo caixa (valor_final). Nenhuma regra financeira nova.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { MetaEmpresaDetalhe } from "@/lib/metas";

export interface CaixaAgg {
  inicio: string;
  fim: string;
  faturamento: number;
  bruto: number;
  descontos: number;
  taxas: number;
  liquida: number;
  quantidade: number;
  ticket: number;
  os_qtd: number;
  os_valor: number;
  ticket_os: number;
}

export interface CaixaEvolucaoItem extends CaixaAgg {
  mes: string;
  parcial: boolean;
}

export interface CaixaDesempenho {
  ok: boolean;
  code?: string;
  referencia: string;
  hoje: CaixaAgg;
  semana: CaixaAgg;
  semana_anterior: CaixaAgg;
  mes: CaixaAgg;
  mes_ate_hoje: CaixaAgg;
  mes_anterior: CaixaAgg;
  mes_anterior_mesmo_periodo: CaixaAgg;
  evolucao: CaixaEvolucaoItem[];
  meta: MetaEmpresaDetalhe | null;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function labelMes(mes: string): string {
  const [y, m] = mes.split("-");
  const idx = Number(m) - 1;
  return `${MESES[idx] ?? m}/${(y ?? "").slice(2)}`;
}

function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return atual > 0 ? null : 0;
  return ((atual - anterior) / anterior) * 100;
}

/** Indicador discreto de variação — nunca depende só de cor. */
export function Variacao({
  atual,
  anterior,
  sufixo,
}: {
  atual: number;
  anterior: number;
  sufixo?: string;
}) {
  const v = variacao(atual, anterior);
  if (v === null) {
    return (
      <span className="text-[11px] text-muted-foreground">
        sem base de comparação{sufixo ? ` ${sufixo}` : ""}
      </span>
    );
  }
  const estavel = Math.abs(v) < 0.05;
  const Icon = estavel ? Minus : v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium",
        estavel ? "text-muted-foreground" : v > 0 ? "text-primary" : "text-destructive",
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {`${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`}
      {sufixo && <span className="font-normal text-muted-foreground">{sufixo}</span>}
    </span>
  );
}

function CardSkeleton() {
  return <div className="h-32 animate-pulse rounded-xl border border-border bg-card" />;
}

export function ResumoDesempenho({
  dataRef: refDate,
  podeVerFinanceiro,
}: {
  dataRef: string;
  podeVerFinanceiro: boolean;
}) {
  const [meses, setMeses] = useState(6);
  const [modoMes, setModoMes] = useState<"mesmo_periodo" | "completo">("mesmo_periodo");

  const query = useQuery({
    queryKey: ["caixa", "desempenho", refDate, meses],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_desempenho", {
        p_ref: refDate,
        p_meses: meses,
      });
      if (error) throw error;
      return data as unknown as CaixaDesempenho;
    },
  });

  const d = query.data;

  const evolucao = useMemo(() => {
    const lista = d?.evolucao ?? [];
    return lista.map((item, i) => {
      const ant = lista[i - 1];
      return {
        ...item,
        label: labelMes(item.mes),
        variacaoPct:
          ant && ant.faturamento
            ? ((item.faturamento - ant.faturamento) / ant.faturamento) * 100
            : null,
      };
    });
  }, [d]);

  if (query.isLoading) {
    return (
      <section
        aria-label="Resumo de faturamento"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </section>
    );
  }

  if (query.isError || !d?.ok) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-sm">
        <p className="text-muted-foreground">Não foi possível carregar este comparativo.</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Tentar novamente
        </button>
      </div>
    );
  }

  const mesReferencia = modoMes === "mesmo_periodo" ? d.mes_ate_hoje : d.mes;
  const mesComparado = modoMes === "mesmo_periodo" ? d.mes_anterior_mesmo_periodo : d.mes_anterior;
  const meta = d.meta;

  return (
    <section aria-label="Resumo de faturamento" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Resumo de faturamento
        </h2>
        <span className="text-[11px] text-muted-foreground">
          Semana operacional: segunda a domingo
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* HOJE */}
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Faturamento de hoje</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {formatCurrencyBRL(d.hoje.faturamento)}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {d.hoje.quantidade} lançamento{d.hoje.quantidade === 1 ? "" : "s"} · Ticket médio{" "}
            <strong className="text-foreground">{formatCurrencyBRL(d.hoje.ticket)}</strong>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Ticket médio de OS{" "}
            <strong className="text-foreground">{formatCurrencyBRL(d.hoje.ticket_os)}</strong> ·{" "}
            {d.hoje.os_qtd} OS
          </p>
        </article>

        {/* SEMANA */}
        <article className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">Faturamento da semana</p>
          <p className="mt-1 font-display text-2xl font-bold text-foreground">
            {formatCurrencyBRL(d.semana.faturamento)}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {d.semana.quantidade} lançamento{d.semana.quantidade === 1 ? "" : "s"} · Ticket médio{" "}
            <strong className="text-foreground">{formatCurrencyBRL(d.semana.ticket)}</strong>
          </p>
          <div className="mt-1">
            <Variacao
              atual={d.semana.faturamento}
              anterior={d.semana_anterior.faturamento}
              sufixo="vs. semana anterior"
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatDateOnlyISO(d.semana.inicio)} a {formatDateOnlyISO(d.semana.fim)}
          </p>
        </article>

        {/* MÊS — destaque */}
        <article className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-primary">Faturamento do mês</p>
            <div className="flex gap-1" role="group" aria-label="Base de comparação mensal">
              {(
                [
                  { key: "mesmo_periodo", label: "Mesmo período" },
                  { key: "completo", label: "Mês completo" },
                ] as const
              ).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setModoMes(o.key)}
                  aria-pressed={modoMes === o.key}
                  className={cn(
                    "rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
                    modoMes === o.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1 font-display text-3xl font-bold text-foreground">
            {formatCurrencyBRL(mesReferencia.faturamento)}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {mesReferencia.quantidade} lançamento{mesReferencia.quantidade === 1 ? "" : "s"} ·
            Ticket médio{" "}
            <strong className="text-foreground">{formatCurrencyBRL(mesReferencia.ticket)}</strong>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2">
            <Variacao
              atual={mesReferencia.faturamento}
              anterior={mesComparado.faturamento}
              sufixo={
                modoMes === "mesmo_periodo"
                  ? "vs. mesmo período do mês anterior"
                  : "vs. mês anterior completo"
              }
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Anterior {formatCurrencyBRL(mesComparado.faturamento)} · Diferença{" "}
            <strong className="text-foreground">
              {formatCurrencyBRL(mesReferencia.faturamento - mesComparado.faturamento)}
            </strong>
          </p>
          <p className="mt-1 text-[10px] leading-tight text-muted-foreground">
            {modoMes === "mesmo_periodo"
              ? "Mesmo período: compara os dias decorridos deste mês com a mesma quantidade de dias do mês anterior."
              : "Mês completo: se o mês atual ainda está em andamento, os períodos têm tamanhos diferentes."}
          </p>

          {meta && meta.unidade === "BRL" && (
            <div className="mt-3 border-t border-primary/20 pt-2 text-[11px] text-muted-foreground">
              <p>
                Meta{" "}
                <strong className="text-foreground">{formatCurrencyBRL(meta.valor_alvo)}</strong> ·
                Realizado{" "}
                <strong className="text-foreground">{formatCurrencyBRL(meta.realizado)}</strong>
              </p>
              <p>
                Atingimento{" "}
                <strong className="text-primary">
                  {meta.percentual.toFixed(1).replace(".", ",")}%
                </strong>{" "}
                · Faltante{" "}
                <strong className="text-foreground">{formatCurrencyBRL(meta.faltante)}</strong>
                {meta.projecao !== null && (
                  <>
                    {" "}
                    · Projeção do mês{" "}
                    <strong className="text-foreground">{formatCurrencyBRL(meta.projecao)}</strong>
                  </>
                )}
              </p>
            </div>
          )}
        </article>
      </div>

      {podeVerFinanceiro && (
        <div className="grid gap-2 rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground sm:grid-cols-4">
          <span>
            Receita líquida do mês{" "}
            <strong className="text-primary">{formatCurrencyBRL(d.mes_ate_hoje.liquida)}</strong>
          </span>
          <span>
            Descontos{" "}
            <strong className="text-foreground">
              {formatCurrencyBRL(d.mes_ate_hoje.descontos)}
            </strong>
          </span>
          <span>
            Taxas{" "}
            <strong className="text-foreground">{formatCurrencyBRL(d.mes_ate_hoje.taxas)}</strong>
          </span>
          <span>
            Custo de recebimento{" "}
            <strong className="text-foreground">
              {d.mes_ate_hoje.faturamento > 0
                ? `${((d.mes_ate_hoje.taxas / d.mes_ate_hoje.faturamento) * 100).toFixed(2).replace(".", ",")}%`
                : "0,00%"}
            </strong>
          </span>
        </div>
      )}

      {/* EVOLUÇÃO */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Evolução do faturamento
          </h3>
          <div className="flex gap-1" role="group" aria-label="Meses do histórico">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeses(m)}
                aria-pressed={meses === m}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  meses === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {m} meses
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={evolucao} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis
                tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                tickLine={false}
                axisLine={false}
                width={44}
                fontSize={11}
              />
              <Tooltip
                formatter={(v: number) => formatCurrencyBRL(v)}
                labelFormatter={(l: string) => `Mês ${l}`}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  fontSize: 12,
                }}
              />
              <Bar dataKey="faturamento" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2">Mês</th>
                <th className="px-2 py-2 text-right">Faturamento</th>
                <th className="px-2 py-2 text-right">Lançamentos</th>
                <th className="px-2 py-2 text-right">Ticket médio</th>
                <th className="px-2 py-2 text-right">Variação</th>
              </tr>
            </thead>
            <tbody>
              {[...evolucao].reverse().map((m) => (
                <tr key={m.mes} className="border-b border-border last:border-0">
                  <td className="px-2 py-2 font-medium text-foreground">
                    {m.label}
                    {m.parcial && (
                      <span className="ml-1 text-[10px] text-muted-foreground">(parcial)</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right text-foreground">
                    {formatCurrencyBRL(m.faturamento)}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">{m.quantidade}</td>
                  <td className="px-2 py-2 text-right text-muted-foreground">
                    {formatCurrencyBRL(m.ticket)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {m.variacaoPct === null ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={cn(
                          "text-[11px] font-medium",
                          Math.abs(m.variacaoPct) < 0.05
                            ? "text-muted-foreground"
                            : m.variacaoPct > 0
                              ? "text-primary"
                              : "text-destructive",
                        )}
                      >
                        {`${m.variacaoPct > 0 ? "↑ +" : m.variacaoPct < 0 ? "↓ " : "— "}${m.variacaoPct
                          .toFixed(1)
                          .replace(".", ",")}%`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
