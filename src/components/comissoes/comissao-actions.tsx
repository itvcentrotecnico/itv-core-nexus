import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/caixa/money-input";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateITV } from "@/lib/format";
import {
import { mensagemErro } from "@/lib/erros";
  AJUSTE_TIPO, TIPO_REGRA,
  type Comissao, type ComissaoAjusteTipo, type ComissaoRpcResult, type ComissaoSimulacao,
} from "@/lib/comissoes";

function invalidateComissoes(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["comissoes"] });
  queryClient.invalidateQueries({ queryKey: ["comissoes-indicadores"] });
  queryClient.invalidateQueries({ queryKey: ["comissoes-por-tecnico"] });
  queryClient.invalidateQueries({ queryKey: ["comissoes-pagamentos"] });
}

type RpcResponse = { data: unknown; error: { message: string } | null };

async function rpc<T extends ComissaoRpcResult>(fn: string, args: Record<string, unknown>): Promise<T> {
  // RPCs tipados no generated types; aqui aceitamos nome dinâmico para reutilizar o helper.
  const dynRpc = supabase.rpc as unknown as (this: typeof supabase, n: string, a: Record<string, unknown>) => Promise<RpcResponse>;
  const { data, error } = await dynRpc.call(supabase, fn, args);
  if (error) throw new Error(error.message);
  const r = data as T;
  if (!r.ok) throw new Error(r.message ?? "Operação não concluída.");
  return r;
}

/* ============================= Detalhes / Conferir ============================= */

export function ComissaoDetalhes({
  comissao, open, onOpenChange, podeAprovar, podeAjustar,
}: {
  comissao: Comissao | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  podeAprovar: boolean;
  podeAjustar: boolean;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState<string | null>(null);

  const ajustesQuery = useQuery({
    queryKey: ["comissao-ajustes", comissao?.id],
    enabled: open && !!comissao,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comissao_ajustes").select("*").eq("comissao_id", comissao!.id).order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!comissao) return null;

  async function acao(fn: string, args: Record<string, unknown>, label: string) {
    setLoading(fn);
    try {
      await rpc(fn, { p_id: comissao!.id, ...args });
      toast.success(label);
      invalidateComissoes(queryClient);
      onOpenChange(false);
    } catch (e) {
      toast.error(mensagemErro(e, "Operação não concluída."));
    } finally {
      setLoading(null);
    }
  }

  const linhas: [string, string][] = [
    ["OS", comissao.os],
    ["Data", formatDateITV(comissao.data_referencia)],
    ["Técnico", comissao.tecnico?.full_name ?? "—"],
    ["Regra", comissao.tipo_regra ? TIPO_REGRA[comissao.tipo_regra] : "Sem regra"],
    ["Receita Líquida da OS", formatCurrencyBRL(comissao.receita_liquida)],
    ["Custos Diretos (Peças)", formatCurrencyBRL(comissao.custos_diretos)],
    ["Base de Cálculo", comissao.base_calculo != null ? formatCurrencyBRL(comissao.base_calculo) : "—"],
    ["Percentual", comissao.percentual != null ? `${comissao.percentual}%` : "—"],
    ["Valor Calculado", comissao.valor_calculado != null ? formatCurrencyBRL(comissao.valor_calculado) : "—"],
    ["Ajustes", formatCurrencyBRL(comissao.ajuste_total)],
    ["Valor Final", comissao.valor_final != null ? formatCurrencyBRL(comissao.valor_final) : "—"],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Comissão — OS {comissao.os}</DialogTitle>
          <DialogDescription>Detalhamento completo do cálculo e trilha de ajustes.</DialogDescription>
        </DialogHeader>

        <dl className="space-y-1.5 text-sm">
          {linhas.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>

        {comissao.mao_obra_manual != null && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Mão de obra manual: <strong>{formatCurrencyBRL(comissao.mao_obra_manual)}</strong>
            {comissao.mao_obra_justificativa && <> — {comissao.mao_obra_justificativa}</>}
          </div>
        )}

        {ajustesQuery.data && ajustesQuery.data.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ajustes</p>
            <ul className="space-y-1 text-sm">
              {ajustesQuery.data.map((a) => (
                <li key={a.id} className="flex justify-between gap-2">
                  <span>{AJUSTE_TIPO[a.tipo as ComissaoAjusteTipo]} — {a.motivo}</span>
                  <span className={a.valor >= 0 ? "text-primary" : "text-destructive"}>{formatCurrencyBRL(a.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {comissao.motivo_cancelamento && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            Cancelada: {comissao.motivo_cancelamento}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {podeAjustar && comissao.status === "gerada" && (
            <Button variant="outline" disabled={loading !== null}
              onClick={() => acao("comissoes_conferir", {}, "Comissão enviada para conferência.")}>
              Enviar p/ Conferência
            </Button>
          )}
          {podeAprovar && comissao.status === "conferida" && (
            <Button disabled={loading !== null}
              onClick={() => acao("comissoes_aprovar", {}, "Comissão aprovada.")}>
              Aprovar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= Ajuste ============================= */

export function AjusteDialog({ comissao, open, onOpenChange }: { comissao: Comissao | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<ComissaoAjusteTipo>("acrescimo");
  const [valor, setValor] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar(): Promise<void> {
    if (!comissao) return;
    if (!valor || valor <= 0 || !motivo.trim()) {
      toast.error("Informe o valor e o motivo do ajuste.");
      return;
    }
    setSaving(true);
    try {
      const sinal = tipo === "desconto" || tipo === "compensacao" ? -1 : 1;
      const r = await rpc<ComissaoRpcResult & { valor_final?: number }>("comissoes_ajustar", {
        p_id: comissao.id, p_tipo: tipo, p_valor: sinal * valor, p_motivo: motivo.trim(),
      });
      toast.success(`Ajuste aplicado. Novo valor: ${formatCurrencyBRL(Number(r.valor_final ?? 0))}`);
      invalidateComissoes(queryClient);
      onOpenChange(false);
      setValor(null); setMotivo("");
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível aplicar o ajuste."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajuste de Comissão — OS {comissao?.os}</DialogTitle>
          <DialogDescription>O ajuste fica registrado em trilha de auditoria e altera o valor final.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Tipo *</label>
            <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as ComissaoAjusteTipo)}>
              {Object.entries(AJUSTE_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Valor (R$) *</label>
            <MoneyInput value={valor} onChange={setValor} />
          </div>
          <div>
            <label className={labelClass}>Motivo *</label>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Aplicando…" : "Aplicar Ajuste"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= Cancelar ============================= */

export function CancelarComissaoDialog({ comissao, open, onOpenChange }: { comissao: Comissao | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar(): Promise<void> {
    if (!comissao) return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo do cancelamento.");
      return;
    }
    setSaving(true);
    try {
      await rpc("comissoes_cancelar", { p_id: comissao.id, p_motivo: motivo.trim() });
      toast.success("Comissão cancelada.");
      invalidateComissoes(queryClient);
      onOpenChange(false);
      setMotivo("");
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível cancelar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar Comissão — OS {comissao?.os}</DialogTitle>
          <DialogDescription>A comissão cancelada deixa de compor pagamentos e margens.</DialogDescription>
        </DialogHeader>
        <div>
          <label className={labelClass}>Motivo *</label>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Voltar</Button>
          <Button variant="destructive" onClick={salvar} disabled={saving}>{saving ? "Cancelando…" : "Cancelar Comissão"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= Recalcular ============================= */

export function RecalcularDialog({ comissao, open, onOpenChange }: { comissao: Comissao | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [simulacao, setSimulacao] = useState<ComissaoSimulacao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);

  async function simular() {
    if (!comissao) return;
    setLoading(true);
    try {
      const r = await rpc<ComissaoSimulacao & ComissaoRpcResult>("comissoes_simular_recalculo", { p_id: comissao.id });
      setSimulacao(r);
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível simular."));
    } finally {
      setLoading(false);
    }
  }

  async function confirmar(): Promise<void> {
    if (!comissao) return;
    if (!motivo.trim()) {
      toast.error("Informe o motivo do recálculo.");
      return;
    }
    setLoading(true);
    try {
      await rpc("comissoes_recalcular", { p_id: comissao.id, p_motivo: motivo.trim() });
      toast.success("Comissão recalculada pela regra vigente.");
      invalidateComissoes(queryClient);
      onOpenChange(false);
      setSimulacao(null);
      setMotivo("");
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível recalcular."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSimulacao(null); setMotivo(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recalcular — OS {comissao?.os}</DialogTitle>
          <DialogDescription>Reaplica a regra vigente para a data da OS. Simule antes de confirmar.</DialogDescription>
        </DialogHeader>

        {!simulacao ? (
          <Button variant="outline" onClick={simular} disabled={loading}>{loading ? "Simulando…" : "Simular Recálculo"}</Button>
        ) : (
          <div className="space-y-3 text-sm">
            {!simulacao.regra_encontrada ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {simulacao.message ?? "Nenhuma regra vigente encontrada para esta data."}
              </p>
            ) : (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor atual</span><strong>{simulacao.valor_atual != null ? formatCurrencyBRL(simulacao.valor_atual) : "—"}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Nova base</span><strong>{simulacao.nova_base != null ? formatCurrencyBRL(simulacao.nova_base) : "—"}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Novo valor</span><strong>{simulacao.novo_valor != null ? formatCurrencyBRL(simulacao.novo_valor) : "—"}</strong></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diferença</span>
                  <strong className={(simulacao.diferenca ?? 0) >= 0 ? "text-primary" : "text-destructive"}>
                    {simulacao.diferenca != null ? formatCurrencyBRL(simulacao.diferenca) : "—"}
                  </strong>
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Motivo do recálculo *</label>
              <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: regra alterada" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSimulacao(null)} disabled={loading}>Voltar</Button>
              {simulacao.regra_encontrada && (
                <Button onClick={confirmar} disabled={loading}>{loading ? "Recalculando…" : "Confirmar Recálculo"}</Button>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ============================= Mão de obra manual ============================= */

export function MaoObraDialog({ comissao, open, onOpenChange }: { comissao: Comissao | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const [valor, setValor] = useState<number | null>(comissao?.mao_obra_manual ?? null);
  const [justificativa, setJustificativa] = useState(comissao?.mao_obra_justificativa ?? "");
  const [saving, setSaving] = useState(false);

  async function salvar(): Promise<void> {
    if (!comissao) return;
    if (!valor || valor <= 0 || !justificativa.trim()) {
      toast.error("Informe o valor da mão de obra e a justificativa.");
      return;
    }
    setSaving(true);
    try {
      await rpc("comissoes_definir_mao_obra", {
        p_id: comissao.id, p_valor: valor, p_justificativa: justificativa.trim(),
      });
      toast.success("Mão de obra definida e comissão recalculada.");
      invalidateComissoes(queryClient);
      onOpenChange(false);
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível definir a mão de obra."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mão de Obra Manual — OS {comissao?.os}</DialogTitle>
          <DialogDescription>
            Use quando receita e mão de obra não estão separadas. Base atual:{" "}
            {comissao?.base_calculo != null ? formatCurrencyBRL(comissao.base_calculo) : "—"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Valor da Mão de Obra (R$) *</label>
            <MoneyInput value={valor} onChange={setValor} />
          </div>
          <div>
            <label className={labelClass}>Justificativa *</label>
            <Textarea rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
