import { mensagemErro } from "@/lib/erros";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { rpcFin } from "@/components/financeiro/shared";
import type { FolhaPagamento, FolhaResumo, FolhaRpcResult } from "@/lib/folha";
import { useFinanceiroRefs } from "@/components/financeiro/shared";
import { invalidateFolha } from "./colaborador-form";

/* ============================= PAGAMENTO INDIVIDUAL ============================= */

export function PagarDialog({
  competenciaId,
  item,
  onClose,
  onChanged,
}: {
  competenciaId: string;
  item: { colaborador_id: string; nome: string; saldo: number };
  onClose: () => void;
  onChanged: () => void;
}) {
  const formas = useFinanceiroRefs(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(todayManausISO());
  const [valor, setValor] = useState<number | null>(item.saldo);
  const [formaId, setFormaId] = useState("");
  const [observacao, setObservacao] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("folha_registrar_pagamento", {
        p_competencia_id: competenciaId,
        p_colaborador_id: item.colaborador_id,
        p_data_pagamento: data,
        p_valor: valor,
        p_forma_pagamento_id: formaId || null,
        p_observacao: observacao || null,
        p_comprovante_path: null,
      });
      toast.success("Pagamento registrado.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao registrar pagamento."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar — {item.nome}</DialogTitle>
          <DialogDescription>
            Saldo em aberto: <strong>{formatCurrencyBRL(item.saldo)}</strong>. Pagamentos parciais são permitidos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="pg-data" className={labelClass}>Data *</label>
              <input id="pg-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pg-valor" className={labelClass}>Valor *</label>
              <MoneyInput id="pg-valor" value={valor} onChange={setValor} />
            </div>
          </div>
          <div>
            <label htmlFor="pg-forma" className={labelClass}>Forma de Pagamento</label>
            <select id="pg-forma" value={formaId} onChange={(e) => setFormaId(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {(formas.data?.formas ?? []).filter((f) => f.ativo).map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="pg-obs" className={labelClass}>Observação</label>
            <Textarea id="pg-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !valor || valor <= 0}>
              {saving ? "Registrando…" : "Registrar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= PAGAMENTO EM LOTE ============================= */

export function PagarLoteDialog({
  competenciaId,
  resumo,
  onClose,
  onChanged,
}: {
  competenciaId: string;
  resumo: FolhaResumo;
  onClose: () => void;
  onChanged: () => void;
}) {
  const formas = useFinanceiroRefs(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(todayManausISO());
  const [formaId, setFormaId] = useState("");
  const [observacao, setObservacao] = useState("");
  const elegiveis = resumo.por_colaborador.filter((c) => c.saldo > 0 && (c.status === "aprovado" || c.status === "parcialmente_pago"));
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(elegiveis.map((c) => c.colaborador_id)));

  useEffect(() => {
    setSelecionados(new Set(elegiveis.map((c) => c.colaborador_id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competenciaId]);

  const totalSelecionado = elegiveis
    .filter((c) => selecionados.has(c.colaborador_id))
    .reduce((acc, c) => acc + c.saldo, 0);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("folha_pagar_lote", {
        p_competencia_id: competenciaId,
        p_colaborador_ids: Array.from(selecionados),
        p_forma_pagamento_id: formaId || null,
        p_data_pagamento: data,
        p_observacao: observacao || null,
      });
      toast.success("Pagamento em lote registrado.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha no pagamento em lote."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pagar em Lote</DialogTitle>
          <DialogDescription>
            Quita o saldo dos colaboradores selecionados (aprovados ou parcialmente pagos).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {elegiveis.length === 0 && (
              <li className="px-3 py-3 text-sm text-muted-foreground">Nenhum colaborador com saldo a pagar.</li>
            )}
            {elegiveis.map((c) => (
              <li key={c.colaborador_id} className="flex items-center gap-3 px-3 py-2">
                <input
                  id={`lote-${c.colaborador_id}`}
                  type="checkbox"
                  checked={selecionados.has(c.colaborador_id)}
                  onChange={() => toggle(c.colaborador_id)}
                  className="size-4 accent-primary"
                />
                <label htmlFor={`lote-${c.colaborador_id}`} className="flex flex-1 items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{c.nome}</span>
                  <span className="font-semibold text-primary">{formatCurrencyBRL(c.saldo)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="pl-data" className={labelClass}>Data *</label>
              <input id="pl-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pl-forma" className={labelClass}>Forma de Pagamento</label>
              <select id="pl-forma" value={formaId} onChange={(e) => setFormaId(e.target.value)} className={inputClass}>
                <option value="">—</option>
                {(formas.data?.formas ?? []).filter((f) => f.ativo).map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="pl-obs" className={labelClass}>Observação</label>
            <Textarea id="pl-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <p className="text-sm text-muted-foreground">
            Total selecionado: <strong className="text-foreground">{formatCurrencyBRL(totalSelecionado)}</strong> (
            {selecionados.size} colaborador{selecionados.size === 1 ? "" : "es"})
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || selecionados.size === 0}>
              {saving ? "Processando…" : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= HISTÓRICO DE PAGAMENTOS ============================= */

export function PagamentosList({
  competenciaId,
  canEstornar,
  onChanged,
}: {
  competenciaId: string;
  canEstornar: boolean;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [estornando, setEstornando] = useState<FolhaPagamento | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useQuery({
    queryKey: ["folha", "pagamentos", competenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folha_pagamentos")
        .select("*, forma:formas_pagamento(nome), colaborador:colaboradores(nome)")
        .eq("competencia_id", competenciaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FolhaPagamento[];
    },
  });
  const pagamentos = query.data ?? [];

  async function estornar() {
    if (!estornando) return;
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("folha_estornar_pagamento", { p_pagamento_id: estornando.id, p_motivo: motivo });
      toast.success("Pagamento estornado por movimento reverso.");
      setEstornando(null);
      setMotivo("");
      invalidateFolha(queryClient);
      onChanged();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao estornar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {pagamentos.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum pagamento nesta competência.</li>
        )}
        {pagamentos.map((p) => {
          const ehEstorno = !!p.estorno_de_id;
          const estornado = pagamentos.some((x) => x.estorno_de_id === p.id);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {p.colaborador?.nome ?? "—"}
                  {ehEstorno && <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">Estorno</span>}
                  {estornado && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Estornado</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateOnlyISO(p.data_pagamento)} · {p.forma?.nome ?? "Sem forma"}
                  {p.observacao ? ` · ${p.observacao}` : ""}
                  {p.motivo_estorno ? ` · Motivo estorno: ${p.motivo_estorno}` : ""}
                </p>
              </div>
              <span className={`font-semibold ${p.valor < 0 ? "text-destructive" : "text-primary"}`}>
                {formatCurrencyBRL(p.valor)}
              </span>
              {canEstornar && !ehEstorno && !estornado && (
                <button
                  type="button"
                  onClick={() => setEstornando(p)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Estornar
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <Dialog open={!!estornando} onOpenChange={(o) => !o && setEstornando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Estornar Pagamento</DialogTitle>
            <DialogDescription>
              Será criado um movimento reverso de {formatCurrencyBRL(estornando?.valor ?? 0)} para{" "}
              {estornando?.colaborador?.nome}. O pagamento original é preservado.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="es-motivo" className={labelClass}>Motivo *</label>
            <Textarea id="es-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEstornando(null)} disabled={saving}>Voltar</Button>
            <Button type="button" variant="destructive" disabled={saving || !motivo.trim()} onClick={estornar}>
              {saving ? "Estornando…" : "Confirmar estorno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
