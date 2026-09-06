import { useQuery } from "@tanstack/react-query";

import { formatCurrencyBRL } from "@/lib/format";
import type { RelTecnicos } from "@/lib/relatorios";
import {
  BotaoExportar,
  KpiRel,
  RankingBarras,
  SecaoRel,
  TabelaRel,
  exportarCSV,
  rpcRel,
} from "@/components/relatorios/shared";

const fmtPct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

/** Aba Técnicos: ranking de produção, faturamento, ticket, custos, comissão e margem real. */
export function TecnicosTab({
  range,
  podeExportar,
}: {
  range: { from: string; to: string };
  podeExportar: boolean;
}) {
  const q = useQuery({
    queryKey: ["relatorios", "tecnicos", range.from, range.to],
    queryFn: () =>
      rpcRel<RelTecnicos>("relatorios_tecnicos", { p_from: range.from, p_to: range.to }),
  });

  if (q.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando desempenho dos técnicos…</p>;
  if (q.error || !q.data?.ok) {
    return (
      <p className="text-sm text-destructive">
        {q.data?.message ?? "Falha ao carregar o relatório de técnicos."}
      </p>
    );
  }

  const d = q.data;
  const t = d.tecnicos;
  const receitaTotal = t.reduce((s, x) => s + x.receita_associada, 0);
  const margemTotal = t.reduce((s, x) => s + x.margem, 0);
  const margemGeralPct = receitaTotal > 0 ? (margemTotal / receitaTotal) * 100 : null;

  return (
    <div className="space-y-8">
      <SecaoRel
        titulo="Desempenho técnico"
        descricao="Cruza produção validada com Caixa, Peças e Comissões. Índice de validação = validados ÷ enviados."
        acao={
          podeExportar ? (
            <BotaoExportar
              onClick={() =>
                exportarCSV(
                  `tecnicos-${range.from}-${range.to}.csv`,
                  [
                    "Técnico",
                    "Validados",
                    "Receita",
                    "OS",
                    "Ticket Médio",
                    "Custos",
                    "Comissão",
                    "Margem",
                    "Índice Validação %",
                  ],
                  t.map((x) => [
                    x.tecnico,
                    x.validados,
                    String(x.receita_associada).replace(".", ","),
                    x.os_faturadas,
                    String(x.ticket_medio).replace(".", ","),
                    String(x.custos).replace(".", ","),
                    String(x.comissao).replace(".", ","),
                    String(x.margem).replace(".", ","),
                    x.indice_validacao != null ? String(x.indice_validacao).replace(".", ",") : "",
                  ]),
                )
              }
            />
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiRel titulo="Receita associada" valor={formatCurrencyBRL(receitaTotal)} />
          <KpiRel
            titulo="Margem de contribuição"
            valor={formatCurrencyBRL(margemTotal)}
            sub="Receita − peças − comissões"
          />
          <KpiRel titulo="Margem geral" valor={fmtPct(margemGeralPct)} />
        </div>
        {t.some((x) => x.margem < 0) && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            Há técnico com margem negativa no período — os custos de peças e comissões superaram a
            receita associada às suas OS.
          </p>
        )}
        <TabelaRel
          colunas={[
            "Técnico",
            "Validados",
            "Receita",
            "OS",
            "Ticket Médio",
            "Custos",
            "Comissão",
            "Margem",
            "Índice Validação",
          ]}
          linhas={t.map((x) => [
            <span key="t" className="font-medium">
              {x.tecnico}
            </span>,
            x.validados,
            formatCurrencyBRL(x.receita_associada),
            x.os_faturadas,
            formatCurrencyBRL(x.ticket_medio),
            formatCurrencyBRL(x.custos),
            formatCurrencyBRL(x.comissao),
            <span
              key="m"
              className={
                x.margem < 0 ? "font-semibold text-destructive" : "font-semibold text-primary"
              }
            >
              {formatCurrencyBRL(x.margem)}
            </span>,
            fmtPct(x.indice_validacao),
          ])}
          minWidth={900}
        />
      </SecaoRel>

      <div className="grid gap-6 lg:grid-cols-2">
        <SecaoRel titulo="Mais produzem" descricao="Por serviços validados.">
          <RankingBarras
            formato="numero"
            itens={[...t]
              .sort((a, b) => b.validados - a.validados)
              .slice(0, 8)
              .map((x) => ({ rotulo: x.tecnico, valor: x.validados }))}
          />
        </SecaoRel>
        <SecaoRel titulo="Maior ticket médio" descricao="Valor médio por OS faturada.">
          <RankingBarras
            itens={[...t]
              .filter((x) => x.ticket_medio > 0)
              .sort((a, b) => b.ticket_medio - a.ticket_medio)
              .slice(0, 8)
              .map((x) => ({
                rotulo: x.tecnico,
                valor: x.ticket_medio,
                sub: `${x.os_faturadas} OS`,
              }))}
          />
        </SecaoRel>
        <SecaoRel
          titulo="Qualidade operacional"
          descricao="Índice de validação (serviços aprovados pela gerência)."
        >
          <RankingBarras
            formato="percentual"
            itens={[...t]
              .filter((x) => x.indice_validacao != null)
              .sort((a, b) => (b.indice_validacao ?? 0) - (a.indice_validacao ?? 0))
              .slice(0, 8)
              .map((x) => ({
                rotulo: x.tecnico,
                valor: x.indice_validacao ?? 0,
                sub: `${x.rejeitados} rejeitados · ${x.correcoes} correções`,
              }))}
          />
        </SecaoRel>
        <SecaoRel
          titulo="Margem por técnico"
          descricao="Receita associada menos peças e comissões."
        >
          <RankingBarras
            itens={[...t]
              .sort((a, b) => b.margem - a.margem)
              .slice(0, 8)
              .map((x) => ({
                rotulo: x.tecnico,
                valor: Math.max(x.margem, 0),
                sub: formatCurrencyBRL(x.margem),
              }))}
          />
        </SecaoRel>
      </div>
    </div>
  );
}
