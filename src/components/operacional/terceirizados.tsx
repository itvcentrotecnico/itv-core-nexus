import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, formatDateTimeITV } from "@/lib/format";
import {
  rpcTerc,
  STATUS_FINANCEIRO,
  STATUS_LOTE,
  type FinanceiroStatus,
  type LiberacaoResultado,
  type LoteDetalhe,
  type LoteResumo,
  type LoteStatus,
} from "@/lib/terceirizados";
import { cn } from "@/lib/utils";
import { LoteDialog, type PrestadorOpcao } from "./terceirizados-lote-dialog";

function BadgeFinanceiro({ status }: { status: FinanceiroStatus | undefined }) {
  const s = STATUS_FINANCEIRO[status ?? "nao_liberado"] ?? STATUS_FINANCEIRO.nao_liberado;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", s.className)}>
      {s.label}
    </span>
  );
}

/** Serviços terceirizados: lotes por prestador, confirmação e liberação ao Financeiro. */
export function ServicosTerceirizados() {
  const queryClient = useQueryClient();
  const { can, isAdmin } = useAccess();
  const podeCriar = isAdmin || can("terceirizados", "criar");
  const podeLiberar = isAdmin || can("terceirizados", "aprovar");
  const podeCancelar = isAdmin || can("terceirizados", "cancelar");
  const podeDevolver = isAdmin || can("financeiro", "editar");

  const [novo, setNovo] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [fPrestador, setFPrestador] = useState("");
  const [fCompetencia, setFCompetencia] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fInicio, setFInicio] = useState("");
  const [fFim, setFFim] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const [motivoCancel, setMotivoCancel] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [liberacao, setLiberacao] = useState<LiberacaoResultado | null>(null);

  const prestadores = useQuery({
    queryKey: ["terceirizados", "prestadores"],
    queryFn: async (): Promise<PrestadorOpcao[]> => {
      const { data, error } = await supabase
        .from("fornecedores")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw new Error("Não foi possível carregar os prestadores.");
      return (data ?? []) as PrestadorOpcao[];
    },
  });

  const lotes = useQuery({
    queryKey: ["terceirizados", "lotes", fPrestador, fCompetencia, fStatus, fInicio, fFim],
    queryFn: async () => {
      const res = await rpcTerc<{ ok: boolean; message?: string; lotes: LoteResumo[] }>(
        "terceirizados_lotes_listar",
        {
          p_prestador_id: fPrestador || null,
          p_competencia: fCompetencia ? `${fCompetencia}-01` : null,
          p_status: fStatus || null,
          p_inicio: fInicio || null,
          p_fim: fFim || null,
        },
      );
      if (!res.ok) throw new Error(res.message ?? "Sem acesso aos serviços terceirizados.");
      return res.lotes;
    },
  });

  const detalhe = useQuery({
    queryKey: ["terceirizados", "detalhe", detalheId],
    enabled: !!detalheId,
    queryFn: async () => {
      const res = await rpcTerc<LoteDetalhe>("terceirizados_lote_detalhe", { p_id: detalheId });
      if (!res.ok) throw new Error(res.message ?? "Lote não encontrado.");
      return res;
    },
  });

  const liberar = useMutation({
    mutationFn: async (id: string) => {
      const res = await rpcTerc<LiberacaoResultado>("terceirizados_lote_liberar", { p_id: id });
      if (!res.ok) throw new Error(res.message ?? "Não foi possível liberar o lote.");
      return res;
    },
    onSuccess: (res) => {
      setLiberacao(res);
      toast.success("LIBERADO PARA O FINANCEIRO", {
        description: `${res.prestador ?? "Prestador"} · ${res.quantidade ?? 0} serviço(s) · ${formatCurrencyBRL(
          Number(res.valor ?? 0),
        )} · Próxima etapa: validação financeira.`,
        duration: 8000,
      });
      void queryClient.invalidateQueries({ queryKey: ["terceirizados"] });
      void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const devolver = useMutation({
    mutationFn: async (id: string) => {
      const res = await rpcTerc<{ ok: boolean; message?: string }>("terceirizados_lote_devolver", {
        p_id: id,
        p_motivo: motivoDevolucao.trim(),
      });
      if (!res.ok) throw new Error(res.message ?? "Não foi possível devolver o lote.");
      return res;
    },
    onSuccess: () => {
      toast.success("Lote devolvido ao Operacional", {
        description: "O Gerente Operacional verá o motivo no detalhe do lote.",
      });
      setDevolvendo(false);
      setMotivoDevolucao("");
      void queryClient.invalidateQueries({ queryKey: ["terceirizados"] });
      void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const res = await rpcTerc<{ ok: boolean; message?: string }>("terceirizados_lote_cancelar", {
        p_id: id,
        p_motivo: motivoCancel.trim(),
      });
      if (!res.ok) throw new Error(res.message ?? "Não foi possível cancelar o lote.");
      return res;
    },
    onSuccess: () => {
      toast.success("Lote cancelado.");
      setCancelando(false);
      setMotivoCancel("");
      void queryClient.invalidateQueries({ queryKey: ["terceirizados"] });
      void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = lotes.data ?? [];
  const lote = detalhe.data?.lote;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Registro dos serviços feitos por prestadores externos, em lote por prestador e
          competência.
        </p>
        {podeCriar && (
          <Button onClick={() => setNovo(true)}>
            <Plus className="mr-1 size-4" /> Lançar serviços em lote
          </Button>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <label className={labelClass} htmlFor="t-prestador">
            Prestador
          </label>
          <select
            id="t-prestador"
            className={inputClass}
            value={fPrestador}
            onChange={(e) => setFPrestador(e.target.value)}
          >
            <option value="">Todos</option>
            {(prestadores.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="t-competencia">
            Competência
          </label>
          <input
            id="t-competencia"
            type="month"
            className={inputClass}
            value={fCompetencia}
            onChange={(e) => setFCompetencia(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="t-status">
            Status
          </label>
          <select
            id="t-status"
            className={inputClass}
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_LOTE) as LoteStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LOTE[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="t-inicio">
            De
          </label>
          <input
            id="t-inicio"
            type="date"
            className={inputClass}
            value={fInicio}
            onChange={(e) => setFInicio(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="t-fim">
            Até
          </label>
          <input
            id="t-fim"
            type="date"
            className={inputClass}
            value={fFim}
            onChange={(e) => setFFim(e.target.value)}
          />
        </div>
      </div>

      {lotes.isLoading && <p className="text-sm text-muted-foreground">Carregando lotes…</p>}
      {lotes.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(lotes.error as Error).message}
        </p>
      )}
      {!lotes.isLoading && registros.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum lote registrado neste filtro.
        </p>
      )}

      {registros.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Lote</th>
                <th className="px-3 py-2">Prestador</th>
                <th className="px-3 py-2">Competência</th>
                <th className="px-3 py-2">Serviços</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Financeiro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {registros.map((l) => (
                <tr
                  key={l.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setDetalheId(l.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {l.id.slice(0, 8)}
                    {l.teste && (
                      <span className="ml-2 rounded bg-muted px-1 text-[10px] uppercase">teste</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{l.prestador}</td>
                  <td className="px-3 py-2">{formatDateOnlyISO(l.competencia).slice(3)}</td>
                  <td className="px-3 py-2">{l.quantidade_itens}</td>
                  <td className="px-3 py-2">{formatCurrencyBRL(Number(l.valor_total))}</td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_LOTE[l.status].className,
                      )}
                    >
                      {STATUS_LOTE[l.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LoteDialog
        aberto={novo}
        prestadores={prestadores.data ?? []}
        onFechar={() => setNovo(false)}
        onVerLote={(id) => setDetalheId(id)}
      />

      <Dialog
        open={!!detalheId}
        onOpenChange={(o) => {
          if (!o) {
            setDetalheId(null);
            setCancelando(false);
            setMotivoCancel("");
          }
        }}
      >
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhe do lote</DialogTitle>
          </DialogHeader>
          {detalhe.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {lote && (
            <div className="space-y-4">
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Prestador</dt>
                  <dd className="font-medium">{lote.prestador}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Competência</dt>
                  <dd className="font-medium">{formatDateOnlyISO(lote.competencia).slice(3)}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-medium">{formatCurrencyBRL(Number(lote.valor_total))}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">{STATUS_LOTE[lote.status].label}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Criado por</dt>
                  <dd className="font-medium">{lote.criado_por ?? "—"}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Confirmado por</dt>
                  <dd className="font-medium">{lote.confirmado_por ?? "—"}</dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Financeiro</dt>
                  <dd className="font-medium">
                    {lote.released_to_finance_at
                      ? `${lote.liberado_por ?? "—"} · ${formatDateTimeITV(lote.released_to_finance_at)}`
                      : "Ainda não liberado"}
                  </dd>
                </div>
                <div className="flex justify-between sm:block">
                  <dt className="text-muted-foreground">Origem</dt>
                  <dd className="font-medium">{lote.origem_lote}</dd>
                </div>
              </dl>

              {lote.cancel_reason && (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  Cancelado: {lote.cancel_reason}
                </p>
              )}

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">OS</th>
                      <th className="px-3 py-2">Referência</th>
                      <th className="px-3 py-2">Serviço</th>
                      <th className="px-3 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(detalhe.data?.itens ?? []).map((i) => (
                      <tr key={i.id}>
                        <td className="px-3 py-2">
                          {i.data_execucao ? formatDateOnlyISO(i.data_execucao) : "—"}
                        </td>
                        <td className="px-3 py-2">{i.os ?? "—"}</td>
                        <td className="px-3 py-2">{i.referencia ?? "—"}</td>
                        <td className="px-3 py-2">{i.descricao_servico}</td>
                        <td className="px-3 py-2">
                          {formatCurrencyBRL(Number(i.valor_devido_prestador))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {cancelando ? (
                <div className="space-y-2 rounded-xl border border-destructive/30 p-3">
                  <label className={labelClass} htmlFor="t-motivo">
                    Motivo do cancelamento
                  </label>
                  <input
                    id="t-motivo"
                    className={inputClass}
                    value={motivoCancel}
                    onChange={(e) => setMotivoCancel(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setCancelando(false)}>
                      Voltar
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={cancelar.isPending || motivoCancel.trim().length < 3}
                      onClick={() => cancelar.mutate(lote.id)}
                    >
                      {cancelar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Cancelar lote
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                  {podeCancelar &&
                    !["cancelado", "pago", "parcialmente_pago"].includes(lote.status) && (
                      <Button variant="outline" onClick={() => setCancelando(true)}>
                        Cancelar lote
                      </Button>
                    )}
                  {podeLiberar && lote.status === "confirmado" && (
                    <Button onClick={() => liberar.mutate(lote.id)} disabled={liberar.isPending}>
                      {liberar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Liberar para o Financeiro
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
