import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/caixa/money-input";
import {
  inputClass,
  labelClass,
  round2,
  type CaixaFechamento,
  type CaixaRpcResult,
} from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { CaixaFisicoResumo } from "@/lib/governanca";

const voltarBtnClass =
  "rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary";

interface FecharCaixaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  /** Entradas em espécie do dia (pagamentos em formas marcadas como dinheiro). */
  dinheiroEsperado: number;
  /** Resumo do caixa físico (saldo inicial, suprimentos e sangrias). */
  fisico?: CaixaFisicoResumo | undefined;
  totais: { faturamento: number; taxas: number; liquida: number };
  onDone: () => void;
}

export function FecharCaixaDialog({
  open,
  onOpenChange,
  date,
  dinheiroEsperado,
  fisico,
  totais,
  onDone,
}: FecharCaixaDialogProps) {
  const saldoEsperado = fisico?.ok ? fisico.saldo_esperado : dinheiroEsperado;
  const [dinheiroInformado, setDinheiroInformado] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDinheiroInformado(null);
      setObservacao("");
    }
  }, [open]);

  const diferenca = useMemo(
    () => (dinheiroInformado == null ? null : round2(dinheiroInformado - saldoEsperado)),
    [dinheiroInformado, saldoEsperado],
  );
  const precisaObservacao = diferenca != null && diferenca !== 0;

  async function submit() {
    if (dinheiroInformado == null || dinheiroInformado < 0) {
      toast.error("Informe o valor em dinheiro contado no caixa.");
      return;
    }
    if (precisaObservacao && !observacao.trim()) {
      toast.error("Há divergência no dinheiro. Informe uma observação para concluir o fechamento.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("caixa_fechar", {
        p_data_referencia: date,
        p_dinheiro_informado: dinheiroInformado,
        ...(observacao.trim() ? { p_observacao: observacao.trim() } : {}),
      });
      if (error) {
        toast.error("Não foi possível fechar o caixa. Tente novamente.");
        return;
      }
      const result = data as CaixaRpcResult;
      if (!result.ok) {
        toast.error(result.message ?? "Operação não concluída.");
        return;
      }
      toast.success("Caixa fechado com sucesso.");
      onDone();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" aria-hidden="true" />
            Fechar caixa — {formatDateOnlyISO(date)}
          </DialogTitle>
          <DialogDescription>
            Após o fechamento, os lançamentos do dia ficam bloqueados para edição.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 rounded-lg bg-muted px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Faturamento do dia</dt>
            <dd className="font-semibold text-foreground">
              {formatCurrencyBRL(totais.faturamento)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Taxas</dt>
            <dd className="font-semibold text-foreground">{formatCurrencyBRL(totais.taxas)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Receita líquida</dt>
            <dd className="font-semibold text-foreground">{formatCurrencyBRL(totais.liquida)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="text-muted-foreground">Saldo inicial</dt>
            <dd className="font-medium text-foreground">
              {formatCurrencyBRL(fisico?.saldo_inicial ?? 0)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Entradas em dinheiro</dt>
            <dd className="font-medium text-foreground">
              {formatCurrencyBRL(fisico?.entradas_dinheiro ?? dinheiroEsperado)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Suprimentos</dt>
            <dd className="font-medium text-foreground">
              + {formatCurrencyBRL(fisico?.suprimentos ?? 0)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Sangrias</dt>
            <dd className="font-medium text-foreground">
              − {formatCurrencyBRL(fisico?.sangrias ?? 0)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2">
            <dt className="text-muted-foreground">Saldo físico esperado</dt>
            <dd className="font-semibold text-foreground">{formatCurrencyBRL(saldoEsperado)}</dd>
          </div>
        </dl>

        <div>
          <label htmlFor="cx-fechar-dinheiro" className={labelClass}>
            Saldo físico contado na gaveta
          </label>
          <MoneyInput
            id="cx-fechar-dinheiro"
            value={dinheiroInformado}
            onChange={setDinheiroInformado}
            autoFocus
          />
        </div>

        {diferenca != null && (
          <p
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium",
              diferenca === 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
            )}
          >
            {diferenca === 0
              ? "Saldo físico confere com o esperado."
              : `Divergência de ${formatCurrencyBRL(diferenca)} — informe uma observação abaixo.`}
          </p>
        )}

        <div>
          <label htmlFor="cx-fechar-obs" className={labelClass}>
            Observação{" "}
            {precisaObservacao ? (
              ""
            ) : (
              <span className="font-normal text-muted-foreground">(opcional)</span>
            )}
          </label>
          <textarea
            id="cx-fechar-obs"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder={precisaObservacao ? "Obrigatória quando há divergência" : ""}
            className={cn(inputClass, "resize-none")}
          />
        </div>

        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={voltarBtnClass}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar fechamento
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ReabrirDialogProps {
  fechamento: CaixaFechamento | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function ReabrirCaixaDialog({ fechamento, onOpenChange, onDone }: ReabrirDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const open = !!fechamento;

  useEffect(() => {
    if (open) setMotivo("");
  }, [open]);

  async function submit() {
    if (!fechamento) return;
    if (!motivo.trim()) {
      toast.error("Informe a justificativa da reabertura.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("caixa_reabrir", {
        p_fechamento_id: fechamento.id,
        p_motivo: motivo.trim(),
      });
      if (error) {
        toast.error("Não foi possível reabrir o caixa. Tente novamente.");
        return;
      }
      const result = data as CaixaRpcResult;
      if (!result.ok) {
        toast.error(result.message ?? "Operação não concluída.");
        return;
      }
      toast.success("Caixa reaberto. Os lançamentos do dia podem ser ajustados.");
      onDone();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir caixa</DialogTitle>
          <DialogDescription>
            {fechamento
              ? `Caixa de ${formatDateOnlyISO(fechamento.data_referencia)} será reaberto para ajustes. A ação fica registrada na auditoria.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="cx-reabrir-motivo" className={labelClass}>
            Justificativa da reabertura
          </label>
          <textarea
            id="cx-reabrir-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Lançamento faltante identificado após o fechamento"
            className={cn(inputClass, "resize-none")}
          />
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={voltarBtnClass}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar reabertura
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
