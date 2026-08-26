import { useMemo, useState } from "react";

import { formatCurrencyBRL } from "@/lib/format";
import type { IndicadoresPeriodo, MetasPainel, TecnicoDesempenho } from "@/lib/metas";
import { NivelBadge, ProgressBarMeta, VariacaoBadge, useTecnicosDesempenho } from "@/components/metas/shared";
import { cn } from "@/lib/utils";

interface IndicadorDef {
  key: keyof IndicadoresPeriodo;
  titulo: string;
  formato: "moeda" | "numero" | "percentual";
  descricao: string;
}

const INDICADORES: IndicadorDef[] = [
  { key: "faturamento", titulo: "Faturamento", formato: "moeda", descricao: "Valor final dos lançamentos ativos do Caixa." },
  { key: "receita_liquida", titulo: "Receita Líquida", formato: "moeda", descricao: "Faturamento menos taxas de pagamento." },
  { key: "ticket_medio", titulo: "Ticket Médio", formato: "moeda", descricao: "Faturamento dividido pela quantidade de lançamentos." },
  { key: "os_faturadas", titulo: "OS Faturadas", formato: "numero", descricao: "Ordens de serviço distintas faturadas no Caixa." },
  { key: "custos_diretos", titulo: "Custos Diretos", formato: "moeda", descricao: "Custos confirmados de peças e serviços por OS." },
  { key: "comissoes", titulo: "Comissões", formato: "moeda", descricao: "Comissões ativas (não canceladas) do período." },
  { key: "margem_contribuicao", titulo: "Margem de Contribuição", formato: "moeda", descricao: "Receita líquida − custos diretos − comissões." },
  { key: "margem_pct", titulo: "Margem %", formato: "percentual", descricao: "Margem de contribuição sobre a receita líquida." },
  { key: "despesas_operacionais", titulo: "Despesas Operacionais", formato: "moeda", descricao: "Despesas ativas por competência." },
  { key: "folha_gerencial", titulo: "Folha Gerencial", formato: "moeda", descricao: "Proventos menos descontos da folha." },
  { key: "resultado_operacional", titulo: "Resultado Operacional", formato: "moeda", descricao: "Margem de contribuição − despesas − folha." },
  { key: "producao_validada", titulo: "Produção Validada", formato: "moeda", descricao: "Serviços técnicos validados pela gerência." },
];

function fmt(v: number, formato: IndicadorDef["formato"]): string {
  if (formato === "moeda") return formatCurrencyBRL(v);
  if (formato === "percentual") return `${v.toFixed(1).replace(".", ",")}%`;
  return String(Math.round(v));
}

/** Aba Indicadores: grid com atual vs período anterior. */
export function IndicadoresTab({ painel }: { painel: MetasPainel }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {INDICADORES.map((ind) => {
        const atual = painel.atual[ind.key] ?? 0;
        const anterior = painel.anterior[ind.key] ?? 0;
        return (
          <div key={ind.key} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{ind.titulo}</p>
            <p
              className={cn(
                "mt-1 font-display text-xl font-bold",
                ind.key === "resultado_operacional" && atual < 0 ? "text-destructive" : "text-card-foreground",
              )}
            >
              {fmt(atual, ind.formato)}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <VariacaoBadge atual={atual} anterior={anterior} />
              <span className="text-[11px] text-muted-foreground">anterior: {fmt(anterior, ind.formato)}</span>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{ind.descricao}</p>
          </div>
        );
      })}
    </div>
  );
}

type Criterio = "producao" | "quantidade" | "receita" | "margem" | "meta" | "qualidade";

const CRITERIOS: { key: Criterio; label: string }[] = [
  { key: "producao", label: "Produção validada" },
  { key: "quantidade", label: "Quantidade" },
  { key: "receita", label: "Receita associada" },
  { key: "margem", label: "Margem de contribuição" },
  { key: "meta", label: "% da meta" },
  { key: "qualidade", label: "Índice de validação" },
];

function valorCriterio(t: TecnicoDesempenho, c: Criterio): number {
  switch (c) {
    case "producao":
      return t.producao_validada;
    case "quantidade":
      return t.validados;
    case "receita":
      return t.receita_associada;
    case "margem":
      return t.margem_contribuicao;
    case "meta":
      return t.meta?.percentual ?? 0;
    case "qualidade":
      return t.indice_validacao ?? 0;
  }
}

function fmtCriterio(v: number, c: Criterio): string {
  if (c === "quantidade") return String(Math.round(v));
  if (c === "meta" || c === "qualidade") return `${v.toFixed(1).replace(".", ",")}%`;
  return formatCurrencyBRL(v);
}

/** Aba Ranking: classificação dos técnicos por critério selecionável. */
export function RankingTab({ range }: { range: { from: string; to: string } }) {
  const [criterio, setCriterio] = useState<Criterio>("producao");
  const desempenho = useTecnicosDesempenho(range);

  const ordenado = useMemo(() => {
    const lista = [...(desempenho.data ?? [])];
    lista.sort((a, b) => valorCriterio(b, criterio) - valorCriterio(a, criterio));
    return lista;
  }, [desempenho.data, criterio]);

  const max = Math.max(...ordenado.map((t) => valorCriterio(t, criterio)), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {CRITERIOS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCriterio(c.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              criterio === c.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {desempenho.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : ordenado.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum técnico com produção no período.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {ordenado.map((t, i) => {
            const v = valorCriterio(t, criterio);
            return (
              <div
                key={t.tecnico_id}
                className={cn(
                  "flex items-center gap-4 rounded-xl border bg-card px-4 py-3",
                  i === 0 ? "border-primary/40" : "border-border",
                )}
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
                    i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{t.tecnico}</p>
                    <p className="text-sm font-bold text-foreground">{fmtCriterio(v, criterio)}</p>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(v / max) * 100}%` }} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>{t.validados} validados</span>
                    <span>Produção {formatCurrencyBRL(t.producao_validada)}</span>
                    {t.meta?.percentual != null && <span>Meta {t.meta.percentual.toFixed(0)}%</span>}
                    <NivelBadge nivel={t.meta?.nivel ?? null} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
