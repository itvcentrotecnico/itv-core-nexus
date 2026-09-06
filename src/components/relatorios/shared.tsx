import { mensagemErro } from "@/lib/erros";
import { Download } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { formatCurrencyBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

/** RPC tipada do módulo relatórios. */
export async function rpcRel<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  return data as T;
}

export function exportarCSV(nome: string, cabecalho: string[], linhas: (string | number)[][]) {
  if (linhas.length === 0) {
    toast.error("Sem dados para exportar no período.");
    return;
  }
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const conteudo = [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\n");
  const blob = new Blob([`﻿${conteudo}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("CSV exportado.");
}

export function BotaoExportar({ onClick, label = "Exportar CSV" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
    >
      <Download className="size-3.5" /> {label}
    </button>
  );
}

export function KpiRel({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 font-display text-xl font-bold text-card-foreground">{valor}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SecaoRel({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: string | undefined;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{titulo}</h3>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Tabela genérica de relatório. */
export function TabelaRel({
  colunas,
  linhas,
  minWidth = 640,
}: {
  colunas: string[];
  linhas: React.ReactNode[][];
  minWidth?: number;
}) {
  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Sem dados no período selecionado.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {colunas.map((c) => (
              <th key={c} className="px-4 py-2.5 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {l.map((cel, j) => (
                <td key={j} className="px-4 py-2.5 text-foreground">{cel}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lista de ranking com barras proporcionais. */
export function RankingBarras({
  itens,
  formato = "moeda",
}: {
  itens: { rotulo: string; valor: number; sub?: string }[];
  formato?: "moeda" | "numero" | "percentual";
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Sem dados no período selecionado.</p>
      </div>
    );
  }
  const max = Math.max(...itens.map((i) => i.valor), 1);
  const fmt = (v: number) =>
    formato === "moeda" ? formatCurrencyBRL(v) : formato === "percentual" ? `${v.toFixed(1).replace(".", ",")}%` : String(Math.round(v));
  return (
    <div className="space-y-2">
      {itens.map((item, i) => (
        <div key={`${item.rotulo}-${i}`} className="rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground">
              <span className="mr-2 text-xs font-bold text-muted-foreground">{i + 1}º</span>
              {item.rotulo}
            </p>
            <p className="shrink-0 text-sm font-bold text-foreground">{fmt(item.valor)}</p>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${(item.valor / max) * 100}%` }} />
          </div>
          {item.sub && <p className="mt-1 text-[11px] text-muted-foreground">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function VariacaoTexto({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span className="text-xs text-muted-foreground">—</span>;
  const positivo = pct >= 0;
  return (
    <span className={cn("text-xs font-semibold", positivo ? "text-primary" : "text-destructive")}>
      {positivo ? "+" : ""}
      {pct.toFixed(1).replace(".", ",")}%
    </span>
  );
}

export function EstadoSemPermissao({ mensagem }: { mensagem: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <p className="text-sm font-medium text-foreground">Acesso restrito</p>
      <p className="mt-1 text-xs text-muted-foreground">{mensagem}</p>
    </div>
  );
}
