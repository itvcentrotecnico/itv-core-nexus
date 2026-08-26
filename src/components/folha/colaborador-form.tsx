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
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { rpcFin } from "@/components/financeiro/shared";
import {
  STATUS_COLABORADOR,
  TIPOS_VINCULO,
  type Colaborador,
  type ColaboradorStatus,
  type FolhaRpcResult,
} from "@/lib/folha";
import { useFolhaRefs } from "./shared";

export function invalidateFolha(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["folha"] });
  void queryClient.invalidateQueries({ queryKey: ["colaboradores"] });
  void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard-indicadores"] });
}

/* ============================= CADASTRO / EDIÇÃO ============================= */

export function ColaboradorForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Colaborador | null;
}) {
  const queryClient = useQueryClient();
  const refs = useFolhaRefs(open);
  const [saving, setSaving] = useState(false);

  const [nome, setNome] = useState("");
  const [nomeExibicao, setNomeExibicao] = useState("");
  const [cargoId, setCargoId] = useState("");
  const [setorId, setSetorId] = useState("");
  const [dataAdmissao, setDataAdmissao] = useState("");
  const [salario, setSalario] = useState<number | null>(null);
  const [vinculo, setVinculo] = useState("CLT");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open) return;
    setNome(editing?.nome ?? "");
    setNomeExibicao(editing?.nome_exibicao ?? "");
    setCargoId(editing?.cargo_id ?? "");
    setSetorId(editing?.setor_id ?? "");
    setDataAdmissao(editing?.data_admissao ?? "");
    setSalario(editing?.salario_atual ?? null);
    setVinculo(editing?.tipo_vinculo ?? "CLT");
    setTelefone(editing?.telefone ?? "");
    setEmail(editing?.email ?? "");
    setObservacao(editing?.observacao ?? "");
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const args = {
        p_nome: nome,
        p_nome_exibicao: nomeExibicao || null,
        p_cargo_id: cargoId || null,
        p_setor_id: setorId || null,
        p_data_admissao: dataAdmissao || null,
        p_tipo_vinculo: vinculo || null,
        p_telefone: telefone || null,
        p_email: email || null,
        p_observacao: observacao || null,
      };
      if (editing) {
        await rpcFin<FolhaRpcResult>("colaboradores_atualizar", { p_id: editing.id, ...args });
        toast.success("Colaborador atualizado.");
      } else {
        await rpcFin<FolhaRpcResult>("colaboradores_registrar", { ...args, p_salario_base: salario });
        toast.success("Colaborador cadastrado com salário inicial registrado.");
      }
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar colaborador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Colaborador" : "Novo Colaborador"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Dados cadastrais. Para alterar o salário, use \"Alterar Salário\" (preserva o histórico)."
              : "O salário informado será registrado como salário inicial de admissão."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="c-nome" className={labelClass}>Nome Completo *</label>
            <input id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="c-exib" className={labelClass}>Nome de Exibição</label>
            <input id="c-exib" value={nomeExibicao} onChange={(e) => setNomeExibicao(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="c-vinc" className={labelClass}>Tipo de Vínculo</label>
            <select id="c-vinc" value={vinculo} onChange={(e) => setVinculo(e.target.value)} className={inputClass}>
              {TIPOS_VINCULO.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="c-cargo" className={labelClass}>Cargo</label>
            <select id="c-cargo" value={cargoId} onChange={(e) => setCargoId(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {(refs.data?.cargos ?? []).filter((c) => c.ativo).map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="c-setor" className={labelClass}>Setor</label>
            <select id="c-setor" value={setorId} onChange={(e) => setSetorId(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {(refs.data?.setores ?? []).filter((s) => s.ativo).map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="c-adm" className={labelClass}>Data de Admissão</label>
            <input id="c-adm" type="date" value={dataAdmissao} onChange={(e) => setDataAdmissao(e.target.value)} className={inputClass} />
          </div>
          {!editing && (
            <div>
              <label htmlFor="c-sal" className={labelClass}>Salário Base *</label>
              <MoneyInput id="c-sal" value={salario} onChange={setSalario} />
            </div>
          )}
          <div>
            <label htmlFor="c-tel" className={labelClass}>Telefone</label>
            <input id="c-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="c-email" className={labelClass}>E-mail</label>
            <input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="c-obs" className={labelClass}>Observação</label>
            <Textarea id="c-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !nome.trim() || (!editing && salario == null)}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= ALTERAR SALÁRIO ============================= */

export function AlterarSalarioDialog({ colaborador, onClose }: { colaborador: Colaborador; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [valor, setValor] = useState<number | null>(null);
  const [vigencia, setVigencia] = useState(todayManausISO());
  const [motivo, setMotivo] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await rpcFin<FolhaRpcResult>("colaboradores_alterar_salario", {
        p_colaborador_id: colaborador.id,
        p_valor: valor,
        p_inicio_vigencia: vigencia,
        p_motivo: motivo,
      });
      toast.success(
        `Salário alterado de ${formatCurrencyBRL(Number(r["salario_anterior"] ?? colaborador.salario_atual ?? 0))} para ${formatCurrencyBRL(Number(r["novo_salario"] ?? 0))}.`,
      );
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar salário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Salário — {colaborador.nome_exibicao || colaborador.nome}</DialogTitle>
          <DialogDescription>
            Salário atual: <strong>{formatCurrencyBRL(colaborador.salario_atual ?? 0)}</strong>. O histórico é
            preservado: o salário anterior recebe fim de vigência automaticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="as-valor" className={labelClass}>Novo Salário *</label>
            <MoneyInput id="as-valor" value={valor} onChange={setValor} />
          </div>
          <div>
            <label htmlFor="as-vig" className={labelClass}>Início da Vigência *</label>
            <input id="as-vig" type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="as-motivo" className={labelClass}>Motivo *</label>
            <Textarea id="as-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || valor == null || !vigencia || !motivo.trim()}>
              {saving ? "Salvando…" : "Registrar alteração"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= STATUS / DESLIGAMENTO ============================= */

export function AlterarStatusDialog({ colaborador, onClose }: { colaborador: Colaborador; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<ColaboradorStatus>(colaborador.status);
  const [motivo, setMotivo] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("colaboradores_alterar_status", {
        p_id: colaborador.id,
        p_status: status,
        p_motivo: motivo || null,
      });
      toast.success("Status atualizado.");
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao alterar status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar Status — {colaborador.nome_exibicao || colaborador.nome}</DialogTitle>
          <DialogDescription>
            Status atual: <strong>{STATUS_COLABORADOR[colaborador.status].label}</strong>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="st-novo" className={labelClass}>Novo Status *</label>
            <select
              id="st-novo"
              value={status}
              onChange={(e) => setStatus(e.target.value as ColaboradorStatus)}
              className={inputClass}
            >
              {(Object.keys(STATUS_COLABORADOR) as ColaboradorStatus[])
                .filter((s) => s !== "desligado")
                .map((s) => (
                  <option key={s} value={s}>{STATUS_COLABORADOR[s].label}</option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="st-motivo" className={labelClass}>Motivo</label>
            <Textarea id="st-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || status === colaborador.status}>
              {saving ? "Salvando…" : "Atualizar status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DesligarDialog({ colaborador, onClose }: { colaborador: Colaborador; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(todayManausISO());
  const [motivo, setMotivo] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await rpcFin<FolhaRpcResult>("colaboradores_desligar", {
        p_id: colaborador.id,
        p_data_desligamento: data,
        p_motivo: motivo,
      });
      toast.success("Colaborador desligado. O histórico foi preservado.");
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao desligar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desligar — {colaborador.nome_exibicao || colaborador.nome}</DialogTitle>
          <DialogDescription>
            O colaborador passa a <strong>Desligado</strong> sem apagar o histórico. Verbas rescisórias devem ser
            lançadas na folha da competência com o tipo <strong>Rescisão</strong>.
            {colaborador.data_admissao && (
              <> Admissão: {formatDateOnlyISO(colaborador.data_admissao)}.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="dl-data" className={labelClass}>Data de Desligamento *</label>
            <input id="dl-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="dl-motivo" className={labelClass}>Motivo *</label>
            <Textarea id="dl-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
            <Button type="submit" variant="destructive" disabled={saving || !motivo.trim()}>
              {saving ? "Desligando…" : "Confirmar desligamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
