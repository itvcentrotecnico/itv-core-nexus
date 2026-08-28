import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { formatCurrencyBRL } from "@/lib/format";
import { labelMes } from "@/lib/relatorios";
import { ORIGEM_NAO_INFORMADA } from "@/lib/origens";
import {
  BotaoExportar,
  EstadoSemPermissao,
  KpiRel,
  RankingBarras,
  SecaoRel,
  TabelaRel,
  VariacaoTexto,
  exportarCSV,
  rpcRel,
} from "./shared";

interface LinhaOrigem {
  origem: string;
  atendimentos: number;
  clientes: number;
  os_faturadas: number;
  faturamento: number;
  ticket_medio: number;
  conversao_pct: number | null;
}

interface RelOrigens {
  ok: boolean;
  code?: string;
  message?: string;
  por_origem: LinhaOrigem[];
  mensal: { mes: string; origem: string; atendimentos: number; clientes: number; faturamento: number }[];
  qualidade: { atendimentos: number; com_origem: number; sem_origem: number; completude_pct: number | null };
}

const num = (v: number) => String(Math.round(v));
const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

/** Relatório ORIGEM DOS CLIENTES — canal de aquisição x resultado financeiro. */
export function OrigensTab({ range, podeExportar }: { range: { from: string; to: string }; podeExportar: boolean }) {
  const query = useQuery({
    queryKey: ["rel-origens", range.from, range.to],
    queryFn: () => rpcRel<RelOrigens>("rel_origens", { p_ini: range.from, p_fim: range.to }),
  });

  const dados = query.data;

  const meses = useMemo(() => {
    const set = new Set((dados?.mensal ?? []).map((m) => m.mes));
    return Array.from(set).sort();
  }, [dados]);

  const comparativo = useMemo(() => {
    if (!dados || meses.length < 2) return [];
    const ultimo = meses[meses.length - 1]!;
    const anterior = meses[meses.length - 2]!;
    const origens = Array.from(new Set(dados.mensal.map((m) => m.origem)));
    return origens.map((origem) => {
      const a = dados.mensal.find((m) => m.mes === anterior && m.origem === origem);
      const b = dados.mensal.find((m) => m.mes === ultimo && m.origem === origem);
      const qa = a?.clientes ?? 0;
      const qb = b?.clientes ?? 0;
      return {
        origem,
        anterior: qa,
        atual: qb,
        variacao: qa > 0 ? ((qb - qa) / qa) * 100 : null,
        fatAnterior: a?.faturamento ?? 0,
        fatAtual: b?.faturamento ?? 0,
        mesA: anterior,
        mesB: ultimo,
      };
    });
  }, [dados, meses]);

  if (query.isLoading) return <p className="p-6 text-center text-sm text-muted-foreground">Carregando…</p>;
  if (query.isError) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Não foi possível carregar o relatório agora. Tente novamente.
      </div>
    );
  }
  if (dados && dados.ok === false) {
    return <EstadoSemPermissao mensagem={dados.message ?? "Você não tem permissão para ver este relatório."} />;
  }

  const linhas = dados?.por_origem ?? [];
  const totalFat = linhas.reduce((s, l) => s + Number(l.faturamento), 0);
  const totalClientes = linhas.reduce((s, l) => s + l.clientes, 0);
  const recorrentes = linhas.find((l) => l.origem === "Cliente antigo");
  const indicacao = linhas.find((l) => l.origem.toLowerCase().startsWith("indica"));
  const q = dados?.qualidade;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiRel titulo="Clientes no período" valor={num(totalClientes)} sub="Atendimentos com origem registrada" />
        <KpiRel titulo="Faturamento relacionado" valor={formatCurrencyBRL(totalFat)} sub="Somente lançamentos ativos" />
        <KpiRel
          titulo="Receita de clientes recorrentes"
          valor={formatCurrencyBRL(recorrentes?.faturamento ?? 0)}
          sub={`${num(recorrentes?.clientes ?? 0)} clientes marcados como "Cliente antigo"`}
        />
        <KpiRel
          titulo="Completude da origem"
          valor={pct(q?.completude_pct ?? null)}
          sub={`${num(q?.com_origem ?? 0)} de ${num(q?.atendimentos ?? 0)} · ${num(q?.sem_origem ?? 0)} sem origem`}
        />
      </div>

      <SecaoRel
        titulo="Origem dos clientes"
        descricao="Volume de contatos x resultado financeiro. Origem é dimensão analítica e não altera valores."
        acao={
          podeExportar ? (
            <BotaoExportar
              onClick={() =>
                exportarCSV(
                  `origens-${range.from}-a-${range.to}.csv`,
                  ["Origem", "Atendimentos", "Clientes", "OS faturadas", "Faturamento", "Ticket médio", "Conversão %"],
                  linhas.map((l) => [
                    l.origem,
                    l.atendimentos,
                    l.clientes,
                    l.os_faturadas,
                    Number(l.faturamento).toFixed(2),
                    Number(l.ticket_medio).toFixed(2),
                    l.conversao_pct ?? "",
                  ]),
                )
              }
            />
          ) : undefined
        }
      >
        <TabelaRel
          colunas={["Origem", "Atendimentos", "Clientes", "OS faturadas", "Faturamento", "Ticket médio", "Conversão"]}
          linhas={linhas.map((l) => [
            l.origem === ORIGEM_NAO_INFORMADA ? <span className="text-muted-foreground">{l.origem}</span> : l.origem,
            num(l.atendimentos),
            num(l.clientes),
            num(l.os_faturadas),
            formatCurrencyBRL(Number(l.faturamento)),
            formatCurrencyBRL(Number(l.ticket_medio)),
            pct(l.conversao_pct),
          ])}
          minWidth={780}
        />
      </SecaoRel>

      <div className="grid gap-6 lg:grid-cols-2">
        <SecaoRel titulo="Volume — clientes por canal">
          <RankingBarras
            formato="numero"
            itens={[...linhas]
              .sort((a, b) => b.clientes - a.clientes)
              .map((l) => ({ rotulo: l.origem, valor: l.clientes, sub: `${num(l.os_faturadas)} OS faturadas` }))}
          />
        </SecaoRel>
        <SecaoRel titulo="Resultado — faturamento por canal">
          <RankingBarras
            itens={[...linhas]
              .sort((a, b) => Number(b.faturamento) - Number(a.faturamento))
              .map((l) => ({
                rotulo: l.origem,
                valor: Number(l.faturamento),
                sub: `Ticket médio ${formatCurrencyBRL(Number(l.ticket_medio))}`,
              }))}
          />
        </SecaoRel>
      </div>

      <SecaoRel titulo="Comparativo mensal" descricao="Últimos dois meses do período selecionado.">
        <TabelaRel
          colunas={["Origem", "Mês anterior", "Mês atual", "Variação", "Faturamento anterior", "Faturamento atual"]}
          linhas={comparativo.map((c) => [
            c.origem,
            `${labelMes(c.mesA)} · ${num(c.anterior)}`,
            `${labelMes(c.mesB)} · ${num(c.atual)}`,
            <VariacaoTexto pct={c.variacao} />,
            formatCurrencyBRL(Number(c.fatAnterior)),
            formatCurrencyBRL(Number(c.fatAtual)),
          ])}
          minWidth={760}
        />
      </SecaoRel>

      <SecaoRel titulo="Indicações" descricao="Base para um futuro programa de indicação.">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <KpiRel titulo="Clientes indicados" valor={num(indicacao?.clientes ?? 0)} />
          <KpiRel titulo="Faturamento por indicação" valor={formatCurrencyBRL(indicacao?.faturamento ?? 0)} />
          <KpiRel titulo="Ticket médio" valor={formatCurrencyBRL(indicacao?.ticket_medio ?? 0)} />
        </div>
      </SecaoRel>
    </div>
  );
}
