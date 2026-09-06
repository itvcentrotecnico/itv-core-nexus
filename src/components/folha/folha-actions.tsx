import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
import { formatCurrencyBRL } from "@/lib/format";
import { rpcFin } from "@/components/financeiro/shared";
import {
  competenciaISO,
  competenciaLabel,
  type Colaborador,
  type FolhaCompetencia,
  type FolhaResumo,
  type FolhaRpcResult,
} from "@/lib/folha";
import { invalidateFolha } from "./colaborador-form";
import { useFolhaRefs } from "./shared";
import { mensagemErro } from "@/lib/erros";

/* ============================= ABRIR COMPETÊNCIA ============================= */

export function AbrirCompetenciaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (open) {
      setMes(new Date().toISOString().slice(0, 7));
      setObservacao("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const comp = competenciaISO(mes);
    if (!comp) return;
    setSaving(true);
    try {
      const r = await rpcFin<FolhaRpcResult>("folha_abrir_competencia", {
        p_competencia: comp,
        p_observacao: observacao || null,
      });
      toast.success(
        `Competência ${competenciaLabel(comp)} aberta com ${Number(r["colaboradores"] ?? 0)} colaborador(es) e lançamentos automáticos gerados.`,
      );
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao abrir competência."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir Competência</DialogTitle>
          <DialogDescription>
            Gera a folha do mês para todos os colaboradores ativos: salário vigente, benefícios ativos,
            adiantamentos pendentes e comissões técnicas aprovadas (sem duplicidade).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="ac-mes" className={labelClass}>Competência *</label>
            <input id="ac-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="ac-obs" className={labelClass}>Observação</label>
            <Textarea id="ac-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !mes}>{saving ? "Gerando…" : "Abrir competência"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= LANÇAMENTO MANUAL ============================= */

export function LancamentoForm({
  open,
  onClose,
  competencia,
  colaboradores,
}: {
  open: boolean;
  onClose: () => void;
  competencia: FolhaCompetencia;
  colaboradores: Colaborador[];
}) {
  const queryClient = useQueryClient();
  const refs = useFolhaRefs(open);
  const [saving, setSaving] = useState(false);
  const [colaboradorId, setColaboradorId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (open) {
      setColaboradorId("");
      setTipoId("");
      setDescricao("");
      setValor(null);
      setObservacao("");
    }
  }, [open]);

  const tipos = (refs.data?.tipos ?? []).filter((t) => t.ativo);
  const tipoSel = tipos.find((t) => t.id === tipoId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("folha_lancar", {
        p_competencia_id: competencia.id,
        p_colaborador_id: colaboradorId,
        p_tipo_lancamento_id: tipoId,
        p_descricao: descricao || null,
        p_valor: valor,
        p_observacao: observacao || null,
      });
      toast.success("Lançamento registrado na folha.");
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao lançar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Lançamento — {competenciaLabel(competencia.competencia)}</DialogTitle>
          <DialogDescription>Proventos e descontos manuais (bônus, faltas, horas extras, rescisão etc.).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="lc-colab" className={labelClass}>Colaborador *</label>
            <select id="lc-colab" value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className={inputClass}>
              <option value="">Selecione…</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>{c.nome_exibicao || c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="lc-tipo" className={labelClass}>Tipo de Lançamento *</label>
            <select id="lc-tipo" value={tipoId} onChange={(e) => setTipoId(e.target.value)} className={inputClass}>
              <option value="">Selecione…</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} ({t.natureza === "provento" ? "Provento" : "Desconto"})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="lc-valor" className={labelClass}>Valor *</label>
              <MoneyInput id="lc-valor" value={valor} onChange={setValor} />
            </div>
            <div>
              <label htmlFor="lc-desc" className={labelClass}>Descrição</label>
              <input id="lc-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} />
            </div>
          </div>
          {tipoSel && (
            <p className="text-xs text-muted-foreground">
              Natureza: <strong>{tipoSel.natureza === "provento" ? "Provento (soma)" : "Desconto (subtrai)"}</strong>
            </p>
          )}
          <div>
            <label htmlFor="lc-obs" className={labelClass}>Observação</label>
            <Textarea id="lc-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !colaboradorId || !tipoId || valor == null}>
              {saving ? "Salvando…" : "Lançar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= AÇÕES DA COMPETÊNCIA ============================= */

function ConfirmCompetenciaAction({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  destructive,
  requireMotivo,
  action,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  requireMotivo?: boolean;
  action: (motivo: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function run() {
    setSaving(true);
    try {
      await action(motivo);
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha na operação."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireMotivo && (
          <div>
            <label htmlFor="cf-motivo" className={labelClass}>Motivo *</label>
            <Textarea id="cf-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={saving || (requireMotivo && !motivo.trim())}
            onClick={run}
          >
            {saving ? "Processando…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompetenciaActions({
  competencia,
  resumo,
  canAprovar,
  canFechar,
  canReabrir,
  onChanged,
}: {
  competencia: FolhaCompetencia;
  resumo?: FolhaResumo;
  canAprovar: boolean;
  canFechar: boolean;
  canReabrir: boolean;
  onChanged: () => void;
}) {
  const [dialog, setDialog] = useState<"aprovar" | "fechar" | "reabrir" | "reimportar" | null>(null);

  async function call(fn: string, args: Record<string, unknown>, success: string) {
    await rpcFin<FolhaRpcResult>(fn, args);
    toast.success(success);
    onChanged();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {canAprovar && (competencia.status === "aberta" || competencia.status === "em_conferencia") && (
        <Button size="sm" onClick={() => setDialog("aprovar")}>Aprovar Folha</Button>
      )}
      {canAprovar && competencia.status === "aprovada" && (
        <Button size="sm" variant="outline" onClick={() => setDialog("reimportar")}>Reimportar Automáticos</Button>
      )}
      {canFechar && (competencia.status === "aprovada" || competencia.status === "paga") && (
        <Button size="sm" variant="outline" onClick={() => setDialog("fechar")}>Fechar Competência</Button>
      )}
      {canReabrir && competencia.status === "fechada" && (
        <Button size="sm" variant="outline" onClick={() => setDialog("reabrir")}>Reabrir</Button>
      )}

      <ConfirmCompetenciaAction
        open={dialog === "aprovar"}
        onClose={() => setDialog(null)}
        title="Aprovar Folha"
        description={`Confirma a aprovação da folha de ${competenciaLabel(competencia.competencia)} no total de ${formatCurrencyBRL(resumo?.total_folha ?? 0)}? Após aprovada, os itens ficam prontos para pagamento.`}
        confirmLabel="Aprovar"
        action={() => call("folha_aprovar", { p_competencia_id: competencia.id }, "Folha aprovada.")}
      />
      <ConfirmCompetenciaAction
        open={dialog === "fechar"}
        onClose={() => setDialog(null)}
        title="Fechar Competência"
        description="O fechamento consolida a competência. Após fechada, edições exigem reabertura auditada."
        confirmLabel="Fechar"
        action={() => call("folha_fechar", { p_competencia_id: competencia.id }, "Competência fechada.")}
      />
      <ConfirmCompetenciaAction
        open={dialog === "reabrir"}
        onClose={() => setDialog(null)}
        title="Reabrir Competência"
        description="A reabertura é auditada e exige motivo."
        confirmLabel="Reabrir"
        destructive
        requireMotivo
        action={(motivo) => call("folha_reabrir", { p_competencia_id: competencia.id, p_motivo: motivo }, "Competência reaberta.")}
      />
      <ConfirmCompetenciaAction
        open={dialog === "reimportar"}
        onClose={() => setDialog(null)}
        title="Reimportar Automáticos"
        description="Recalcula salários vigentes, benefícios, adiantamentos e comissões aprovadas. Lançamentos manuais são preservados."
        confirmLabel="Reimportar"
        action={() => call("folha_reimportar", { p_competencia_id: competencia.id }, "Automáticos reimportados.")}
      />
    </div>
  );
}

/* ============================= CANCELAR LANÇAMENTO ============================= */

export function CancelarLancamentoDialog({
  lancamentoId,
  descricao,
  onClose,
  onChanged,
}: {
  lancamentoId: string;
  descricao: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function run() {
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("folha_cancelar_lancamento", { p_id: lancamentoId, p_motivo: motivo });
      toast.success("Lançamento cancelado.");
      onChanged();
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao cancelar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar Lançamento</DialogTitle>
          <DialogDescription>
            Cancelar <strong>{descricao}</strong>? O cancelamento é auditado e exige motivo.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="cl-motivo" className={labelClass}>Motivo *</label>
          <Textarea id="cl-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
          <Button type="button" variant="destructive" disabled={saving || !motivo.trim()} onClick={run}>
            {saving ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
