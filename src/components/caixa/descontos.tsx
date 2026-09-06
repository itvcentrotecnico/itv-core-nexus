import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, ShieldQuestion, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { MoneyInput } from "@/components/caixa/money-input";
import { KpiCard } from "@/components/caixa/kpi-card";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateTimeITV, todayManausISO } from "@/lib/format";
import {
  STATUS_DESCONTO,
  type DescontoAutorizacao,
  type DescontosIndicadores,
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
  "rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary";

/* --------------------------- Solicitação de autorização --------------------------- */

interface SolicitarProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Dados pré-preenchidos vindos do lançamento em edição. */
  contexto: {
    os: string | null;
    cliente: string | null;
    valorOriginal: number;
    valorDesconto: number;
  };
  limite: number | null;
  onSolicitado: () => void;
}

export function SolicitarDescontoDialog({
  open,
  onOpenChange,
  contexto,
  limite,
  onSolicitado,
}: SolicitarProps) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const percentual =
    contexto.valorOriginal > 0 ? (contexto.valorDesconto / contexto.valorOriginal) * 100 : 0;

  async function submit() {
    if (motivo.trim().length < 5) {
      toast.error("Descreva a justificativa comercial do desconto.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("desconto_solicitar", {
        p_os: contexto.os ?? "",
        p_cliente: contexto.cliente ?? "",
        p_valor_original: contexto.valorOriginal,
        p_valor_desconto: contexto.valorDesconto,
        p_motivo: motivo.trim(),
      });
      if (error) {
        toast.error("Não foi possível enviar a solicitação.");
        return;
      }
      const res = data as { ok: boolean; message?: string };
      if (!res.ok) {
        toast.error(res.message ?? "Operação não concluída.");
        return;
      }
      toast.success("Solicitação enviada para autorização do gestor.");
      setMotivo("");
      onSolicitado();
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
            <ShieldQuestion className="h-4 w-4 text-primary" aria-hidden="true" />
            Solicitar autorização de desconto
          </DialogTitle>
          <DialogDescription>
            O desconto informado ultrapassa sua alçada
            {limite != null ? ` de ${limite.toFixed(2).replace(".", ",")}%` : ""}. Envie para
            aprovação de um gestor — a decisão fica registrada na auditoria.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 rounded-lg bg-muted px-4 py-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">OS</dt>
            <dd className="font-medium text-foreground">{contexto.os || "—"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Valor bruto</dt>
            <dd className="font-medium text-foreground">
              {formatCurrencyBRL(contexto.valorOriginal)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Desconto solicitado</dt>
            <dd className="font-semibold text-destructive">
              {formatCurrencyBRL(contexto.valorDesconto)} ({percentual.toFixed(2).replace(".", ",")}
              %)
            </dd>
          </div>
        </dl>

        <div>
          <label htmlFor="dsc-motivo" className={labelClass}>
            Justificativa comercial
          </label>
          <textarea
            id="dsc-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Cliente recorrente com três aparelhos no mesmo atendimento"
            className={cn(inputClass, "resize-none")}
          />
        </div>

        <DialogFooter>
          <button type="button" className={botaoSecundario} onClick={() => onOpenChange(false)}>
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Enviar solicitação
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Painel de descontos --------------------------------- */

export function DescontosSection({ periodo }: { periodo: { inicio: string; fim: string } }) {
  const { can } = useAccess();
  const queryClient = useQueryClient();
  const podeAprovar = can("caixa", "aprovar");
  const [decisao, setDecisao] = useState<{ item: DescontoAutorizacao; aprovar: boolean } | null>(
    null,
  );
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const [filtro, setFiltro] = useState<"pendente" | "todos">("pendente");

  const indicadoresQuery = useQuery({
    queryKey: ["caixa", "descontos-indicadores", periodo.inicio, periodo.fim],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("descontos_indicadores", {
        p_from: periodo.inicio,
        p_to: periodo.fim,
      });
      if (error) throw error;
      return data as unknown as DescontosIndicadores;
    },
  });

  const listaQuery = useQuery({
    queryKey: ["caixa", "descontos-autorizacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("descontos_autorizacoes")
        .select(
          "*, solicitante:profiles!descontos_autorizacoes_solicitado_por_fkey(full_name), decisor:profiles!descontos_autorizacoes_decidido_por_fkey(full_name)",
        )
        .order("solicitado_em", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as DescontoAutorizacao[];
    },
  });

  const ind = indicadoresQuery.data;
  const lista = useMemo(
    () =>
      (listaQuery.data ?? []).filter((d) =>
        filtro === "pendente" ? d.status === "pendente" : true,
      ),
    [listaQuery.data, filtro],
  );

  async function decidir() {
    if (!decisao) return;
    if (!decisao.aprovar && comentario.trim().length < 3) {
      toast.error("Informe o motivo da recusa.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("desconto_decidir", {
        p_id: decisao.item.id,
        p_aprovar: decisao.aprovar,
        ...(comentario.trim() ? { p_comentario: comentario.trim() } : {}),
      });
      if (error) {
        toast.error("Não foi possível registrar a decisão.");
        return;
      }
      const res = data as { ok: boolean; message?: string };
      if (!res.ok) {
        toast.error(res.message ?? "Operação não concluída.");
        return;
      }
      toast.success(decisao.aprovar ? "Desconto autorizado." : "Solicitação recusada.");
      setDecisao(null);
      setComentario("");
      void queryClient.invalidateQueries({ queryKey: ["caixa"] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="Descontos concedidos"
          value={formatCurrencyBRL(ind?.total_descontos ?? 0)}
          sub="No período filtrado"
        />
        <KpiCard
          label="% sobre faturamento"
          value={`${(ind?.desconto_percentual ?? 0).toFixed(2).replace(".", ",")}%`}
          sub={`Alerta acima de ${(ind?.limite_alerta_pct ?? 0).toString().replace(".", ",")}%`}
          highlight={!!ind?.alerta}
        />
        <KpiCard
          label="Desconto médio"
          value={formatCurrencyBRL(ind?.desconto_medio ?? 0)}
          sub={`${ind?.lancamentos_com_desconto ?? 0} lançamento(s)`}
        />
        <KpiCard
          label="Acima da alçada"
          value={String(ind?.solicitacoes_acima_alcada ?? 0)}
          sub="Solicitações registradas"
        />
        <KpiCard
          label="Aprovado por gestor"
          value={formatCurrencyBRL(ind?.valor_aprovado_gestor ?? 0)}
        />
      </div>

      {ind?.alerta && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>
            O percentual de descontos do período está acima do limite definido em Administração &gt;
            Parâmetros &gt; Governança financeira.
          </p>
        </div>
      )}

      {(ind?.por_usuario?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">Descontos por responsável</p>
          <ul className="mt-2 divide-y divide-border text-sm">
            {ind!.por_usuario.map((u) => (
              <li key={u.usuario} className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">
                  {u.usuario} <span className="text-xs">({u.lancamentos} lançamento(s))</span>
                </span>
                <span className="font-medium text-foreground">
                  {formatCurrencyBRL(Number(u.total))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">Autorizações de desconto</p>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { key: "pendente", label: "Pendentes" },
              { key: "todos", label: "Todas" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFiltro(f.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filtro === f.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhuma solicitação {filtro === "pendente" ? "pendente" : "registrada"}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">Solicitação</th>
                <th className="px-4 py-3">OS / Cliente</th>
                <th className="px-4 py-3 text-right">Valor bruto</th>
                <th className="px-4 py-3 text-right">Desconto</th>
                <th className="px-4 py-3">Status</th>
                {podeAprovar && <th className="px-4 py-3" aria-label="Ações" />}
              </tr>
            </thead>
            <tbody>
              {lista.map((d) => (
                <tr
                  key={d.id}
                  className="border-b border-border last:border-0 hover:bg-secondary/40"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{d.solicitante?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTimeITV(d.solicitado_em)}
                    </p>
                    <p className="mt-1 max-w-64 text-xs text-muted-foreground">{d.motivo}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <p className="font-medium text-foreground">{d.os || "—"}</p>
                    <p className="text-xs">{d.cliente || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    {formatCurrencyBRL(d.valor_original)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-destructive">
                    {formatCurrencyBRL(d.valor_desconto)}
                    <p className="text-xs font-normal text-muted-foreground">
                      {Number(d.percentual).toFixed(2).replace(".", ",")}%
                      {d.limite_perfil != null
                        ? ` · alçada ${Number(d.limite_perfil).toFixed(2).replace(".", ",")}%`
                        : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        STATUS_DESCONTO[d.status].tom === "ok" && "bg-primary/10 text-primary",
                        STATUS_DESCONTO[d.status].tom === "alerta" &&
                          "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                        STATUS_DESCONTO[d.status].tom === "erro" &&
                          "bg-destructive/10 text-destructive",
                      )}
                    >
                      {STATUS_DESCONTO[d.status].label}
                    </span>
                    {d.decidido_em && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.decisor?.full_name ?? "—"} · {formatDateTimeITV(d.decidido_em)}
                      </p>
                    )}
                    {d.comentario && (
                      <p className="max-w-48 text-xs text-muted-foreground">{d.comentario}</p>
                    )}
                    {d.utilizado_em && (
                      <p className="text-xs text-muted-foreground">Utilizada no lançamento</p>
                    )}
                  </td>
                  {podeAprovar && (
                    <td className="px-4 py-3">
                      {d.status === "pendente" && (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setComentario("");
                              setDecisao({ item: d, aprovar: true });
                            }}
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Autorizar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setComentario("");
                              setDecisao({ item: d, aprovar: false });
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" /> Recusar
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!decisao} onOpenChange={(v) => !v && setDecisao(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decisao?.aprovar ? "Autorizar desconto" : "Recusar solicitação"}
            </DialogTitle>
            <DialogDescription>
              {decisao
                ? `${formatCurrencyBRL(decisao.item.valor_desconto)} sobre ${formatCurrencyBRL(
                    decisao.item.valor_original,
                  )} — OS ${decisao.item.os || "—"}. A decisão é registrada na auditoria.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="dsc-comentario" className={labelClass}>
              Comentário{" "}
              {decisao?.aprovar ? (
                <span className="font-normal text-muted-foreground">(opcional)</span>
              ) : (
                ""
              )}
            </label>
            <textarea
              id="dsc-comentario"
              rows={3}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className={cn(inputClass, "resize-none")}
            />
          </div>
          <DialogFooter>
            <button type="button" className={botaoSecundario} onClick={() => setDecisao(null)}>
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void decidir()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Autorizações aprovadas e ainda não utilizadas pelo próprio usuário. */
export function useDescontosDisponiveis(enabled: boolean) {
  return useQuery({
    queryKey: ["caixa", "descontos-disponiveis"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("descontos_autorizacoes")
        .select("*")
        .eq("status", "aprovado")
        .is("utilizado_em", null)
        .gte("solicitado_em", `${todayManausISO()}T00:00:00`)
        .order("solicitado_em", { ascending: false });
      if (error) throw error;
      return data as unknown as DescontoAutorizacao[];
    },
  });
}
