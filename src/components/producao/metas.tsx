import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import {
  NIVEL_BADGE,
  PERIODO_META_LABEL,
  TIPO_META_LABEL,
  type MetaTecnico,
  type NivelDesempenho,
} from "@/lib/producao";
import { invalidateProducao, useProducaoRefs } from "./shared";

export function MetasTab() {
  const { isAdmin, can, profile } = useAccess();
  const { tecnicos, ehGerencia } = useProducaoRefs();
  const podeConfigurar = isAdmin || can("producao", "configurar_metas");
  const [formOpen, setFormOpen] = useState(false);

  const metasQuery = useQuery({
    queryKey: ["producao", "metas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas_tecnicos")
        .select("id, tecnico_id, tipo_meta, periodo_tipo, inicio, fim, valor_meta, quantidade_meta, ativo, tecnico:profiles(full_name)")
        .order("inicio", { ascending: false });
      if (error) throw error;
      return data as unknown as MetaTecnico[];
    },
  });

  const niveisQuery = useQuery({
    queryKey: ["producao", "niveis"],
    queryFn: async () => {
      const { data, error } = await supabase.from("niveis_desempenho").select("*").order("ordem");
      if (error) throw error;
      return data as NivelDesempenho[];
    },
  });

  const metas = metasQuery.data ?? [];
  const metasVisiveis = ehGerencia ? metas : metas.filter((m) => m.tecnico_id === profile?.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Metas Técnicas</h2>
        {podeConfigurar && <Button onClick={() => setFormOpen(true)}>Nova meta</Button>}
      </div>

      {metasVisiveis.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada no período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Técnico</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Período</th>
                <th className="px-3 py-2 font-medium">Meta</th>
                <th className="px-3 py-2 font-medium">Status</th>
                {podeConfigurar && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {metasVisiveis.map((m) => (
                <MetaRow key={m.id} meta={m} podeConfigurar={podeConfigurar} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h3 className="mb-2 font-display text-sm font-bold text-foreground">Níveis de Desempenho</h3>
        <div className="flex flex-wrap gap-2">
          {(niveisQuery.data ?? []).map((n) => (
            <span key={n.id} className={`rounded-full px-3 py-1 text-xs font-semibold ${NIVEL_BADGE[n.nome] ?? "bg-muted text-muted-foreground"}`}>
              {n.nome}: {n.percentual_minimo}%{n.percentual_maximo != null ? `–${n.percentual_maximo}%` : "+"}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Faixas aplicadas sobre o percentual da meta. Ajustes finos são feitos pelo administrador.
        </p>
      </div>

      <MetaFormDialog open={formOpen} onClose={() => setFormOpen(false)} tecnicos={tecnicos} />
    </div>
  );
}

function MetaRow({ meta, podeConfigurar }: { meta: MetaTecnico; podeConfigurar: boolean }) {
  const queryClient = useQueryClient();
  async function alternar() {
    try {
      const { error } = await supabase.from("metas_tecnicos").update({ ativo: !meta.ativo } as never).eq("id", meta.id);
      if (error) throw error;
      toast.success(meta.ativo ? "Meta desativada." : "Meta reativada.");
      invalidateProducao(queryClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar meta.");
    }
  }
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 font-medium text-foreground">{meta.tecnico?.full_name ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{TIPO_META_LABEL[meta.tipo_meta] ?? meta.tipo_meta}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {PERIODO_META_LABEL[meta.periodo_tipo] ?? meta.periodo_tipo} · {formatDateOnlyISO(meta.inicio)} → {formatDateOnlyISO(meta.fim)}
      </td>
      <td className="px-3 py-2 text-foreground">
        {meta.tipo_meta !== "quantidade" && meta.valor_meta != null && <span>{formatCurrencyBRL(meta.valor_meta)}</span>}
        {meta.tipo_meta === "combinada" && " + "}
        {meta.tipo_meta !== "valor" && meta.quantidade_meta != null && <span>{meta.quantidade_meta} serviços</span>}
      </td>
      <td className="px-3 py-2">
        <Badge variant="outline" className={meta.ativo ? "border-primary/30 text-primary" : "text-muted-foreground"}>
          {meta.ativo ? "Ativa" : "Inativa"}
        </Badge>
      </td>
      {podeConfigurar && (
        <td className="px-3 py-2 text-right">
          <Button variant="ghost" size="sm" onClick={() => void alternar()}>
            {meta.ativo ? "Desativar" : "Reativar"}
          </Button>
        </td>
      )}
    </tr>
  );
}

function MetaFormDialog({
  open,
  onClose,
  tecnicos,
}: {
  open: boolean;
  onClose: () => void;
  tecnicos: { id: string; full_name: string }[];
}) {
  const queryClient = useQueryClient();
  const { profile } = useAccess();
  const [saving, setSaving] = useState(false);
  const [tecnicoId, setTecnicoId] = useState("");
  const [tipoMeta, setTipoMeta] = useState<"valor" | "quantidade" | "combinada">("valor");
  const [periodoTipo, setPeriodoTipo] = useState<"semanal" | "mensal" | "personalizado">("mensal");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [valorMeta, setValorMeta] = useState<number | null>(null);
  const [qtdMeta, setQtdMeta] = useState("");

  useEffect(() => {
    if (open) {
      const hoje = new Date();
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      setTecnicoId("");
      setTipoMeta("valor");
      setPeriodoTipo("mensal");
      setInicio(ini.toISOString().slice(0, 10));
      setFim(fimMes.toISOString().slice(0, 10));
      setValorMeta(null);
      setQtdMeta("");
    }
  }, [open]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!tecnicoId) { toast.error("Selecione o técnico."); return; }
    if (!inicio || !fim) { toast.error("Informe o período da meta."); return; }
    if (tipoMeta !== "quantidade" && (!valorMeta || valorMeta <= 0)) { toast.error("Informe o valor da meta."); return; }
    if (tipoMeta !== "valor" && (!qtdMeta || Number(qtdMeta) <= 0)) { toast.error("Informe a quantidade da meta."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("metas_tecnicos").insert({
        tecnico_id: tecnicoId,
        tipo_meta: tipoMeta,
        periodo_tipo: periodoTipo,
        inicio,
        fim,
        valor_meta: tipoMeta !== "quantidade" ? valorMeta : null,
        quantidade_meta: tipoMeta !== "valor" ? Number(qtdMeta) : null,
        created_by: profile?.id ?? null,
      } as never);
      if (error) throw error;
      toast.success("Meta cadastrada.");
      invalidateProducao(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar meta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Nova Meta Técnica</DialogTitle>
          <DialogDescription>A meta alimenta o progresso, a projeção e o nível de desempenho do técnico.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void salvar(e)} className="space-y-3">
          <div>
            <label htmlFor="mt-tecnico" className={labelClass}>Técnico *</label>
            <select id="mt-tecnico" value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} className={inputClass} required>
              <option value="">Selecione…</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="mt-tipo" className={labelClass}>Tipo *</label>
              <select id="mt-tipo" value={tipoMeta} onChange={(e) => setTipoMeta(e.target.value as typeof tipoMeta)} className={inputClass}>
                {Object.entries(TIPO_META_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mt-periodo" className={labelClass}>Período *</label>
              <select id="mt-periodo" value={periodoTipo} onChange={(e) => setPeriodoTipo(e.target.value as typeof periodoTipo)} className={inputClass}>
                {Object.entries(PERIODO_META_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="mt-ini" className={labelClass}>Início *</label>
              <input id="mt-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputClass} required />
            </div>
            <div>
              <label htmlFor="mt-fim" className={labelClass}>Fim *</label>
              <input id="mt-fim" type="date" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} className={inputClass} required />
            </div>
            {tipoMeta !== "quantidade" && (
              <div>
                <label className={labelClass}>Valor da Meta (R$) *</label>
                <MoneyInput value={valorMeta} onChange={setValorMeta} />
              </div>
            )}
            {tipoMeta !== "valor" && (
              <div>
                <label htmlFor="mt-qtd" className={labelClass}>Quantidade de Serviços *</label>
                <input id="mt-qtd" type="number" min={1} value={qtdMeta} onChange={(e) => setQtdMeta(e.target.value)} className={inputClass} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar meta"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
