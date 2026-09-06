import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/format";
import type {
  MetaEmpresaDetalhe,
  MetaStatus,
  MetaUnidade,
  StatusProjecao,
  STATUS_META as _SM,
} from "@/lib/metas";
import { STATUS_META, STATUS_PROJECAO } from "@/lib/metas";
import { NIVEL_BADGE } from "@/lib/producao";
import { cn } from "@/lib/utils";
import { mensagemErro, ErroNegocio } from "@/lib/erros";

/** RPC tipada do módulo metas: lança erro do PostgREST. */
export async function rpcMetas<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  return data as T;
}

/** Formata valor conforme a unidade da meta. */
export function formatMetaValor(valor: number | null | undefined, unidade: MetaUnidade): string {
  if (valor == null) return "—";
  if (unidade === "quantidade") return String(Math.round(valor));
  return formatCurrencyBRL(valor);
}

export function StatusMetaBadge({ status }: { status: MetaStatus }) {
  const s = STATUS_META[status];
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", s.className)}>
      {s.label}
    </span>
  );
}

export function StatusProjecaoBadge({ status }: { status: StatusProjecao | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const s = STATUS_PROJECAO[status];
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", s.className)}>
      {s.label}
    </span>
  );
}

export function NivelBadge({ nivel }: { nivel: string | null }) {
  if (!nivel) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        NIVEL_BADGE[nivel] ?? "bg-muted text-muted-foreground",
      )}
    >
      {nivel}
    </span>
  );
}

/** Barra de progresso da meta (limitada visualmente a 100%). */
export function ProgressBarMeta({ percentual, statusProjecao }: { percentual: number; statusProjecao?: StatusProjecao | null }) {
  const largura = Math.min(Math.max(percentual, 0), 100);
  const cor =
    percentual >= 100 || statusProjecao === "acima"
      ? "bg-primary"
      : statusProjecao === "critico"
        ? "bg-destructive"
        : statusProjecao === "atencao"
          ? "bg-amber-500"
          : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(percentual)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full transition-all", cor)} style={{ width: `${largura}%` }} />
    </div>
  );
}

/** Badge de variação percentual vs período anterior. */
export function VariacaoBadge({ atual, anterior }: { atual: number; anterior: number }) {
  if (anterior === 0) {
    return <span className="text-xs text-muted-foreground">{atual === 0 ? "sem variação" : "novo"}</span>;
  }
  const v = ((atual - anterior) / Math.abs(anterior)) * 100;
  const positivo = v >= 0;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
        positivo ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
      )}
    >
      {positivo ? "+" : ""}
      {v.toFixed(1).replace(".", ",")}%
    </span>
  );
}

/** Competência (mês) selecionada → intervalo completo do mês. */
export function competenciaRange(mes: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const from = `${mes}-01`;
  const last = new Date(y, m, 0).getDate();
  return { from, to: `${mes}-${String(last).padStart(2, "0")}` };
}

export function mesAtual(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Card de meta da empresa com progresso, ritmo e projeção. */
export function MetaCard({ meta, destaque }: { meta: MetaEmpresaDetalhe; destaque?: boolean }) {
  const superou = meta.percentual >= 100;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5",
        destaque ? "border-primary/40 shadow-sm" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {meta.nome}
            {meta.principal && (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                Principal
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Fonte: {metaFonte(meta)} · {meta.dias_restantes > 0 ? `${meta.dias_restantes} dias restantes` : "período encerrado"}
          </p>
        </div>
        <StatusProjecaoBadge status={meta.status_projecao} />
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="font-display text-2xl font-bold text-card-foreground">
          {formatMetaValor(meta.realizado, meta.unidade)}
        </p>
        <p className="text-sm text-muted-foreground">
          de {formatMetaValor(meta.valor_alvo, meta.unidade)} ·{" "}
          <span className="font-semibold text-foreground">{meta.percentual.toFixed(1).replace(".", ",")}%</span>
        </p>
      </div>

      <div className="mt-2">
        <ProgressBarMeta percentual={meta.percentual} statusProjecao={meta.status_projecao} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-muted/50 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {superou ? "Superação" : "Faltante"}
          </p>
          <p className={cn("text-sm font-semibold", superou ? "text-primary" : "text-foreground")}>
            {formatMetaValor(Math.abs(meta.faltante), meta.unidade)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ritmo/dia</p>
          <p className="text-sm font-semibold text-foreground">
            {formatMetaValor(meta.ritmo_necessario, meta.unidade)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 px-2 py-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Projeção</p>
          <p className="text-sm font-semibold text-foreground">
            {formatMetaValor(meta.projecao, meta.unidade)}
            {meta.projecao_percentual != null && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({meta.projecao_percentual.toFixed(0)}%)
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function metaFonte(meta: MetaEmpresaDetalhe): string {
  const fontes: Record<string, string> = {
    faturamento: "Caixa Diário",
    receita_liquida: "Caixa Diário",
    margem_contribuicao: "Caixa − Custos − Comissões",
    resultado_operacional: "Caixa − Custos − Comissões − Despesas − Folha",
    os_faturadas: "Caixa Diário",
    ticket_medio: "Caixa Diário",
  };
  return fontes[meta.tipo] ?? meta.tipo;
}

/** Hook: painel gerencial de metas do período. */
export function useMetasPainel(range: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ["metas", "painel", range?.from, range?.to],
    enabled: !!range,
    queryFn: async () => {
      const r = await rpcMetas<import("@/lib/metas").MetasPainel>("metas_painel", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (!r.ok) throw new ErroNegocio(r?.message ?? "Falha ao carregar o painel de metas.");
      return r;
    },
  });
}

/** Hook: desempenho dos técnicos no período. */
export function useTecnicosDesempenho(range: { from: string; to: string } | null, enabled = true) {
  return useQuery({
    queryKey: ["metas", "tecnicos", range?.from, range?.to],
    enabled: !!range && enabled,
    queryFn: async () => {
      const r = await rpcMetas<import("@/lib/metas").MetasTecnicosResult>("metas_tecnicos_desempenho", {
        p_from: range!.from,
        p_to: range!.to,
      });
      if (!r.ok) throw new ErroNegocio(r?.message ?? "Falha ao carregar o desempenho dos técnicos.");
      return r.tecnicos;
    },
  });
}

export type { _SM };
