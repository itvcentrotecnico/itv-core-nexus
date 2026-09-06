import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  inputClass,
  labelClass,
  type CaixaLancamento,
  type CaixaRpcResult,
  type FormaPagamento,
} from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";

const NONE = "__none__";

function ResumoLancamento({ lancamento }: { lancamento: CaixaLancamento }) {
  return (
    <ul className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
      <li>
        <strong>Data:</strong> {formatDateOnlyISO(lancamento.data_lancamento)}
      </li>
      {lancamento.os && (
        <li>
          <strong>OS:</strong> {lancamento.os}
        </li>
      )}
      {lancamento.cliente && (
        <li>
          <strong>Cliente:</strong> {lancamento.cliente}
        </li>
      )}
      <li>
        <strong>Valor:</strong> {formatCurrencyBRL(lancamento.valor_final)}
      </li>
    </ul>
  );
}

const cancelBtnClass =
  "rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary";

interface CancelarDialogProps {
  lancamento: CaixaLancamento | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function CancelarLancamentoDialog({
  lancamento,
  onOpenChange,
  onDone,
}: CancelarDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const open = !!lancamento;

  useEffect(() => {
    if (open) setMotivo("");
  }, [open]);

  async function submit() {
    if (!lancamento) return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("caixa_cancelar_lancamento", {
        p_id: lancamento.id,
        p_motivo: motivo.trim(),
      });
      if (error) {
        toast.error("Não foi possível cancelar. Tente novamente.");
        return;
      }
      const result = data as CaixaRpcResult;
      if (!result.ok) {
        toast.error(result.message ?? "Operação não concluída.");
        return;
      }
      toast.success("Lançamento cancelado.");
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
          <DialogTitle>Cancelar lançamento</DialogTitle>
          <DialogDescription>
            O lançamento deixa de compor o caixa, mas fica registrado para auditoria.
          </DialogDescription>
        </DialogHeader>
        {lancamento && <ResumoLancamento lancamento={lancamento} />}
        <div>
          <label htmlFor="cx-cancel-motivo" className={labelClass}>
            Motivo do cancelamento
          </label>
          <textarea
            id="cx-cancel-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Lançamento digitado em duplicidade"
            className={cn(inputClass, "resize-none")}
          />
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={cancelBtnClass}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar cancelamento
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EstornarDialogProps {
  lancamento: CaixaLancamento | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function EstornarLancamentoDialog({
  lancamento,
  onOpenChange,
  onDone,
}: EstornarDialogProps) {
  const [motivo, setMotivo] = useState("");
  const [formaEstorno, setFormaEstorno] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const open = !!lancamento;

  const formasQuery = useQuery({
    queryKey: ["caixa", "formas-pagamento"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .select("id, nome, ativo, ordem, eh_dinheiro, taxa_padrao_percentual")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as FormaPagamento[];
    },
  });

  useEffect(() => {
    if (open) {
      setMotivo("");
      setFormaEstorno("");
      setObservacao("");
    }
  }, [open]);

  async function submit() {
    if (!lancamento) return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo do estorno.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("caixa_estornar_lancamento", {
        p_id: lancamento.id,
        p_motivo: motivo.trim(),
        ...(formaEstorno ? { p_forma_estorno: formaEstorno } : {}),
        ...(observacao.trim() ? { p_observacao: observacao.trim() } : {}),
      });
      if (error) {
        toast.error("Não foi possível estornar. Tente novamente.");
        return;
      }
      const result = data as CaixaRpcResult;
      if (!result.ok) {
        toast.error(result.message ?? "Operação não concluída.");
        return;
      }
      toast.success("Lançamento estornado.");
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
          <DialogTitle>Estornar lançamento</DialogTitle>
          <DialogDescription>
            Registra a devolução do valor ao cliente. O lançamento fica marcado como estornado e sai
            dos totais do caixa.
          </DialogDescription>
        </DialogHeader>
        {lancamento && <ResumoLancamento lancamento={lancamento} />}
        <div className="space-y-4">
          <div>
            <label htmlFor="cx-est-motivo" className={labelClass}>
              Motivo do estorno
            </label>
            <textarea
              id="cx-est-motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: Cliente desistiu do serviço"
              className={cn(inputClass, "resize-none")}
            />
          </div>
          <div>
            <label className={labelClass}>
              Forma de devolução{" "}
              <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <Select
              value={formaEstorno || NONE}
              onValueChange={(v) => setFormaEstorno(v === NONE ? "" : v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informado</SelectItem>
                {(formasQuery.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.nome}>
                    {f.nome}
                  </SelectItem>
                ))}
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="cx-est-obs" className={labelClass}>
              Observação <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="cx-est-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className={cn(inputClass, "resize-none")}
            />
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={() => onOpenChange(false)} className={cancelBtnClass}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar estorno
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
