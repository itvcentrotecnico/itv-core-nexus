import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { MoneyInput } from "@/components/caixa/money-input";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateTimeITV } from "@/lib/format";
import {
  TIPO_MOVIMENTO,
  type CaixaFisicoResumo,
  type CaixaMovimento,
  type CaixaMovimentoTipo,
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
import { KpiCard } from "@/components/caixa/kpi-card";

/** Consulta o resumo do caixa físico do dia (saldo inicial, suprimentos, sangrias). */
export function useCaixaFisico(date: string, enabled: boolean) {
  return useQuery({
    queryKey: ["caixa", "fisico", date],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_fisico_resumo", { p_data: date });
      if (error) throw error;
      return data as unknown as CaixaFisicoResumo;
    },
  });
}

interface Props {
  date: string;
  resumo: CaixaFisicoResumo | undefined;
  podeRegistrar: boolean;
  diaBloqueado: boolean;
}

export function CaixaFisicoSection({ date, resumo, podeRegistrar, diaBloqueado }: Props) {
  const queryClient = useQueryClient();
  const [dialogTipo, setDialogTipo] = useState<CaixaMovimentoTipo | null>(null);

  const movimentosQuery = useQuery({
    queryKey: ["caixa", "movimentos", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_movimentos")
        .select("*, responsavel:profiles!caixa_movimentos_responsavel_id_fkey(full_name)")
        .eq("data_movimento", date)
        .order("ocorrido_em", { ascending: false });
      if (error) throw error;
      return data as unknown as CaixaMovimento[];
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["caixa"] });
  };

  const movimentos = movimentosQuery.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label="Saldo inicial" value={formatCurrencyBRL(resumo?.saldo_inicial ?? 0)} />
        <KpiCard label="Entradas em dinheiro" value={formatCurrencyBRL(resumo?.entradas_dinheiro ?? 0)} />
        <KpiCard label="Suprimentos" value={formatCurrencyBRL(resumo?.suprimentos ?? 0)} />
        <KpiCard label="Sangrias" value={formatCurrencyBRL(resumo?.sangrias ?? 0)} />
        <KpiCard
          label="Saldo físico esperado"
          value={formatCurrencyBRL(resumo?.saldo_esperado ?? 0)}
          sub="Dinheiro que deve estar na gaveta"
          highlight
        />
      </div>

      {podeRegistrar && (
        <div className="flex flex-wrap gap-2">
          {(["saldo_inicial", "suprimento", "sangria"] as CaixaMovimentoTipo[]).map((t) => (
            <button
              key={t}
              type="button"
              disabled={diaBloqueado}
              onClick={() => setDialogTipo(t)}
              title={diaBloqueado ? "O caixa desta data já foi fechado." : undefined}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t === "sangria" ? (
                <ArrowDownCircle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
              )}
              Registrar {TIPO_MOVIMENTO[t].label.toLowerCase()}
            </button>
          ))}
        </div>
      )}

      {movimentos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
          <Wallet className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhuma movimentação física registrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Saldo inicial, suprimentos e sangrias do dia aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Horário</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTimeITV(m.ocorrido_em)}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{TIPO_MOVIMENTO[m.tipo].label}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {m.motivo}
                    {m.observacao ? <p className="text-xs">{m.observacao}</p> : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.responsavel?.full_name ?? "—"}</td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-semibold",
                      TIPO_MOVIMENTO[m.tipo].sinal === -1 ? "text-destructive" : "text-primary",
                    )}
                  >
                    {TIPO_MOVIMENTO[m.tipo].sinal === -1 ? "−" : "+"}
                    {formatCurrencyBRL(m.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MovimentoDialog
        tipo={dialogTipo}
        date={date}
        onOpenChange={(v) => !v && setDialogTipo(null)}
        onDone={() => {
          refresh();
          setDialogTipo(null);
        }}
      />
    </div>
  );
}

function MovimentoDialog({
  tipo,
  date,
  onOpenChange,
  onDone,
}: {
  tipo: CaixaMovimentoTipo | null;
  date: string;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [valor, setValor] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!tipo) return;
    if (valor == null || valor <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error("Descreva o motivo da movimentação.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("caixa_movimento_registrar", {
        p_data: date,
        p_tipo: tipo,
        p_valor: valor,
        p_motivo: motivo.trim(),
        ...(observacao.trim() ? { p_observacao: observacao.trim() } : {}),
      });
      if (error) {
        toast.error("Não foi possível registrar a movimentação.");
        return;
      }
      const res = data as { ok: boolean; message?: string };
      if (!res.ok) {
        toast.error(res.message ?? "Operação não concluída.");
        return;
      }
      toast.success("Movimentação registrada.");
      setValor(null);
      setMotivo("");
      setObservacao("");
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!tipo} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tipo ? TIPO_MOVIMENTO[tipo].label : ""}</DialogTitle>
          <DialogDescription>
            {tipo === "sangria"
              ? "Retirada de dinheiro da gaveta. Não altera faturamento nem receita líquida."
              : "Entrada de dinheiro na gaveta. Não altera faturamento nem receita líquida."}
          </DialogDescription>
        </DialogHeader>

        <div>
          <label htmlFor="mv-valor" className={labelClass}>
            Valor
          </label>
          <MoneyInput id="mv-valor" value={valor} onChange={setValor} autoFocus />
        </div>
        <div>
          <label htmlFor="mv-motivo" className={labelClass}>
            Motivo
          </label>
          <input
            id="mv-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={tipo === "sangria" ? "Ex.: Depósito bancário" : "Ex.: Troco do dia"}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="mv-obs" className={labelClass}>
            Observação <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <textarea
            id="mv-obs"
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
            Registrar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
