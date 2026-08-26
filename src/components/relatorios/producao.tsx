import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { RelProducao } from "@/lib/relatorios";
import { labelMes } from "@/lib/relatorios";
import { BotaoExportar, KpiRel, RankingBarras, SecaoRel, TabelaRel, exportarCSV, rpcRel } from "@/components/relatorios/shared";
import { cn } from "@/lib/utils";

/** Aba Serviços: produção validada, tipos, marcas, modelos e peças. */
export function ProducaoTab({ range, podeExportar }: { range: { from: string; to: string }; podeExportar: boolean }) {
  const q = useQuery({
    queryKey: ["relatorios", "producao", range.from, range.to],
    queryFn: () => rpcRel<RelProducao>("relatorios_producao", { p_from: range.from, p_to: range.to }),
  });
  const [visao, setVisao] = useState<"tipos" | "marcas" | "modelos" | "pecas">("tipos");

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando produção…</p>;
  if (q.error || !q.data?.ok) {
    return <p className="text-sm text-destructive">{q.data?.message ?? "Falha ao carregar o relatório de produção."}</p>;
  }

  const d = q.data;
  const r = d.resumo;
  const amostraPequena = r.servicos_validados < 10;

  return (
    <div className="space-y-8">
      <SecaoRel
        titulo="Serviços executados"
        descricao="Fonte: Produção Técnica validada pela gerência. Receita associada vem do Caixa (OS correspondente)."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiRel titulo="Serviços validados" valor={String(r.servicos_validados)} />
          <KpiRel titulo="Valor de produção" valor={formatCurrencyBRL(r.valor_producao)} />
          <KpiRel titulo="Valor médio por serviço" valor={formatCurrencyBRL(r.valor_medio)} />
          <KpiRel titulo="Técnicos participantes" valor={String(r.tecnicos_participantes)} />
        </div>
        {amostraPequena && (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
            Dados insuficientes para análise confiável: poucos serviços validados no período.
          </p>
        )}
      </SecaoRel>

      <SecaoRel titulo="Produção por mês" descricao="Serviços validados, valor de produção e média por serviço.">
        <TabelaRel
          colunas={["Mês", "Serviços", "Valor Produção", "Média por Serviço"]}
          linhas={d.por_mes.map((x) => [labelMes(x.mes), x.servicos, formatCurrencyBRL(x.valor), formatCurrencyBRL(x.media)])}
        />
      </SecaoRel>

      <div role="group" aria-label="Dimensão do relatório" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {(
          [
            ["tipos", "Tipos de Serviço"],
            ["marcas", "Marcas"],
            ["modelos", "Modelos de TV"],
            ["pecas", "Marca × Peças"],
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

      {visao === "tipos" && (
        <>
          <SecaoRel
            titulo="Ranking por tipo de serviço"
            descricao="Quantidade, participação, valor de produção, ticket médio e receita associada (Caixa)."
            acao={
              podeExportar ? (
                <BotaoExportar
                  onClick={() =>
                    exportarCSV(
                      `servicos-tipos-${range.from}-${range.to}.csv`,
                      ["Serviço", "Quantidade", "%", "Valor Produção", "Ticket Médio", "Receita Associada"],
                      d.por_tipo.map((x) => [x.tipo, x.quantidade, x.pct, String(x.valor).replace(".", ","), String(x.ticket_medio).replace(".", ","), String(x.receita_associada).replace(".", ",")]),
                    )
                  }
                />
              ) : undefined
            }
          >
            <TabelaRel
              colunas={["Serviço", "Qtd", "%", "Valor Produção", "Ticket Médio", "Receita Associada"]}
              linhas={d.por_tipo.map((x) => [
                x.tipo,
                x.quantidade,
                `${x.pct.toFixed(1).replace(".", ",")}%`,
                formatCurrencyBRL(x.valor),
                formatCurrencyBRL(x.ticket_medio),
                formatCurrencyBRL(x.receita_associada),
              ])}
            />
          </SecaoRel>
          <div className="grid gap-6 lg:grid-cols-2">
            <SecaoRel titulo="Top 10 por quantidade">
              <RankingBarras
                formato="numero"
                itens={d.por_tipo.slice(0, 10).map((x) => ({ rotulo: x.tipo, valor: x.quantidade, sub: formatCurrencyBRL(x.valor) }))}
              />
            </SecaoRel>
            <SecaoRel titulo="Top por receita" descricao="O serviço mais frequente nem sempre é o que mais fatura.">
              <RankingBarras
                itens={[...d.por_tipo].sort((a, b) => b.receita_associada - a.receita_associada).slice(0, 10).map((x) => ({ rotulo: x.tipo, valor: x.receita_associada, sub: `${x.quantidade} serviços` }))}
              />
            </SecaoRel>
          </div>
        </>
      )}

      {visao === "marcas" && (
        <>
          <SecaoRel
            titulo="Serviços por marca"
            descricao="Marcas com maior entrada técnica e faturamento associado."
            acao={
              podeExportar ? (
                <BotaoExportar
                  onClick={() =>
                    exportarCSV(
                      `servicos-marcas-${range.from}-${range.to}.csv`,
                      ["Marca", "Quantidade", "%", "Receita Associada", "Ticket Médio"],
                      d.por_marca.map((x) => [x.marca, x.quantidade, x.pct, String(x.receita_associada).replace(".", ","), String(x.ticket_medio).replace(".", ",")]),
                    )
                  }
                />
              ) : undefined
            }
          >
            <TabelaRel
              colunas={["Marca", "Qtd", "% dos Serviços", "Receita Associada", "Ticket Médio"]}
              linhas={d.por_marca.map((x) => [
                x.marca,
                x.quantidade,
                `${x.pct.toFixed(1).replace(".", ",")}%`,
                formatCurrencyBRL(x.receita_associada),
                formatCurrencyBRL(x.ticket_medio),
              ])}
            />
          </SecaoRel>
          <SecaoRel titulo="Marca × tipo de serviço" descricao="Cruzamento para previsão de peças.">
            <TabelaRel
              colunas={["Marca", "Serviço", "Quantidade"]}
              linhas={d.marca_x_servico.map((x) => [x.marca, x.tipo, x.quantidade])}
            />
          </SecaoRel>
        </>
      )}

      {visao === "modelos" && (
        <>
          <SecaoRel
            titulo="Ranking por modelo"
            descricao="Modelos mais atendidos — referência para estoque, peças e treinamento."
            acao={
              podeExportar ? (
                <BotaoExportar
                  onClick={() =>
                    exportarCSV(
                      `servicos-modelos-${range.from}-${range.to}.csv`,
                      ["Marca", "Modelo", "Polegadas", "Quantidade", "Receita Associada", "Ticket Médio", "Serviços Comuns"],
                      d.por_modelo.map((x) => [x.marca, x.modelo, x.polegadas ?? "", x.quantidade, String(x.receita_associada).replace(".", ","), String(x.ticket_medio).replace(".", ","), x.servicos_comuns ?? ""]),
                    )
                  }
                />
              ) : undefined
            }
          >
            <TabelaRel
              colunas={["Marca", "Modelo", 'Pol.', "Qtd", "Receita Associada", "Ticket Médio", "Serviços mais comuns"]}
              linhas={d.por_modelo.map((x) => [
                x.marca,
                x.modelo,
                x.polegadas ? `${x.polegadas}"` : "—",
                x.quantidade,
                formatCurrencyBRL(x.receita_associada),
                formatCurrencyBRL(x.ticket_medio),
                <span key="s" className="text-xs text-muted-foreground">{x.servicos_comuns ?? "—"}</span>,
              ])}
              minWidth={860}
            />
          </SecaoRel>
          <SecaoRel titulo="Modelo × tipo de serviço">
            <TabelaRel
              colunas={["Modelo", "Serviço", "Quantidade"]}
              linhas={d.modelo_x_servico.map((x) => [x.modelo, x.tipo, x.quantidade])}
            />
          </SecaoRel>
        </>
      )}

      {visao === "pecas" && (
        <SecaoRel
          titulo="Marca × peça utilizada"
          descricao="Fonte: Peças e Custos por OS, cruzado com a produção validada. Referência para previsão de estoque."
        >
          <TabelaRel
            colunas={["Marca", "Categoria de Peça", "Quantidade", "Custo Total"]}
            linhas={d.marca_x_peca.map((x) => [x.marca, x.categoria, x.quantidade, formatCurrencyBRL(x.custo_total)])}
          />
        </SecaoRel>
      )}

      <SecaoRel titulo="Produção por dia">
        <TabelaRel
          colunas={["Data", "Serviços", "Valor Produção", "Média por Serviço"]}
          linhas={d.por_dia.map((x) => [formatDateOnlyISO(x.data), x.servicos, formatCurrencyBRL(x.valor), formatCurrencyBRL(x.media)])}
        />
      </SecaoRel>
    </div>
  );
}
