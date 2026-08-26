import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";

import type { MetasPainel } from "@/lib/metas";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { MetaCard, VariacaoBadge, rpcMetas } from "@/components/metas/shared";
import type { MetasEvolucao } from "@/lib/metas";

/** Aba Visão Geral: meta principal, alertas, evolução e comparativo. */
export function VisaoGeralTab({
  painel,
  range,
}: {
  painel: MetasPainel;
  range: { from: string; to: string };
}) {
  const principal = painel.metas.find((m) => m.principal) ?? painel.metas.find((m) => m.status === "ativa") ?? null;
  const outras = painel.metas.filter((m) => m.id !== principal?.id);

  const evolucao = useQuery({
    queryKey: ["metas", "evolucao", range.from, range.to],
    enabled: !!principal,
    queryFn: async () => {
      const r = await rpcMetas<MetasEvolucao>("metas_evolucao", { p_from: range.from, p_to: range.to });
      if (!r.ok) return { meta_principal: null, dias: [] } as MetasEvolucao;
      return r;
    },
  });

  return (
    <div className="space-y-6">
      {painel.alertas.length > 0 && (
        <div className="space-y-2">
          {painel.alertas.map((a) => (
            <div
              key={`${a.tipo}-${a.meta_id}`}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3",
                a.tipo === "meta_superada" && "border-primary/30 bg-primary/5",
                a.tipo === "meta_em_atencao" && "border-amber-500/30 bg-amber-500/5",
                a.tipo === "meta_em_risco" && "border-destructive/30 bg-destructive/5",
              )}
            >
              {a.tipo === "meta_superada" ? (
                <TrendingUp className="size-4 shrink-0 text-primary" />
              ) : a.tipo === "meta_em_atencao" ? (
                <AlertTriangle className="size-4 shrink-0 text-amber-600" />
              ) : (
                <TrendingDown className="size-4 shrink-0 text-destructive" />
              )}
              <p className="text-sm text-foreground">
                {a.tipo === "meta_superada" && (
                  <>
                    <strong>{a.nome}</strong> superada: {a.percentual.toFixed(1).replace(".", ",")}% da meta.
                  </>
                )}
                {a.tipo === "meta_em_atencao" && (
                  <>
                    <strong>{a.nome}</strong> em atenção: projeção de {a.projecao_percentual?.toFixed(0)}% da meta.
                  </>
                )}
                {a.tipo === "meta_em_risco" && (
                  <>
                    <strong>{a.nome}</strong> em risco: projeção de apenas {a.projecao_percentual?.toFixed(0)}% da meta.
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {principal ? (
        <MetaCard meta={principal} destaque />
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma meta ativa no período</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie a primeira meta da empresa na aba "Metas da Empresa" para acompanhar realizado x planejado.
          </p>
        </div>
      )}

      {outras.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {outras.map((m) => (
            <MetaCard key={m.id} meta={m} />
          ))}
        </div>
      )}

      {evolucao.data && evolucao.data.dias.length > 0 && evolucao.data.meta_principal && (
        <EvolucaoChart evolucao={evolucao.data} />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ComparativoCard
          titulo="Faturamento"
          atual={painel.atual.faturamento}
          anterior={painel.anterior.faturamento}
          formato="moeda"
        />
        <ComparativoCard
          titulo="Receita Líquida"
          atual={painel.atual.receita_liquida}
          anterior={painel.anterior.receita_liquida}
          formato="moeda"
        />
        <ComparativoCard
          titulo="OS Faturadas"
          atual={painel.atual.os_faturadas}
          anterior={painel.anterior.os_faturadas}
          formato="numero"
        />
        <ComparativoCard
          titulo="Resultado Operacional"
          atual={painel.atual.resultado_operacional}
          anterior={painel.anterior.resultado_operacional}
          formato="moeda"
        />
      </div>
    </div>
  );
}

function ComparativoCard({
  titulo,
  atual,
  anterior,
  formato,
}: {
  titulo: string;
  atual: number;
  anterior: number;
  formato: "moeda" | "numero";
}) {
  const fmt = (v: number) => (formato === "moeda" ? formatCurrencyBRL(v) : String(Math.round(v)));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 font-display text-xl font-bold text-card-foreground">{fmt(atual)}</p>
      <div className="mt-1 flex items-center gap-2">
        <VariacaoBadge atual={atual} anterior={anterior} />
        <span className="text-[11px] text-muted-foreground">vs período anterior ({fmt(anterior)})</span>
      </div>
    </div>
  );
}

/** Gráfico de evolução: acumulado realizado vs ritmo ideal da meta principal. */
function EvolucaoChart({ evolucao }: { evolucao: MetasEvolucao }) {
  const dias = evolucao.dias;
  const meta = evolucao.meta_principal!;
  const max = Math.max(meta.valor_alvo, ...dias.map((d) => d.acumulado), 1);
  const W = 720;
  const H = 220;
  const pad = 8;
  const x = (i: number) => pad + (i / Math.max(dias.length - 1, 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const linha = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v == null ? null : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-card-foreground">Evolução no período</h3>
          <p className="text-xs text-muted-foreground">Acumulado realizado vs ritmo ideal — {meta.nome}</p>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-primary" /> Realizado
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-muted-foreground/50" /> Ritmo ideal
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Gráfico de evolução da meta">
        <line x1={pad} y1={y(meta.valor_alvo)} x2={W - pad} y2={y(meta.valor_alvo)} stroke="currentColor" strokeDasharray="4 4" className="text-border" />
        <path d={linha(dias.map((d) => d.ideal))} fill="none" strokeWidth="2" className="stroke-muted-foreground/50" />
        <path d={linha(dias.map((d) => d.acumulado))} fill="none" strokeWidth="2.5" className="stroke-primary" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{dias[0]?.data.split("-").reverse().slice(0, 2).join("/")}</span>
        <span>{dias[dias.length - 1]?.data.split("-").reverse().slice(0, 2).join("/")}</span>
      </div>
    </div>
  );
}
