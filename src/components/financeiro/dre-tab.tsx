import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, todayManausISO } from "@/lib/format";
import { monthFromDateISO } from "@/lib/financeiro";
import type { DreGerencial } from "@/lib/governanca";
import { rpcFin } from "@/components/financeiro/shared";
import { cn } from "@/lib/utils";

const money = (n: number | null | undefined) => formatCurrencyBRL(n ?? 0);
const pct = (n: number | null | undefined) => `${Number(n ?? 0).toFixed(1)}%`;

interface Linha {
  label: string;
  valor: number;
  tipo?: "saida" | "subtotal" | "total";
  hint?: string;
}

export function DreTab() {
  const [mes, setMes] = useState(monthFromDateISO(todayManausISO()));
  const from = `${mes}-01`;
  const to = useMemo(() => {
    const parts = mes.split("-").map(Number);
    return new Date(Date.UTC(parts[0] ?? 2026, parts[1] ?? 1, 0)).toISOString().slice(0, 10);
  }, [mes]);

  const dreQuery = useQuery({
    queryKey: ["financeiro", "dre", from, to],
    queryFn: () => rpcFin<DreGerencial>("dre_gerencial", { p_from: from, p_to: to }),
  });
  const d = dreQuery.data;

  const linhas: Linha[] = d
    ? [
        { label: "Faturamento bruto", valor: d.faturamento_bruto },
        { label: "(−) Descontos concedidos", valor: -d.descontos, tipo: "saida" },
        { label: "(−) Taxas de recebimento", valor: -d.taxas_recebimento, tipo: "saida" },
        { label: "= Receita líquida", valor: d.receita_liquida, tipo: "subtotal" },
        { label: "(−) Custos diretos (peças e serviços)", valor: -d.custos_diretos, tipo: "saida" },
        { label: "(−) Comissões técnicas", valor: -d.comissoes_tecnicas, tipo: "saida" },
        {
          label: "(−) Comissões de entrega",
          valor: -d.comissoes_entrega,
          tipo: "saida",
          hint: `Reconhecimento: ${d.reconhecimento_entrega}`,
        },
        { label: "(−) Tributos gerenciais", valor: -d.tributos, tipo: "saida" },
        { label: "= Margem de contribuição", valor: d.margem_contribuicao, tipo: "subtotal" },
        { label: "(−) Despesas operacionais", valor: -d.despesas_operacionais, tipo: "saida" },
        { label: "(−) Folha gerencial", valor: -d.folha_gerencial, tipo: "saida" },
        { label: "= Resultado operacional", valor: d.resultado_operacional, tipo: "total" },
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="dre-mes" className={labelClass}>
            Competência
          </label>
          <input
            id="dre-mes"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={cn(inputClass, "w-44")}
          />
        </div>
      </div>

      {dreQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando DRE…</p>}

      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Indicador label="Receita líquida" valor={money(d.receita_liquida)} />
            <Indicador
              label="Margem de contribuição"
              valor={money(d.margem_contribuicao)}
              tom={d.margem_contribuicao < 0 ? "bad" : "good"}
            />
            <Indicador
              label="Comissão sobre receita"
              valor={pct(d.comissao_sobre_receita)}
              tom={d.comissao_sobre_receita > 40 ? "bad" : undefined}
            />
            <Indicador
              label="Desconto sobre faturamento"
              valor={pct(d.desconto_sobre_faturamento)}
              tom={d.desconto_sobre_faturamento > 10 ? "bad" : undefined}
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.label}
                    className={cn(
                      "border-b border-border last:border-0",
                      l.tipo === "subtotal" && "bg-secondary/50 font-semibold",
                      l.tipo === "total" && "bg-primary/5 font-bold",
                    )}
                  >
                    <td className="px-4 py-2.5 text-foreground">
                      {l.label}
                      {l.hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{l.hint}</span>}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums",
                        l.tipo === "saida" && "text-muted-foreground",
                        l.tipo === "total" && (l.valor < 0 ? "text-destructive" : "text-primary"),
                      )}
                    >
                      {money(l.valor)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-primary/5 font-bold">
                  <td className="px-4 py-2.5 text-foreground">Margem operacional</td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right tabular-nums",
                      d.margem_operacional < 0 ? "text-destructive" : "text-primary",
                    )}
                  >
                    {pct(d.margem_operacional)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            DRE gerencial da ITV: valores apurados pelo caixa e pelos lançamentos do período. Tributos são
            gerenciais e não substituem a apuração fiscal oficial.
          </p>
        </>
      )}
    </div>
  );
}

function Indicador({ label, valor, tom }: { label: string; valor: string; tom?: "good" | "bad" | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-xl font-bold text-foreground",
          tom === "good" && "text-primary",
          tom === "bad" && "text-destructive",
        )}
      >
        {valor}
      </p>
    </div>
  );
}
