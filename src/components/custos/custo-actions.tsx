import { mensagemErro } from "@/lib/erros";
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { inputClass, labelClass } from "@/lib/caixa";
import type { CustoOS, CustosRpcResult } from "@/lib/custos";
import { formatCurrencyBRL } from "@/lib/format";

interface ActionProps {
  custo: CustoOS | null;
  onClose: () => void;
  onDone: () => void;
}

/** Confirmação de custo (aprovação gerencial). */
export function ConfirmarCustoDialog({ custo, onClose, onDone }: ActionProps) {
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    if (!custo) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("custos_confirmar", { p_id: custo.id });
      if (error) throw error;
      const res = data as unknown as CustosRpcResult;
      if (!res.ok) {
        toast.error(res.message ?? "Não foi possível confirmar.");
        return;
      }
      toast.success("Custo confirmado.");
      onClose();
      onDone();
    } catch (e) {
      toast.error(mensagemErro(e, "Erro inesperado."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!custo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar custo</DialogTitle>
          <DialogDescription>
            Confirma o custo de {formatCurrencyBRL(custo?.custo_total ?? 0)} da OS {custo?.os}? Registros
            confirmados seguem válidos nos cálculos e indicam conferência gerencial.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Voltar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Cancelamento de custo com motivo obrigatório. */
export function CancelarCustoDialog({ custo, onClose, onDone }: ActionProps) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (custo) setMotivo("");
  }, [custo]);

  async function handleCancel() {
    if (!custo || !motivo.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("custos_cancelar", {
        p_id: custo.id,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      const res = data as unknown as CustosRpcResult;
      if (!res.ok) {
        toast.error(res.message ?? "Não foi possível cancelar.");
        return;
      }
      toast.success("Custo cancelado.");
      onClose();
      onDone();
    } catch (e) {
      toast.error(mensagemErro(e, "Erro inesperado."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!custo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar custo</DialogTitle>
          <DialogDescription>
            O registro será mantido com status Cancelado e sairá dos cálculos. O motivo é obrigatório e fica
            registrado em auditoria.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="cancel-motivo" className={labelClass}>Motivo *</label>
          <textarea
            id="cancel-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Ex: lançamento duplicado"
            className={inputClass}
          />
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Voltar
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={!motivo.trim() || saving}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Cancelar custo
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Devolução/estorno total ou parcial — mantém os dois movimentos. */
export function DevolverCustoDialog({ custo, onClose, onDone }: ActionProps) {
  const [quantidade, setQuantidade] = useState("1");
  const [valor, setValor] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const restante = useMemo(
    () => (custo ? custo.custo_total - custo.devolvido_total : 0),
    [custo],
  );

  useEffect(() => {
    if (custo) {
      setQuantidade(String(custo.quantidade));
      setValor(custo.custo_total - custo.devolvido_total);
      setMotivo("");
    }
  }, [custo]);

  const qtd = useMemo(() => {
    const n = Number(quantidade.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [quantidade]);

  const podeSalvar =
    !!custo && qtd > 0 && qtd <= custo.quantidade && valor != null && valor > 0 && valor <= restante && !!motivo.trim() && !saving;

  async function handleDevolver() {
    if (!custo || !podeSalvar || valor == null) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("custos_devolver", {
        p_id: custo.id,
        p_quantidade: qtd,
        p_valor: valor,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      const res = data as unknown as CustosRpcResult;
      if (!res.ok) {
        toast.error(res.message ?? "Não foi possível registrar a devolução.");
        return;
      }
      toast.success("Devolução registrada.", {
        description: `Custo líquido restante: ${formatCurrencyBRL(res.custo_liquido ?? 0)}`,
      });
      onClose();
      onDone();
    } catch (e) {
      toast.error(mensagemErro(e, "Erro inesperado."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!custo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolução / Estorno de custo</DialogTitle>
          <DialogDescription>
            Registre o retorno total ou parcial deste custo (ex: peça devolvida ao fornecedor). O custo
            original é mantido e o valor devolvido reduz o custo líquido.
          </DialogDescription>
        </DialogHeader>

        {custo && (
          <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            <p>
              Custo original: <strong className="text-foreground">{formatCurrencyBRL(custo.custo_total)}</strong>
              {custo.devolvido_total > 0 && (
                <> · Já devolvido: <strong className="text-foreground">{formatCurrencyBRL(custo.devolvido_total)}</strong></>
              )}
              {" · "}Restante: <strong className="text-foreground">{formatCurrencyBRL(restante)}</strong>
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="dev-qtd" className={labelClass}>Quantidade *</label>
            <input
              id="dev-qtd"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value.replace(/[^\d.,]/g, ""))}
              className={inputClass}
            />
            {custo && qtd > custo.quantidade && (
              <p className="mt-1 text-xs text-destructive">Máximo: {custo.quantidade}</p>
            )}
          </div>
          <div>
            <label htmlFor="dev-valor" className={labelClass}>Valor devolvido *</label>
            <MoneyInput id="dev-valor" value={valor} onChange={setValor} />
            {valor != null && valor > restante && (
              <p className="mt-1 text-xs text-destructive">Máximo: {formatCurrencyBRL(restante)}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="dev-motivo" className={labelClass}>Motivo *</label>
          <textarea
            id="dev-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Ex: peça devolvida ao fornecedor"
            className={inputClass}
          />
        </div>

        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Voltar
          </button>
          <button
            type="button"
            onClick={handleDevolver}
            disabled={!podeSalvar}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Registrar devolução
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
