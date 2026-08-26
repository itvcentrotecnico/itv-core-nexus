import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Receipt } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { MoneyInput } from "@/components/caixa/money-input";
import { inputClass, labelClass, round2 } from "@/lib/caixa";
import { competenciaFromMonth, monthFromDateISO } from "@/lib/financeiro";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  GOVERNANCA_PADRAO,
  STATUS_TRIBUTO,
  TIPOS_TRIBUTO,
  type GovernancaConfig,
  type Tributo,
  type TributoMetodo,
  type TributoStatus,
} from "@/lib/governanca";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const botaoSecundario =
  "rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary";

export function TributosTab() {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const podeCriar = can("financeiro_tributos", "criar");
  const podeEditar = can("financeiro_tributos", "editar");

  const [mes, setMes] = useState(monthFromDateISO(todayManausISO()));
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tributo | null>(null);

  const tributosQuery = useQuery({
    queryKey: ["financeiro", "tributos", mes],
    queryFn: async () => {
      const comp = competenciaFromMonth(mes);
      const { data, error } = await supabase
        .from("tributos")
        .select("*, responsavel:profiles!tributos_responsavel_id_fkey(full_name)")
        .eq("competencia", comp!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Tributo[];
    },
  });

  const lista = tributosQuery.data ?? [];
  const total = useMemo(
    () => round2(lista.filter((t) => t.status !== "cancelado").reduce((a, t) => a + Number(t.valor), 0)),
    [lista],
  );

  async function alterarStatus(t: Tributo, status: TributoStatus) {
    const motivo = status === "cancelado" ? window.prompt("Motivo do cancelamento:") : null;
    if (status === "cancelado" && !motivo?.trim()) return;
    const { data, error } = await supabase.rpc("tributos_status", {
      p_id: t.id,
      p_status: status,
      ...(motivo?.trim() ? { p_motivo: motivo.trim() } : {}),
    });
    const res = data as { ok: boolean; message?: string } | null;
    if (error || !res?.ok) {
      toast.error(res?.message ?? "Não foi possível alterar o tributo.");
      return;
    }
    toast.success("Tributo atualizado.");
    void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className={labelClass} htmlFor="trib-mes">
            Competência
          </label>
          <input
            id="trib-mes"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className={cn(inputClass, "w-44")}
          />
        </div>
        <div className="flex items-end gap-3">
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">Tributos da competência</p>
            <p className="mt-1 font-display text-lg font-bold text-foreground">{formatCurrencyBRL(total)}</p>
          </div>
          {podeCriar && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo tributo
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Tributos gerenciais entram na margem de contribuição do DRE. Este cálculo é gerencial e não
        substitui a apuração fiscal oficial da contabilidade.
      </p>

      {tributosQuery.isLoading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Carregando tributos…
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
          <Receipt className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhum tributo nesta competência</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3 text-right">Base</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Status</th>
                {podeEditar && <th className="px-4 py-3" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {t.tipo}
                    <p className="text-xs font-normal text-muted-foreground">
                      {formatDateOnlyISO(t.competencia)}
                      {t.observacao ? ` · ${t.observacao}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.metodo === "percentual"
                      ? `${Number(t.percentual ?? 0).toString().replace(".", ",")}% sobre a base`
                      : "Valor manual"}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatCurrencyBRL(Number(t.base_calculo))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">
                    {formatCurrencyBRL(Number(t.valor))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        STATUS_TRIBUTO[t.status].className,
                      )}
                    >
                      {STATUS_TRIBUTO[t.status].label}
                    </span>
                    {t.motivo_cancelamento && (
                      <p className="mt-1 max-w-48 text-xs text-muted-foreground">{t.motivo_cancelamento}</p>
                    )}
                  </td>
                  {podeEditar && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {t.status !== "pago" && t.status !== "cancelado" && (
                          <>
                            <button
                              type="button"
                              className={botaoSecundario}
                              onClick={() => {
                                setEditing(t);
                                setFormOpen(true);
                              }}
                            >
                              Editar
                            </button>
                            {t.status === "previsto" && (
                              <button
                                type="button"
                                className={botaoSecundario}
                                onClick={() => void alterarStatus(t, "confirmado")}
                              >
                                Confirmar
                              </button>
                            )}
                            <button
                              type="button"
                              className={botaoSecundario}
                              onClick={() => void alterarStatus(t, "pago")}
                            >
                              Marcar pago
                            </button>
                            <button
                              type="button"
                              className={botaoSecundario}
                              onClick={() => void alterarStatus(t, "cancelado")}
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TributoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        mes={mes}
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["financeiro"] })}
      />
    </div>
  );
}

function TributoForm({
  open,
  onOpenChange,
  editing,
  mes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Tributo | null;
  mes: string;
  onSaved: () => void;
}) {
  const configQuery = useQuery({
    queryKey: ["settings", "governanca"],
    queryFn: async () => {
      const { data, error } = await supabase.from("settings").select("value").eq("key", "governanca").maybeSingle();
      if (error) throw error;
      return { ...GOVERNANCA_PADRAO, ...((data?.value ?? {}) as Partial<GovernancaConfig>) };
    },
  });

  const [tipo, setTipo] = useState(TIPOS_TRIBUTO[0]!);
  const [metodo, setMetodo] = useState<TributoMetodo>("percentual");
  const [base, setBase] = useState<number | null>(null);
  const [percentual, setPercentual] = useState<number | null>(null);
  const [valor, setValor] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [pronto, setPronto] = useState(false);

  // Preenche o formulário ao abrir (base sugerida = receita líquida da competência)
  const dreQuery = useQuery({
    queryKey: ["financeiro", "dre-base", mes],
    enabled: open,
    queryFn: async () => {
      const comp = competenciaFromMonth(mes)!;
      const fim = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0);
      const { data, error } = await supabase.rpc("dre_gerencial", {
        p_from: comp,
        p_to: `${mes}-${String(fim.getDate()).padStart(2, "0")}`,
      });
      if (error) throw error;
      return data as unknown as { ok: boolean; receita_liquida: number };
    },
  });

  if (open && !pronto) {
    setPronto(true);
    if (editing) {
      setTipo(editing.tipo);
      setMetodo(editing.metodo);
      setBase(Number(editing.base_calculo));
      setPercentual(editing.percentual == null ? null : Number(editing.percentual));
      setValor(Number(editing.valor));
      setObservacao(editing.observacao ?? "");
    } else {
      setTipo(TIPOS_TRIBUTO[0]!);
      setMetodo(configQuery.data?.tributo_metodo ?? "percentual");
      setBase(dreQuery.data?.ok ? Number(dreQuery.data.receita_liquida) : null);
      setPercentual(configQuery.data?.tributo_percentual_padrao ?? null);
      setValor(null);
      setObservacao("");
    }
  }
  if (!open && pronto) setPronto(false);

  const previsto =
    metodo === "percentual" ? round2(((base ?? 0) * (percentual ?? 0)) / 100) : round2(valor ?? 0);

  async function submit() {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("tributos_salvar", {
        p_id: editing?.id ?? null,
        p_competencia: competenciaFromMonth(mes)!,
        p_tipo: tipo,
        p_metodo: metodo,
        p_base: base ?? 0,
        p_percentual: percentual ?? 0,
        p_valor: valor ?? 0,
        p_observacao: observacao.trim(),
      });
      const res = data as { ok: boolean; message?: string } | null;
      if (error || !res?.ok) {
        toast.error(res?.message ?? "Não foi possível salvar o tributo.");
        return;
      }
      toast.success(editing ? "Tributo atualizado." : "Tributo registrado.");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar tributo" : "Novo tributo gerencial"}</DialogTitle>
          <DialogDescription>
            Cálculo gerencial para a competência {mes.split("-").reverse().join("/")}. Não substitui a
            apuração fiscal oficial.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label className={labelClass} htmlFor="trib-tipo">
            Tipo
          </label>
          <select id="trib-tipo" className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS_TRIBUTO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="trib-metodo">
            Método
          </label>
          <select
            id="trib-metodo"
            className={inputClass}
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as TributoMetodo)}
          >
            <option value="percentual">Percentual sobre a base</option>
            <option value="manual">Valor manual</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="trib-base">
              Base de cálculo
            </label>
            <MoneyInput id="trib-base" value={base} onChange={setBase} />
          </div>
          {metodo === "percentual" ? (
            <div>
              <label className={labelClass} htmlFor="trib-pct">
                Percentual (%)
              </label>
              <input
                id="trib-pct"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                value={percentual ?? ""}
                onChange={(e) => setPercentual(e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
          ) : (
            <div>
              <label className={labelClass} htmlFor="trib-valor">
                Valor
              </label>
              <MoneyInput id="trib-valor" value={valor} onChange={setValor} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
          <span className="text-sm font-medium text-secondary-foreground">Valor do tributo</span>
          <span className="font-display text-lg font-bold text-foreground">{formatCurrencyBRL(previsto)}</span>
        </div>

        <div>
          <label className={labelClass} htmlFor="trib-obs">
            Observação <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="trib-obs"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className={cn(inputClass, "resize-none")}
          />
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
