import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  ContaPagarSaldo,
  ContaReceberSaldo,
  PagamentoConta,
  RecebimentoConta,
} from "@/lib/financeiro";
import { rpcFin, useFinanceiroRefs } from "./shared";

function invalidateFinanceiro(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
  void queryClient.invalidateQueries({ queryKey: ["caixa"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard-indicadores"] });
}

/* ============================= REGISTRAR PAGAMENTO ============================= */

export function PagarDialog({ conta, onClose }: { conta: ContaPagarSaldo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const refs = useFinanceiroRefs(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(todayManausISO());
  const [valor, setValor] = useState<number | null>(conta.saldo);
  const [formaId, setFormaId] = useState(conta.forma_pagamento_id ?? "");
  const [observacao, setObservacao] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await rpcFin("contas_pagar_pagar", {
        p_conta_id: conta.id,
        p_data_pagamento: data,
        p_valor: valor,
        p_forma_pagamento_id: formaId || null,
        p_observacao: observacao || null,
      });
      toast.success(
        r.saldo === 0
          ? "Pagamento registrado. Conta quitada."
          : `Pagamento parcial registrado. Saldo: ${formatCurrencyBRL(Number(r.saldo))}.`,
      );
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pagamento</DialogTitle>
          <DialogDescription>
            {conta.descricao}
            {conta.parcela_total ? ` · Parcela ${conta.parcela_atual}/${conta.parcela_total}` : ""} — Saldo:{" "}
            <strong>{formatCurrencyBRL(conta.saldo)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="pg-data" className={labelClass}>Data *</label>
              <input
                id="pg-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="pg-valor" className={labelClass}>Valor Pago *</label>
              <MoneyInput id="pg-valor" value={valor} onChange={setValor} />
            </div>
          </div>
          <div>
            <label htmlFor="pg-forma" className={labelClass}>Forma de Pagamento</label>
            <select id="pg-forma" value={formaId} onChange={(e) => setFormaId(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {(refs.data?.formas ?? []).map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pg-obs" className={labelClass}>Observação</label>
            <Textarea id="pg-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !valor || !data}>
              {saving ? "Registrando…" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= REGISTRAR RECEBIMENTO ============================= */

export function ReceberDialog({ conta, onClose }: { conta: ContaReceberSaldo; onClose: () => void }) {
  const queryClient = useQueryClient();
  const refs = useFinanceiroRefs(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(todayManausISO());
  const [valor, setValor] = useState<number | null>(conta.saldo);
  const [formaId, setFormaId] = useState("");
  const [referencia, setReferencia] = useState("");
  const [observacao, setObservacao] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await rpcFin("contas_receber_receber", {
        p_conta_id: conta.id,
        p_data_recebimento: data,
        p_valor: valor,
        p_forma_pagamento_id: formaId,
        p_observacao: observacao || null,
        p_referencia: referencia || null,
      });
      toast.success(
        r.saldo === 0
          ? "Recebimento registrado e lançado no Caixa. Conta quitada."
          : `Recebimento parcial lançado no Caixa. Saldo: ${formatCurrencyBRL(Number(r.saldo))}.`,
      );
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar recebimento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Recebimento</DialogTitle>
          <DialogDescription>
            {conta.cliente} — {conta.descricao}
            {conta.parcela_total ? ` · Parcela ${conta.parcela_atual}/${conta.parcela_total}` : ""} — Saldo:{" "}
            <strong>{formatCurrencyBRL(conta.saldo)}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
            O valor será lançado automaticamente no Caixa Diário da data informada, sem dupla contabilização.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rc-data" className={labelClass}>Data *</label>
              <input
                id="rc-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="rc-valor" className={labelClass}>Valor Recebido *</label>
              <MoneyInput id="rc-valor" value={valor} onChange={setValor} />
            </div>
          </div>
          <div>
            <label htmlFor="rc-forma" className={labelClass}>Forma de Pagamento *</label>
            <select id="rc-forma" value={formaId} onChange={(e) => setFormaId(e.target.value)} className={inputClass}>
              <option value="">Selecione…</option>
              {(refs.data?.formas ?? []).map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rc-ref" className={labelClass}>Referência</label>
            <input
              id="rc-ref"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              className={inputClass}
              placeholder="Nº do comprovante, NSU, etc."
            />
          </div>
          <div>
            <label htmlFor="rc-obs" className={labelClass}>Observação</label>
            <Textarea id="rc-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !valor || !data || !formaId}>
              {saving ? "Registrando…" : "Confirmar recebimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= ESTORNO DE MOVIMENTO ============================= */

export function EstornoMovimentoDialog({
  tipo,
  movimentoId,
  valor,
  data,
  onClose,
}: {
  tipo: "pagar" | "receber";
  movimentoId: string;
  valor: number;
  data: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");
  const ehPagamento = tipo === "pagar";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin(ehPagamento ? "contas_pagar_estornar_pagamento" : "contas_receber_estornar_recebimento", {
        [ehPagamento ? "p_pagamento_id" : "p_recebimento_id"]: movimentoId,
        p_motivo: motivo,
      });
      toast.success(
        ehPagamento
          ? "Pagamento estornado (movimento reverso criado)."
          : "Recebimento estornado e lançamento do Caixa estornado junto.",
      );
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao estornar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar {ehPagamento ? "Pagamento" : "Recebimento"}</DialogTitle>
          <DialogDescription>
            {formatDateOnlyISO(data)} · {formatCurrencyBRL(valor)} — o movimento original será preservado e um
            movimento reverso será criado.
            {!ehPagamento && " O lançamento correspondente no Caixa Diário também será estornado."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="est-motivo" className={labelClass}>Motivo *</label>
            <Textarea
              id="est-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={saving || !motivo.trim()}>
              {saving ? "Estornando…" : "Confirmar estorno"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= CANCELAR (despesa / conta) ============================= */

export function CancelarFinanceiroDialog({
  tipo,
  id,
  titulo,
  onClose,
}: {
  tipo: "despesa" | "pagar" | "receber";
  id: string;
  titulo: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");

  const rpc =
    tipo === "despesa" ? "despesas_cancelar" : tipo === "pagar" ? "contas_pagar_cancelar" : "contas_receber_cancelar";
  const nome = tipo === "despesa" ? "despesa" : tipo === "pagar" ? "conta a pagar" : "conta a receber";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin(rpc, { p_id: id, p_motivo: motivo });
      toast.success(`Cancelamento de ${nome} registrado.`);
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cancelar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar {nome}</DialogTitle>
          <DialogDescription>
            {titulo} — o registro não será apagado, apenas cancelado com motivo auditado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="canc-motivo" className={labelClass}>Motivo *</label>
            <Textarea
              id="canc-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={saving || !motivo.trim()}>
              {saving ? "Cancelando…" : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= HISTÓRICO DE MOVIMENTOS ============================= */

export function MovimentosContaList({
  tipo,
  contaId,
  podeEstornar,
}: {
  tipo: "pagar" | "receber";
  contaId: string;
  podeEstornar: boolean;
}) {
  const [estornoTarget, setEstornoTarget] = useState<{ id: string; valor: number; data: string } | null>(null);
  const ehPagamento = tipo === "pagar";

  const movimentosQuery = useQuery({
    queryKey: ["financeiro", "movimentos", tipo, contaId],
    queryFn: async () => {
      if (ehPagamento) {
        const { data, error } = await supabase
          .from("contas_pagar_pagamentos")
          .select("*, forma:formas_pagamento(nome), responsavel:profiles!pago_por(full_name)")
          .eq("conta_pagar_id", contaId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data as unknown as PagamentoConta[];
      }
      const { data, error } = await supabase
        .from("contas_receber_recebimentos")
        .select("*, forma:formas_pagamento(nome), responsavel:profiles!recebido_por(full_name)")
        .eq("conta_receber_id", contaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as RecebimentoConta[];
    },
  });

  const movimentos = movimentosQuery.data ?? [];
  const estornados = new Set(movimentos.map((m) => m.estorno_de_id).filter(Boolean));

  if (movimentosQuery.isLoading) {
    return <p className="px-3 py-2 text-xs text-muted-foreground">Carregando histórico…</p>;
  }
  if (movimentos.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        Nenhum {ehPagamento ? "pagamento" : "recebimento"} registrado.
      </p>
    );
  }

  return (
    <div className="px-3 pb-3">
      <ul className="divide-y divide-border rounded-md border border-border">
        {movimentos.map((m) => {
          const ehEstorno = !!m.estorno_de_id;
          const foiEstornado = estornados.has(m.id);
          const data = ehPagamento
            ? (m as PagamentoConta).data_pagamento
            : (m as RecebimentoConta).data_recebimento;
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <span className="text-muted-foreground">{formatDateOnlyISO(data)}</span>
              <span
                className={cn(
                  "font-semibold",
                  ehEstorno ? "text-destructive" : ehPagamento ? "text-foreground" : "text-primary",
                )}
              >
                {ehEstorno ? "− " : ""}
                {formatCurrencyBRL(Math.abs(m.valor))}
              </span>
              {m.forma?.nome && <span className="text-muted-foreground">· {m.forma.nome}</span>}
              {ehEstorno && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                  Estorno
                </span>
              )}
              {foiEstornado && !ehEstorno && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Estornado
                </span>
              )}
              {m.responsavel?.full_name && (
                <span className="text-muted-foreground">· por {m.responsavel.full_name}</span>
              )}
              {(m.observacao || m.motivo_estorno) && (
                <span className="w-full truncate text-muted-foreground">
                  {m.motivo_estorno ? `Motivo: ${m.motivo_estorno}` : m.observacao}
                </span>
              )}
              {podeEstornar && !ehEstorno && !foiEstornado && (
                <button
                  type="button"
                  onClick={() => setEstornoTarget({ id: m.id, valor: m.valor, data })}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Estornar
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {estornoTarget && (
        <EstornoMovimentoDialog
          tipo={tipo}
          movimentoId={estornoTarget.id}
          valor={estornoTarget.valor}
          data={estornoTarget.data}
          onClose={() => setEstornoTarget(null)}
        />
      )}
    </div>
  );
}
