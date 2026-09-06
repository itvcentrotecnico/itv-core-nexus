import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { MetasRpcResult, TecnicoDesempenho } from "@/lib/metas";
import { STATUS_META, TIPO_META_TECNICO_LABEL } from "@/lib/metas";
import { NivelBadge, ProgressBarMeta, rpcMetas, useTecnicosDesempenho } from "@/components/metas/shared";
import { cn } from "@/lib/utils";
import { mensagemErro } from "@/lib/erros";

interface MetaTecnicoRow {
  id: string;
  tecnico_id: string;
  tipo_meta: string;
  periodo_tipo: string;
  inicio: string;
  fim: string;
  valor_meta: number | null;
  quantidade_meta: number | null;
  status: string;
  tecnico?: { full_name: string } | null;
}

/** Aba Técnicos: desempenho consolidado + metas por técnico (audited via RPC). */
export function TecnicosTab({
  range,
  podeConfigurar,
}: {
  range: { from: string; to: string };
  podeConfigurar: boolean;
}) {
  const qc = useQueryClient();
  const desempenho = useTecnicosDesempenho(range);
  const [formOpen, setFormOpen] = useState(false);
  const [tecnicoSel, setTecnicoSel] = useState<TecnicoDesempenho | null>(null);

  const metasTecnicos = useQuery({
    queryKey: ["metas", "metas-tecnicos", range.from, range.to],
    enabled: podeConfigurar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas_tecnicos")
        .select("id, tecnico_id, tipo_meta, periodo_tipo, inicio, fim, valor_meta, quantidade_meta, status, tecnico:profiles!metas_tecnicos_tecnico_id_fkey(full_name)")
        .lte("inicio", range.to)
        .gte("fim", range.from)
        .order("inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MetaTecnicoRow[];
    },
  });

  async function encerrarMeta(id: string, status: "concluida" | "cancelada") {
    const motivo = status === "cancelada" ? (window.prompt("Motivo do cancelamento (opcional):") ?? null) : null;
    try {
      const r = await rpcMetas<MetasRpcResult>("metas_tecnico_status", { p_id: id, p_status: status, p_motivo: motivo });
      if (!r.ok) {
        toast.error(r.message ?? "Não foi possível alterar o status.");
        return;
      }
      toast.success("Meta atualizada.");
      await qc.invalidateQueries({ queryKey: ["metas"] });
    } catch (e) {
      toast.error(mensagemErro(e, "Erro ao alterar status."));
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="font-display text-sm font-semibold text-foreground">Desempenho por técnico no período</h3>
        {desempenho.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !desempenho.data || desempenho.data.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhum técnico com produção no período.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Técnico</th>
                  <th className="px-4 py-3 font-medium">Validados</th>
                  <th className="px-4 py-3 font-medium">Produção validada</th>
                  <th className="px-4 py-3 font-medium">Ticket médio</th>
                  <th className="px-4 py-3 font-medium">Margem contrib.</th>
                  <th className="px-4 py-3 font-medium">Meta</th>
                  <th className="px-4 py-3 font-medium">Nível</th>
                  {podeConfigurar && <th className="px-4 py-3 font-medium">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {desempenho.data.map((t) => (
                  <tr key={t.tecnico_id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{t.tecnico}</td>
                    <td className="px-4 py-3 text-foreground">
                      {t.validados}
                      <span className="ml-1 text-xs text-muted-foreground">({t.registrados} registrados)</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{formatCurrencyBRL(t.producao_validada)}</td>
                    <td className="px-4 py-3 text-foreground">{formatCurrencyBRL(t.ticket_medio)}</td>
                    <td className="px-4 py-3 text-foreground">
                      {formatCurrencyBRL(t.margem_contribuicao)}
                      {t.margem_pct != null && (
                        <span className="ml-1 text-xs text-muted-foreground">({t.margem_pct.toFixed(0)}%)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {t.meta?.percentual != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-20">
                            <ProgressBarMeta percentual={t.meta.percentual} />
                          </div>
                          <span className="text-xs font-semibold text-foreground">{t.meta.percentual.toFixed(0)}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sem meta</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <NivelBadge nivel={t.meta?.nivel ?? null} />
                    </td>
                    {podeConfigurar && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setTecnicoSel(t);
                            setFormOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                        >
                          <Plus className="size-3" /> Meta
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {podeConfigurar && (
        <section className="space-y-3">
          <h3 className="font-display text-sm font-semibold text-foreground">Metas dos técnicos no período</h3>
          {metasTecnicos.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : !metasTecnicos.data || metasTecnicos.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma meta de técnico cadastrada no período.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Técnico</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Período</th>
                    <th className="px-4 py-3 font-medium">Alvo</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {metasTecnicos.data.map((m) => {
                    const st = STATUS_META[m.status as keyof typeof STATUS_META] ?? STATUS_META.ativa;
                    return (
                      <tr key={m.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3 font-medium text-foreground">{m.tecnico?.full_name ?? "—"}</td>
                        <td className="px-4 py-3 text-foreground">
                          {TIPO_META_TECNICO_LABEL[m.tipo_meta] ?? m.tipo_meta}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDateOnlyISO(m.inicio)} a {formatDateOnlyISO(m.fim)}
                        </td>
                        <td className="px-4 py-3 text-foreground">
                          {m.valor_meta != null && formatCurrencyBRL(m.valor_meta)}
                          {m.valor_meta != null && m.quantidade_meta != null && " + "}
                          {m.quantidade_meta != null && `${m.quantidade_meta} serviços`}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", st.className)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {(m.status === "ativa" || m.status === "planejada") && (
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => void encerrarMeta(m.id, "concluida")}
                                className="rounded-md border border-primary/30 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                              >
                                Concluir
                              </button>
                              <button
                                type="button"
                                onClick={() => void encerrarMeta(m.id, "cancelada")}
                                className="rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5"
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tecnicoSel && (
        <MetaTecnicoFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          tecnicoId={tecnicoSel.tecnico_id}
          tecnicoNome={tecnicoSel.tecnico}
          range={range}
        />
      )}
    </div>
  );
}

function MetaTecnicoFormDialog({
  open,
  onOpenChange,
  tecnicoId,
  tecnicoNome,
  range,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tecnicoId: string;
  tecnicoNome: string;
  range: { from: string; to: string };
}) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState("valor");
  const [valorMeta, setValorMeta] = useState("");
  const [qtdMeta, setQtdMeta] = useState("");
  const [inicio, setInicio] = useState(range.from);
  const [fim, setFim] = useState(range.to);

  async function salvar() {
    const v = valorMeta ? Number(valorMeta.replace(",", ".")) : null;
    const q = qtdMeta ? Number(qtdMeta) : null;
    if (tipo !== "quantidade" && !(v && v > 0)) {
      toast.error("Informe o valor da meta.");
      return;
    }
    if ((tipo === "quantidade" || tipo === "combinada") && !(q && q > 0)) {
      toast.error("Informe a quantidade da meta.");
      return;
    }
    if (!inicio || !fim || fim < inicio) {
      toast.error("Período inválido.");
      return;
    }
    setSalvando(true);
    try {
      const r = await rpcMetas<MetasRpcResult>("metas_tecnico_salvar", {
        p_id: null,
        p_tecnico_id: tecnicoId,
        p_tipo_meta: tipo,
        p_periodo_tipo: "personalizado",
        p_inicio: inicio,
        p_fim: fim,
        p_valor_meta: v,
        p_quantidade_meta: q,
      });
      if (!r.ok) {
        toast.error(r.message ?? "Não foi possível salvar a meta.");
        return;
      }
      toast.success("Meta do técnico criada.");
      await qc.invalidateQueries({ queryKey: ["metas"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(mensagemErro(e, "Erro ao salvar."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova meta — {tecnicoNome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tipo de meta</label>
            <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {Object.entries(TIPO_META_TECNICO_LABEL).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Início</label>
              <input type="date" className={inputClass} value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Fim</label>
              <input type="date" className={inputClass} value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {tipo !== "quantidade" && (
            <div>
              <label className={labelClass}>Valor da meta (R$)</label>
              <input
                inputMode="decimal"
                className={inputClass}
                value={valorMeta}
                onChange={(e) => setValorMeta(e.target.value)}
                placeholder="Ex.: 8000,00"
              />
            </div>
          )}
          {(tipo === "quantidade" || tipo === "combinada") && (
            <div>
              <label className={labelClass}>Quantidade de serviços</label>
              <input
                type="number"
                className={inputClass}
                value={qtdMeta}
                onChange={(e) => setQtdMeta(e.target.value)}
                placeholder="Ex.: 40"
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {salvando ? "Salvando…" : "Criar meta"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
