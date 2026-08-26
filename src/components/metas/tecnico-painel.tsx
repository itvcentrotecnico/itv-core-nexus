import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { MetasTecnicoPainelResult } from "@/lib/metas";
import { STATUS_META, TIPO_META_TECNICO_LABEL } from "@/lib/metas";
import { NivelBadge, ProgressBarMeta, rpcMetas } from "@/components/metas/shared";
import { cn } from "@/lib/utils";

/** Painel individual do técnico: meta atual, ritmo, projeção e qualidade. */
export function TecnicoPainel({ tecnicoId, range }: { tecnicoId: string; range: { from: string; to: string } }) {
  const painel = useQuery({
    queryKey: ["metas", "tecnico-painel", tecnicoId, range.from, range.to],
    queryFn: async () => {
      const r = await rpcMetas<MetasTecnicoPainelResult>("metas_tecnico_painel", {
        p_tecnico_id: tecnicoId,
        p_from: range.from,
        p_to: range.to,
      });
      if (!r.ok) throw new Error(r.message ?? "Falha ao carregar seus indicadores.");
      return r;
    },
  });

  function exportarCSV() {
    const d = painel.data?.desempenho;
    if (!d) {
      toast.error("Sem dados para exportar.");
      return;
    }
    const linhas = [
      ["Indicador", "Valor"],
      ["Serviços registrados", String(d.registrados)],
      ["Serviços validados", String(d.validados)],
      ["Produção validada", String(d.producao_validada).replace(".", ",")],
      ["Ticket médio", String(d.ticket_medio).replace(".", ",")],
      ["Receita associada", String(d.receita_associada).replace(".", ",")],
      ["Margem de contribuição", String(d.margem_contribuicao).replace(".", ",")],
      ["Índice de validação %", d.indice_validacao?.toFixed(1).replace(".", ",") ?? ""],
      ["Correções", String(d.correcoes)],
      ["Rejeições", String(d.rejeitados)],
    ];
    const blob = new Blob([`﻿${linhas.map((l) => l.map((c) => `"${c}"`).join(";")).join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meu-desempenho-${range.from}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (painel.isLoading) return <p className="text-sm text-muted-foreground">Carregando seus indicadores…</p>;
  if (painel.error || !painel.data?.desempenho) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">Sem dados de desempenho no período selecionado.</p>
      </div>
    );
  }

  const d = painel.data.desempenho;
  const meta = d.meta;
  const metas = painel.data.metas.filter((m) => m.status === "ativa" || m.status === "planejada");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Produção validada" valor={formatCurrencyBRL(d.producao_validada)} sub={`${d.validados} serviços validados`} />
        <Kpi
          titulo="Meta do período"
          valor={meta?.valor_meta != null ? formatCurrencyBRL(meta.valor_meta) : meta?.quantidade_meta != null ? `${meta.quantidade_meta} serviços` : "—"}
          sub={meta ? `${formatDateOnlyISO(meta.inicio)} a ${formatDateOnlyISO(meta.fim)}` : "Nenhuma meta ativa"}
        />
        <Kpi
          titulo="Atingimento"
          valor={meta?.percentual != null ? `${meta.percentual.toFixed(1).replace(".", ",")}%` : "—"}
          sub={meta?.nivel ?? "Sem nível"}
        />
        <Kpi
          titulo="Projeção"
          valor={meta?.projecao != null ? formatCurrencyBRL(meta.projecao) : "—"}
          sub={meta?.ritmo_necessario != null ? `Ritmo necessário: ${formatCurrencyBRL(meta.ritmo_necessario)}/dia` : "Período em andamento"}
        />
      </div>

      {meta?.percentual != null && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Progresso da meta</p>
            <NivelBadge nivel={meta.nivel} />
          </div>
          <div className="mt-3">
            <ProgressBarMeta percentual={meta.percentual} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {meta.percentual.toFixed(1).replace(".", ",")}% atingido no período.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi titulo="Ticket médio" valor={formatCurrencyBRL(d.ticket_medio)} sub="Por serviço validado" />
        <Kpi
          titulo="Índice de validação"
          valor={d.indice_validacao != null ? `${d.indice_validacao.toFixed(0)}%` : "—"}
          sub="Validados sem correção"
        />
        <Kpi titulo="Correções solicitadas" valor={String(d.correcoes)} sub="No período" />
        <Kpi titulo="Rejeições" valor={String(d.rejeitados)} sub="No período" />
      </div>

      {metas.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-foreground">Minhas metas</h3>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Período</th>
                  <th className="px-4 py-2.5 font-medium">Alvo</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {metas.map((m) => {
                  const st = STATUS_META[m.status];
                  return (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2.5 text-foreground">{TIPO_META_TECNICO_LABEL[m.tipo] ?? m.tipo}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {formatDateOnlyISO(m.inicio)} a {formatDateOnlyISO(m.fim)}
                      </td>
                      <td className="px-4 py-2.5 text-foreground">
                        {m.valor_meta != null && formatCurrencyBRL(m.valor_meta)}
                        {m.valor_meta != null && m.quantidade_meta != null && " + "}
                        {m.quantidade_meta != null && `${m.quantidade_meta} serviços`}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", st.className)}>
                          {st.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportarCSV}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Download className="size-4" /> Exportar meu desempenho (CSV)
        </button>
      </div>
    </div>
  );
}

function Kpi({ titulo, valor, sub }: { titulo: string; valor: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 font-display text-xl font-bold text-card-foreground">{valor}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
