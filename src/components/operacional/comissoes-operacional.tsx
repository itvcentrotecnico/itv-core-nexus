import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import { STATUS_COMISSAO, type Comissao, type ComissaoStatus } from "@/lib/comissoes";
import { rpcOp } from "@/lib/operacional";
import { cn } from "@/lib/utils";

const STATUS_OP: ComissaoStatus[] = ["gerada", "pendente_conferencia", "conferida", "devolvida", "aprovada", "paga"];

/**
 * Validação e liberação de comissões pelo Operacional.
 * O Operacional confere e libera; o pagamento continua sendo do Financeiro.
 */
export function ComissoesOperacional() {
  const queryClient = useQueryClient();
  const { can, isAdmin } = useAccess();
  const podeLiberar = isAdmin || can("operacional", "aprovar") || can("operacional", "validar");
  const podeDevolver = isAdmin || can("comissoes", "aprovar");

  const [status, setStatus] = useState<ComissaoStatus | "">("conferida");
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [devolver, setDevolver] = useState<Comissao | null>(null);
  const [motivo, setMotivo] = useState("");

  const lista = useQuery({
    queryKey: ["operacional", "comissoes", status, busca],
    queryFn: async () => {
      let q = supabase
        .from("comissoes")
        .select("*, tecnico:profiles!comissoes_tecnico_id_fkey(full_name)")
        .order("data_referencia", { ascending: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      if (busca.trim()) q = q.ilike("os", `%${busca.trim()}%`);
      const { data, error } = await q;
      if (error) throw new Error("Não foi possível carregar as comissões agora.");
      return (data ?? []) as unknown as Comissao[];
    },
  });

  const liberar = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) throw new Error("Selecione ao menos uma comissão.");
      return rpcOp<{ ok?: boolean; message?: string; liberadas?: number }>("operacional_comissoes_liberar", { p_ids: ids });
    },
    onSuccess: (res) => {
      if (res?.ok === false) {
        toast.error(res.message ?? "Não foi possível liberar as comissões.");
        return;
      }
      toast.success(`${res?.liberadas ?? 0} comissão(ões) liberada(s) para o Financeiro.`);
      setSelecionadas([]);
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
      void queryClient.invalidateQueries({ queryKey: ["comissoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const devolucao = useMutation({
    mutationFn: async () => {
      if (!devolver) return;
      if (!motivo.trim()) throw new Error("Informe o motivo da devolução.");
      return rpcOp<{ ok?: boolean; message?: string }>("comissoes_devolver", { p_id: devolver.id, p_motivo: motivo.trim() });
    },
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.message ?? "Não foi possível devolver a comissão.");
        return;
      }
      toast.success("Comissão devolvida ao Operacional.");
      setDevolver(null);
      setMotivo("");
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
      void queryClient.invalidateQueries({ queryKey: ["comissoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = lista.data ?? [];
  const total = registros
    .filter((c) => selecionadas.includes(c.id))
    .reduce((acc, c) => acc + Number(c.valor_final ?? c.valor_calculado ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="com-status">Status</label>
          <select id="com-status" className={inputClass} value={status} onChange={(e) => { setStatus(e.target.value as ComissaoStatus | ""); setSelecionadas([]); }}>
            <option value="">Todos</option>
            {STATUS_OP.map((s) => (
              <option key={s} value={s}>{STATUS_COMISSAO[s].label}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass} htmlFor="com-busca">Buscar por OS</label>
          <input id="com-busca" className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Número da OS" />
        </div>
      </div>

      {podeLiberar && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
          <p className="text-sm text-muted-foreground">
            {selecionadas.length} selecionada(s) · {formatCurrencyBRL(total)}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelecionadas(registros.map((c) => c.id))}
              disabled={registros.length === 0}
            >
              Selecionar tudo
            </Button>
            <Button size="sm" onClick={() => liberar.mutate(selecionadas)} disabled={liberar.isPending || selecionadas.length === 0}>
              Liberar para o Financeiro
            </Button>
          </div>
        </div>
      )}

      {lista.isLoading && <p className="text-sm text-muted-foreground">Carregando comissões…</p>}
      {lista.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(lista.error as Error).message}
        </p>
      )}
      {!lista.isLoading && registros.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma comissão neste filtro.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {registros.map((c) => {
          const marcada = selecionadas.includes(c.id);
          const badge = STATUS_COMISSAO[c.status];
          return (
            <article key={c.id} className={cn("rounded-xl border bg-card p-4", marcada ? "border-primary" : "border-border")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-base font-bold text-foreground">OS {c.os}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateOnlyISO(c.data_referencia)} · {c.tecnico?.full_name ?? "Técnico não informado"}
                  </p>
                </div>
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", badge.className)}>{badge.label}</span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <div><dt className="inline font-medium">Receita líquida: </dt><dd className="inline">{formatCurrencyBRL(Number(c.receita_liquida ?? 0))}</dd></div>
                <div><dt className="inline font-medium">Peças/custos: </dt><dd className="inline">{formatCurrencyBRL(Number(c.custos_diretos ?? 0))}</dd></div>
                <div><dt className="inline font-medium">Base: </dt><dd className="inline">{formatCurrencyBRL(Number(c.base_calculo ?? 0))}</dd></div>
                <div><dt className="inline font-medium">Valor: </dt><dd className="inline font-semibold text-foreground">{formatCurrencyBRL(Number(c.valor_final ?? c.valor_calculado ?? 0))}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {podeLiberar && (c.status === "gerada" || c.status === "pendente_conferencia" || c.status === "conferida" || c.status === "devolvida") && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={(e) =>
                        setSelecionadas((prev) => (e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)))
                      }
                    />
                    Selecionar para liberação
                  </label>
                )}
                {podeDevolver && c.status !== "paga" && c.status !== "cancelada" && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDevolver(c)}>
                    Devolver ao Operacional
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <Dialog open={!!devolver} onOpenChange={(v) => !v && setDevolver(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver comissão</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">OS {devolver?.os}</p>
            <div>
              <label className={labelClass} htmlFor="dev-motivo">Motivo da devolução</label>
              <textarea id="dev-motivo" className={`${inputClass} min-h-24`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDevolver(null)}>Cancelar</Button>
              <Button onClick={() => devolucao.mutate()} disabled={devolucao.isPending}>Confirmar devolução</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
