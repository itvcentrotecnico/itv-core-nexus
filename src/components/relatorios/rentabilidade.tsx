import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { formatCurrencyBRL } from "@/lib/format";
import type { RelRentabilidade } from "@/lib/relatorios";
import { BotaoExportar, RankingBarras, SecaoRel, TabelaRel, exportarCSV, rpcRel } from "@/components/relatorios/shared";
import { cn } from "@/lib/utils";

/** Aba Rentabilidade: margem de contribuição por serviço, marca e técnico. */
export function RentabilidadeTab({ range, podeExportar }: { range: { from: string; to: string }; podeExportar: boolean }) {
  const q = useQuery({
    queryKey: ["relatorios", "rentabilidade", range.from, range.to],
    queryFn: () => rpcRel<RelRentabilidade>("relatorios_rentabilidade", { p_from: range.from, p_to: range.to }),
  });
  const [visao, setVisao] = useState<"servico" | "marca" | "tecnico">("servico");

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando rentabilidade…</p>;
  if (q.error || !q.data?.ok) {
    return <p className="text-sm text-destructive">{q.data?.message ?? "Falha ao carregar o relatório de rentabilidade."}</p>;
  }

  const d = q.data;
  const itens = visao === "servico" ? d.por_servico : visao === "marca" ? d.por_marca : d.por_tecnico;
  const criticos = itens.filter((x) => x.margem_pct != null && x.margem_pct < 20 && x.quantidade >= 3);
  const negativos = itens.filter((x) => x.margem < 0);
  const lucrativos = itens.filter((x) => (x.margem_pct ?? 0) >= 40 && x.receita > 0);

  const margemCel = (v: number) => (
    <span className={v < 0 ? "font-semibold text-destructive" : "font-semibold text-primary"}>{formatCurrencyBRL(v)}</span>
  );

  return (
    <div className="space-y-8">
      <SecaoRel
        titulo="Rentabilidade"
        descricao="Margem de contribuição = receita líquida da OS (Caixa) − peças e custos − comissões. Limitada a OS com registro de produção."
      >
        {criticos.length > 0 && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            {criticos.length} categoria{criticos.length > 1 ? "s" : ""} com alto volume e margem abaixo de 20% — vale revisar precificação e custo de peças.
          </p>
        )}
        {negativos.length > 0 && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
            {negativos.length} categoria{negativos.length > 1 ? "s" : ""} com margem negativa no período.
          </p>
        )}
      </SecaoRel>

      <div role="group" aria-label="Dimensão de rentabilidade" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {(
          [
            ["servico", "Por Tipo de Serviço"],
            ["marca", "Por Marca"],
            ["tecnico", "Por Técnico"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVisao(k)}
            aria-pressed={visao === k}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              visao === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>

      <SecaoRel
        titulo={visao === "servico" ? "Rentabilidade por tipo de serviço" : visao === "marca" ? "Rentabilidade por marca" : "Rentabilidade por técnico"}
        acao={
          podeExportar ? (
            <BotaoExportar
              onClick={() =>
                exportarCSV(
                  `rentabilidade-${visao}-${range.from}-${range.to}.csv`,
                  ["Categoria", "OS", "Receita", "Custos", "Comissões", "Margem", "Margem %"],
                  itens.map((x) => [
                    x.categoria,
                    x.quantidade,
                    String(x.receita).replace(".", ","),
                    String(x.custos).replace(".", ","),
                    String(x.comissao).replace(".", ","),
                    String(x.margem).replace(".", ","),
                    x.margem_pct != null ? String(x.margem_pct).replace(".", ",") : "",
                  ]),
                )
              }
            />
          ) : undefined
        }
      >
        <TabelaRel
          colunas={["Categoria", "OS", "Receita", "Custos", "Comissões", "Margem", "Margem %"]}
          linhas={itens.map((x) => [
            <span key="c" className="font-medium">{x.categoria}</span>,
            x.quantidade,
            formatCurrencyBRL(x.receita),
            formatCurrencyBRL(x.custos),
            formatCurrencyBRL(x.comissao),
            margemCel(x.margem),
            x.margem_pct != null ? `${x.margem_pct.toFixed(1).replace(".", ",")}%` : "—",
          ])}
          minWidth={760}
        />
      </SecaoRel>

      <div className="grid gap-6 lg:grid-cols-2">
        <SecaoRel titulo="Mais lucrativos" descricao="Margem % ≥ 40%.">
          <RankingBarras
            formato="percentual"
            itens={lucrativos
              .sort((a, b) => (b.margem_pct ?? 0) - (a.margem_pct ?? 0))
              .slice(0, 8)
              .map((x) => ({ rotulo: x.categoria, valor: x.margem_pct ?? 0, sub: `${x.quantidade} OS · ${formatCurrencyBRL(x.margem)}` }))}
          />
        </SecaoRel>
        <SecaoRel titulo="Menos rentáveis" descricao="Ordenados da menor margem — prioridade de revisão.">
          <TabelaRel
            colunas={["Categoria", "OS", "Receita", "Margem", "Margem %"]}
            linhas={itens
              .filter((x) => x.receita > 0)
              .sort((a, b) => (a.margem_pct ?? 999) - (b.margem_pct ?? 999))
              .slice(0, 8)
              .map((x) => [
                x.categoria,
                x.quantidade,
                formatCurrencyBRL(x.receita),
                margemCel(x.margem),
                x.margem_pct != null ? `${x.margem_pct.toFixed(1).replace(".", ",")}%` : "—",
              ])}
          />
        </SecaoRel>
      </div>
    </div>
  );
}
