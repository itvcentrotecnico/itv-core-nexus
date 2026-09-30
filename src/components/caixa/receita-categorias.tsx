import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { GRUPO_RECEITA_LABEL, round2, type GrupoReceita } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import { mensagemErro } from "@/lib/erros";

interface Linha {
  status: string;
  valor_final: number;
  grupo_receita?: GrupoReceita | null;
}

/** Cards de receita por categoria do período filtrado. Soma das 3 = Faturamento Total. */
export function ReceitaCategorias({ lancamentos }: { lancamentos: Linha[] }) {
  const t = useMemo(() => {
    const r = { total: 0, servicos: 0, acessorios: 0, venda_tv: 0, sem: 0 };
    for (const l of lancamentos) {
      if (l.status !== "ativo") continue;
      r.total += l.valor_final;
      if (l.grupo_receita) r[l.grupo_receita] += l.valor_final;
      else r.sem += l.valor_final;
    }
    return {
      total: round2(r.total),
      servicos: round2(r.servicos),
      acessorios: round2(r.acessorios),
      venda_tv: round2(r.venda_tv),
      sem: round2(r.sem),
    };
  }, [lancamentos]);

  const cards: [string, number][] = [
    ["Faturamento total", t.total],
    ["Serviços", t.servicos],
    ["Acessórios", t.acessorios],
    ["Venda de TVs", t.venda_tv],
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cards.map(([label, v], i) => (
          <div
            key={label}
            className={`rounded-xl border bg-card p-3 ${i === 0 ? "border-primary/40" : "border-border"}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 font-display text-lg font-bold text-card-foreground">
              {formatCurrencyBRL(v)}
            </p>
          </div>
        ))}
      </div>
      {t.sem > 0 && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {formatCurrencyBRL(t.sem)} no período sem categoria — aguardando revisão da Gerência.
        </p>
      )}
    </div>
  );
}

interface Pendente {
  id: string;
  data: string;
  os: string | null;
  cliente: string | null;
  descricao: string | null;
  tipo: string;
  valor: number;
}

/** Revisão de classificação: somente Gerência (caixa:administrar). */
export function RevisaoClassificacao() {
  const qc = useQueryClient();
  const [classificados, setClassificados] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["caixa", "sem-classificacao"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_receitas_sem_classificacao" as never);
      if (error) throw error;
      const r = data as unknown as { ok: boolean; itens?: Pendente[] };
      return r.ok ? (r.itens ?? []) : [];
    },
  });

  async function classificar(id: string, grupo: GrupoReceita) {
    const { data, error } = await supabase.rpc(
      "caixa_classificar_receita" as never,
      { p_id: id, p_grupo: grupo } as never,
    );
    const r = data as unknown as { ok: boolean; message?: string } | null;
    if (error || !r?.ok) {
      toast.error(error ? mensagemErro(error) : (r?.message ?? "Não foi possível classificar."));
      return;
    }
    setClassificados((prev) => new Set(prev).add(id));
    toast.success(`Classificado como ${GRUPO_RECEITA_LABEL[grupo]}.`);
    void qc.invalidateQueries({ queryKey: ["caixa"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-indicadores"] });
    void qc.invalidateQueries({ queryKey: ["projecao"] });
  }

  const itens = (q.data ?? []).filter((i) => !classificados.has(i.id));
  if (!itens.length) return null;

  return (
    <div className="rounded-xl border border-destructive/30 bg-card p-4">
      <p className="font-display text-sm font-bold text-card-foreground">
        Revisão de classificação — {itens.length} receita(s)
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Lançamentos antigos do tipo "Outros". Defina a categoria de cada um — só Serviços contam na
        Meta de Serviços.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {itens.map((i) => (
          <li key={i.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium text-foreground">
                {formatCurrencyBRL(i.valor)} · {i.descricao || i.tipo}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDateOnlyISO(i.data)}
                {i.os ? ` · OS/ref: ${i.os}` : ""}
                {i.cliente ? ` · ${i.cliente}` : ""}
              </p>
            </div>
            <div className="flex gap-1">
              {(Object.keys(GRUPO_RECEITA_LABEL) as GrupoReceita[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => void classificar(i.id, g)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold uppercase hover:border-primary hover:text-primary"
                >
                  {GRUPO_RECEITA_LABEL[g]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
