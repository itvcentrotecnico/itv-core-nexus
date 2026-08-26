import { useQuery } from "@tanstack/react-query";

import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { RelFaturamento } from "@/lib/relatorios";
import { labelMes } from "@/lib/relatorios";
import { BotaoExportar, KpiRel, SecaoRel, TabelaRel, VariacaoTexto, exportarCSV, rpcRel } from "@/components/relatorios/shared";
import { RankingBarras } from "@/components/relatorios/shared";

/** Aba Faturamento: resumo, por dia, por semana, por mês, médias e comparação. */
export function FaturamentoTab({ range, podeExportar }: { range: { from: string; to: string }; podeExportar: boolean }) {
  const q = useQuery({
    queryKey: ["relatorios", "faturamento", range.from, range.to],
    queryFn: () => rpcRel<RelFaturamento>("relatorios_faturamento", { p_from: range.from, p_to: range.to }),
  });

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando faturamento…</p>;
  if (q.error || !q.data?.ok) {
    return <p className="text-sm text-destructive">{q.data?.message ?? "Falha ao carregar o relatório de faturamento."}</p>;
  }

  const d = q.data;
  const r = d.resumo;
  const a = d.anterior;
  const variacao = a.faturamento_final > 0 ? ((r.faturamento_final - a.faturamento_final) / a.faturamento_final) * 100 : null;

  const melhorDia = d.por_dia.reduce<{ data: string; faturamento: number } | null>(
    (acc, x) => (!acc || x.faturamento > acc.faturamento ? x : acc),
    null,
  );
  const mediaDiaria = d.por_dia.length > 0 ? d.por_dia.reduce((s, x) => s + x.faturamento, 0) / d.por_dia.length : 0;

  return (
    <div className="space-y-8">
      <SecaoRel
        titulo="Resumo do período"
        descricao="Fonte: Caixa Diário (lançamentos ativos). Ticket médio de OS = receita final ÷ OS faturadas."
        acao={
          podeExportar ? (
            <BotaoExportar
              onClick={() =>
                exportarCSV(
                  `faturamento-${range.from}-${range.to}.csv`,
                  ["Data", "Faturamento", "OS", "Ticket Médio"],
                  d.por_dia.map((x) => [formatDateOnlyISO(x.data), String(x.faturamento).replace(".", ","), x.os, String(x.ticket_medio).replace(".", ",")]),
                )
              }
            />
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiRel titulo="Faturamento bruto" valor={formatCurrencyBRL(r.faturamento_bruto)} />
          <KpiRel titulo="Descontos" valor={formatCurrencyBRL(r.descontos)} />
          <KpiRel titulo="Receita final" valor={formatCurrencyBRL(r.faturamento_final)} sub={`variação vs período anterior: `} />
          <KpiRel titulo="Taxas" valor={formatCurrencyBRL(r.taxas)} />
          <KpiRel titulo="Receita líquida" valor={formatCurrencyBRL(r.receita_liquida)} />
          <KpiRel titulo="Lançamentos" valor={String(r.lancamentos)} />
          <KpiRel titulo="OS faturadas" valor={String(r.os_faturadas)} />
          <KpiRel titulo="Ticket médio (OS)" valor={formatCurrencyBRL(r.ticket_medio_os)} sub={`Por lançamento: ${formatCurrencyBRL(r.ticket_medio)}`} />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="text-muted-foreground">
            Período anterior ({formatDateOnlyISO(a.inicio)} a {formatDateOnlyISO(a.fim)}):{" "}
            <strong className="text-foreground">{formatCurrencyBRL(a.faturamento_final)}</strong>
            {" · "}
            <VariacaoTexto pct={variacao} />
            {" · "}
            Diferença: <strong className="text-foreground">{formatCurrencyBRL(r.faturamento_final - a.faturamento_final)}</strong>
          </p>
        </div>
      </SecaoRel>

      <SecaoRel
        titulo="Faturamento por dia"
        descricao={
          melhorDia
            ? `Melhor dia: ${formatDateOnlyISO(melhorDia.data)} (${formatCurrencyBRL(melhorDia.faturamento)}) · Média diária: ${formatCurrencyBRL(mediaDiaria)}`
            : undefined
        }
      >
        <TabelaRel
          colunas={["Data", "Faturamento", "OS", "Ticket Médio"]}
          linhas={d.por_dia.map((x) => [
            formatDateOnlyISO(x.data),
            formatCurrencyBRL(x.faturamento),
            x.os,
            formatCurrencyBRL(x.ticket_medio),
          ])}
        />
      </SecaoRel>

      <SecaoRel titulo="Faturamento por semana">
        <TabelaRel
          colunas={["Semana de", "Faturamento", "Variação", "OS", "Ticket Médio"]}
          linhas={d.por_semana.map((x) => [
            formatDateOnlyISO(x.semana_inicio),
            formatCurrencyBRL(x.faturamento),
            <VariacaoTexto key="v" pct={x.variacao_pct} />,
            x.os,
            formatCurrencyBRL(x.ticket_medio),
          ])}
        />
      </SecaoRel>

      <SecaoRel
        titulo="Faturamento por mês (últimos 12)"
        descricao={`Médias — 3 meses: ${formatCurrencyBRL(d.medias.m3)} · 6 meses: ${formatCurrencyBRL(d.medias.m6)} · 12 meses: ${formatCurrencyBRL(d.medias.m12)}`}
        acao={
          podeExportar ? (
            <BotaoExportar
              onClick={() =>
                exportarCSV(
                  `faturamento-mensal.csv`,
                  ["Mês", "Faturamento", "Receita Líquida", "OS", "Ticket Médio", "Variação %"],
                  d.por_mes.map((x) => [
                    labelMes(x.mes),
                    String(x.faturamento).replace(".", ","),
                    String(x.receita_liquida).replace(".", ","),
                    x.os,
                    String(x.ticket_medio).replace(".", ","),
                    x.variacao_pct != null ? String(x.variacao_pct).replace(".", ",") : "",
                  ]),
                )
              }
            />
          ) : undefined
        }
      >
        <TabelaRel
          colunas={["Mês", "Faturamento", "Receita Líquida", "OS", "Ticket Médio", "Variação"]}
          linhas={d.por_mes.map((x) => [
            labelMes(x.mes),
            formatCurrencyBRL(x.faturamento),
            formatCurrencyBRL(x.receita_liquida),
            x.os,
            formatCurrencyBRL(x.ticket_medio),
            <VariacaoTexto key="v" pct={x.variacao_pct} />,
          ])}
        />
      </SecaoRel>

      <SecaoRel titulo="Melhores dias do período" descricao="Top 5 dias por faturamento.">
        <RankingBarras
          itens={[...d.por_dia]
            .sort((a, b) => b.faturamento - a.faturamento)
            .slice(0, 5)
            .map((x) => ({ rotulo: formatDateOnlyISO(x.data), valor: x.faturamento, sub: `${x.os} OS` }))}
        />
      </SecaoRel>
    </div>
  );
}
