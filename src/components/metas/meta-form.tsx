import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import type { FaixasProjecao, MetaEmpresaDetalhe, MetaTipo, MetasRpcResult } from "@/lib/metas";
import { TIPO_META_EMPRESA_LABEL, TIPO_META_FONTE } from "@/lib/metas";
import { rpcMetas } from "@/components/metas/shared";

export interface MetaPrefill {
  valor_alvo: number;
  periodo_tipo: "mensal";
  data_inicio: string;
  data_fim: string;
  observacao: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meta: MetaEmpresaDetalhe | null;
  /** Pré-preenchimento para criação a partir do módulo de Planejamento. */
  prefill?: MetaPrefill | null;
}

/** Dialog de criação/edição de meta da empresa. */
export function MetaFormDialog({ open, onOpenChange, meta, prefill }: Props) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    tipo: "faturamento" as MetaTipo,
    periodo_tipo: "mensal" as "semanal" | "mensal" | "personalizado",
    data_inicio: "",
    data_fim: "",
    valor_alvo: "",
    principal: false,
    observacao: "",
  });

  useEffect(() => {
    if (!open) return;
    if (meta) {
      setForm({
        nome: meta.nome,
        tipo: meta.tipo,
        periodo_tipo: meta.periodo_tipo,
        data_inicio: meta.data_inicio,
        data_fim: meta.data_fim,
        valor_alvo: String(meta.valor_alvo),
        principal: meta.principal,
        observacao: meta.observacao ?? "",
      });
    } else {
      const now = new Date();
      const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      setForm({
        nome: "",
        tipo: "faturamento",
        periodo_tipo: prefill?.periodo_tipo ?? "mensal",
        data_inicio: prefill?.data_inicio ?? `${mes}-01`,
        data_fim: prefill?.data_fim ?? `${mes}-${String(last).padStart(2, "0")}`,
        valor_alvo: prefill ? String(prefill.valor_alvo).replace(".", ",") : "",
        principal: false,
        observacao: prefill?.observacao ?? "",
      });
    }
  }, [open, meta, prefill]);

  async function salvar() {
    const valor = Number(String(form.valor_alvo).replace(",", "."));
    if (!form.nome.trim()) {
      toast.error("Informe o nome da meta.");
      return;
    }
    if (!form.data_inicio || !form.data_fim) {
      toast.error("Informe o período.");
      return;
    }
    if (form.data_fim < form.data_inicio) {
      toast.error("Data final anterior à inicial.");
      return;
    }
    if (!(valor > 0)) {
      toast.error("Informe um valor alvo maior que zero.");
      return;
    }

    setSalvando(true);
    try {
      const r = await rpcMetas<MetasRpcResult>("metas_empresa_registrar", {
        p_id: meta?.id ?? null,
        p_nome: form.nome.trim(),
        p_tipo: form.tipo,
        p_periodo_tipo: form.periodo_tipo,
        p_data_inicio: form.data_inicio,
        p_data_fim: form.data_fim,
        p_valor_alvo: valor,
        p_principal: form.principal,
        p_observacao: form.observacao.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.message ?? "Não foi possível salvar a meta.");
        return;
      }
      toast.success(meta ? "Meta atualizada." : "Meta criada.");
      await qc.invalidateQueries({ queryKey: ["metas"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar a meta.");
    } finally {
      setSalvando(false);
    }
  }

  const tipos = Object.entries(TIPO_META_EMPRESA_LABEL) as [MetaTipo, string][];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meta ? "Editar Meta" : "Nova Meta da Empresa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="meta-nome">Nome da meta</label>
            <input
              id="meta-nome"
              className={inputClass}
              value={form.nome}
              onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex.: Faturamento de Agosto"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="meta-tipo">Indicador</label>
              <select
                id="meta-tipo"
                className={inputClass}
                value={form.tipo}
                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as MetaTipo }))}
              >
                {tipos.map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">Fonte: {TIPO_META_FONTE[form.tipo]}</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="meta-periodo">Período</label>
              <select
                id="meta-periodo"
                className={inputClass}
                value={form.periodo_tipo}
                onChange={(e) => setForm((f) => ({ ...f, periodo_tipo: e.target.value as typeof form.periodo_tipo }))}
              >
                <option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option>
                <option value="personalizado">Personalizado</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="meta-ini">Início</label>
              <input
                id="meta-ini"
                type="date"
                className={inputClass}
                value={form.data_inicio}
                onChange={(e) => setForm((f) => ({ ...f, data_inicio: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="meta-fim">Fim</label>
              <input
                id="meta-fim"
                type="date"
                className={inputClass}
                value={form.data_fim}
                onChange={(e) => setForm((f) => ({ ...f, data_fim: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="meta-valor">Valor alvo</label>
            <input
              id="meta-valor"
              inputMode="decimal"
              className={inputClass}
              value={form.valor_alvo}
              onChange={(e) => setForm((f) => ({ ...f, valor_alvo: e.target.value }))}
              placeholder={form.tipo === "os_faturadas" ? "Ex.: 120" : "Ex.: 50000,00"}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.principal}
              onChange={(e) => setForm((f) => ({ ...f, principal: e.target.checked }))}
              className="size-4 accent-primary"
            />
            Definir como meta principal do período (destaque no Dashboard)
          </label>
          <div>
            <label className={labelClass} htmlFor="meta-obs">Observação (opcional)</label>
            <textarea
              id="meta-obs"
              className={inputClass}
              rows={2}
              value={form.observacao}
              onChange={(e) => setForm((f) => ({ ...f, observacao: e.target.value }))}
            />
          </div>
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
              {salvando ? "Salvando…" : "Salvar meta"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Dialog de configuração das faixas de projeção. */
export function FaixasDialog({
  open,
  onOpenChange,
  faixas,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faixas: FaixasProjecao;
}) {
  const qc = useQueryClient();
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(faixas);

  useEffect(() => {
    if (open) setForm(faixas);
  }, [open, faixas]);

  async function salvar() {
    setSalvando(true);
    try {
      const r = await rpcMetas<MetasRpcResult>("metas_configurar_faixas", {
        p_acima: Number(form.acima),
        p_no_ritmo: Number(form.no_ritmo),
        p_atencao: Number(form.atencao),
      });
      if (!r.ok) {
        toast.error(r.message ?? "Não foi possível salvar as faixas.");
        return;
      }
      toast.success("Faixas de projeção atualizadas.");
      await qc.invalidateQueries({ queryKey: ["metas"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Faixas de Projeção</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Limites (em % da projeção sobre a meta) que classificam cada meta como Acima da Meta, No Ritmo, Atenção ou
          Crítico.
        </p>
        <div className="space-y-3">
          {(
            [
              ["acima", "Acima da Meta — a partir de (%)"],
              ["no_ritmo", "No Ritmo — a partir de (%)"],
              ["atencao", "Atenção — a partir de (%)"],
            ] as const
          ).map(([k, l]) => (
            <div key={k}>
              <label className={labelClass}>{l}</label>
              <input
                type="number"
                className={inputClass}
                value={form[k]}
                onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) }))}
              />
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Abaixo de "Atenção" a meta é classificada como Crítico.</p>
        </div>
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
            {salvando ? "Salvando…" : "Salvar faixas"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ação auditável de mudança de status (concluir/cancelar/reabrir). */
export async function mudarStatusMeta(
  qc: ReturnType<typeof useQueryClient>,
  id: string,
  status: "planejada" | "ativa" | "concluida" | "cancelada",
  motivo?: string,
): Promise<boolean> {
  try {
    const r = await rpcMetas<MetasRpcResult>("metas_empresa_status", {
      p_id: id,
      p_status: status,
      p_motivo: motivo ?? null,
    });
    if (!r.ok) {
      toast.error(r.message ?? "Não foi possível alterar o status.");
      return false;
    }
    toast.success("Status atualizado.");
    await qc.invalidateQueries({ queryKey: ["metas"] });
    return true;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Erro ao alterar status.");
    return false;
  }
}
