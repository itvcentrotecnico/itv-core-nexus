import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { labelClass, inputClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateBR } from "@/lib/format";
import type { FormaPagamento } from "@/lib/caixa";
import type { Comissao, ComissaoRpcResult } from "@/lib/comissoes";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  tecnicoId: string;
  tecnicoNome: string;
  comissoes: Comissao[]; // aprovadas do técnico
}

export function PagarDialog({ open, onOpenChange, tecnicoId, tecnicoNome, comissoes }: Props) {
  const queryClient = useQueryClient();
  const aprovadas = useMemo(() => comissoes.filter((c) => c.status === "aprovada"), [comissoes]);
  const [selecionadas, setSelecionadas] = useState<string[]>(aprovadas.map((c) => c.id));
  const [formaId, setFormaId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const formasQuery = useQuery({
    queryKey: ["formas-pagamento"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("formas_pagamento").select("*").eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as FormaPagamento[];
    },
  });

  const total = aprovadas
    .filter((c) => selecionadas.includes(c.id))
    .reduce((acc, c) => acc + (c.valor_aprovado ?? c.valor_final ?? 0), 0);

  const datas = aprovadas.filter((c) => selecionadas.includes(c.id)).map((c) => c.data_referencia).sort();

  async function pagar() {
    if (selecionadas.length === 0) return toast.error("Selecione ao menos uma comissão.");
    if (!formaId) return toast.error("Selecione a forma de pagamento.");
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("comissoes_pagar", {
        p_tecnico_id: tecnicoId,
        p_comissao_ids: selecionadas,
        p_forma_pagamento_id: formaId,
        p_observacao: observacao.trim() || null,
      });
      if (error) throw new Error(error.message);
      const r = data as ComissaoRpcResult & { valor_total?: number; quantidade?: number };
      if (!r.ok) throw new Error(r.message ?? "Não foi possível registrar o pagamento.");
      toast.success(`Pagamento registrado: ${r.quantidade ?? selecionadas.length} comissão(ões), ${formatCurrencyBRL(Number(r.valor_total ?? total))}.`);
      queryClient.invalidateQueries({ queryKey: ["comissoes"] });
      queryClient.invalidateQueries({ queryKey: ["comissoes-indicadores"] });
      queryClient.invalidateQueries({ queryKey: ["comissoes-pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["comissoes-por-tecnico"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível registrar o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagar Comissões — {tecnicoNome}</DialogTitle>
          <DialogDescription>
            Fechamento consolidado das comissões aprovadas. Registro permanente, não editável.
          </DialogDescription>
        </DialogHeader>

        {aprovadas.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Nenhuma comissão aprovada aguardando pagamento.
          </p>
        ) : (
          <div className="space-y-4">
            <ul className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
              {aprovadas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selecionadas.includes(c.id)}
                      onCheckedChange={(checked) =>
                        setSelecionadas((prev) => checked ? [...prev, c.id] : prev.filter((id) => id !== c.id))
                      }
                    />
                    OS {c.os} · {formatDateBR(c.data_referencia)}
                  </label>
                  <span className="text-sm font-medium">{formatCurrencyBRL(c.valor_aprovado ?? c.valor_final ?? 0)}</span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">
                {selecionadas.length} comissão(ões)
                {datas.length > 0 && <> · período {formatDateBR(datas[0])} a {formatDateBR(datas[datas.length - 1])}</>}
              </span>
              <strong className="text-base">{formatCurrencyBRL(total)}</strong>
            </div>

            <div>
              <label className={labelClass}>Forma de Pagamento *</label>
              <select className={inputClass} value={formaId} onChange={(e) => setFormaId(e.target.value)}>
                <option value="">Selecione</option>
                {(formasQuery.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>Observação</label>
              <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          {aprovadas.length > 0 && (
            <Button onClick={pagar} disabled={saving}>{saving ? "Registrando…" : `Pagar ${formatCurrencyBRL(total)}`}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
