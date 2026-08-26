import { useEffect, useMemo, useState } from "react";
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
import { todayManausISO } from "@/lib/format";
import {
  competenciaFromMonth,
  monthFromDateISO,
  type ContaPagarSaldo,
  type ContaReceberSaldo,
  type Despesa,
} from "@/lib/financeiro";
import { rpcFin, useFinanceiroRefs, type FinanceiroRefs } from "./shared";

function invalidateFinanceiro(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["financeiro"] });
  void queryClient.invalidateQueries({ queryKey: ["caixa"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard-indicadores"] });
}

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && " *"}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {children}
      </select>
    </div>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && " *"}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        placeholder={placeholder}
      />
    </div>
  );
}

function DateField({
  id,
  label,
  value,
  onChange,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && " *"}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      />
    </div>
  );
}

function CategoriaFields({
  refs,
  categoriaId,
  setCategoriaId,
  subcategoriaId,
  setSubcategoriaId,
  centroId,
  setCentroId,
}: {
  refs: FinanceiroRefs;
  categoriaId: string;
  setCategoriaId: (v: string) => void;
  subcategoriaId: string;
  setSubcategoriaId: (v: string) => void;
  centroId: string;
  setCentroId: (v: string) => void;
}) {
  const subs = useMemo(
    () => refs.subcategorias.filter((s) => s.ativo && s.categoria_id === categoriaId),
    [refs.subcategorias, categoriaId],
  );
  return (
    <>
      <SelectField id="f-cat" label="Categoria" value={categoriaId} onChange={(v) => { setCategoriaId(v); setSubcategoriaId(""); }}>
        <option value="">—</option>
        {refs.categorias.filter((c) => c.ativo && c.tipo !== "receita").map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </SelectField>
      <SelectField id="f-sub" label="Subcategoria" value={subcategoriaId} onChange={setSubcategoriaId}>
        <option value="">—</option>
        {subs.map((s) => (
          <option key={s.id} value={s.id}>{s.nome}</option>
        ))}
      </SelectField>
      <SelectField id="f-centro" label="Centro de Custo" value={centroId} onChange={setCentroId}>
        <option value="">—</option>
        {refs.centros.filter((c) => c.ativo).map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
      </SelectField>
    </>
  );
}

/* ============================= DESPESA ============================= */

export function DespesaForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Despesa | null;
}) {
  const queryClient = useQueryClient();
  const refs = useFinanceiroRefs(open);
  const [saving, setSaving] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [centroId, setCentroId] = useState("");
  const [competencia, setCompetencia] = useState(monthFromDateISO(todayManausISO()));
  const [dataLancamento, setDataLancamento] = useState(todayManausISO());
  const [vencimento, setVencimento] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [recorrente, setRecorrente] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [paga, setPaga] = useState(false);
  const [formaId, setFormaId] = useState("");
  const [dataPagamento, setDataPagamento] = useState(todayManausISO());
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescricao(editing?.descricao ?? "");
    setCategoriaId(editing?.categoria_id ?? "");
    setSubcategoriaId(editing?.subcategoria_id ?? "");
    setFornecedorId(editing?.fornecedor_id ?? "");
    setCentroId(editing?.centro_custo_id ?? "");
    setCompetencia(monthFromDateISO(editing?.competencia) || monthFromDateISO(todayManausISO()));
    setDataLancamento(editing?.data_lancamento ?? todayManausISO());
    setVencimento(editing?.vencimento ?? "");
    setValor(editing?.valor ?? null);
    setRecorrente(editing?.recorrente ?? false);
    setObservacao(editing?.observacao ?? "");
    setPaga(false);
    setFormaId("");
    setDataPagamento(todayManausISO());
    setJustificativa("");
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!refs.data) return;
    setSaving(true);
    try {
      if (editing) {
        await rpcFin("despesas_atualizar", {
          p_id: editing.id,
          p_descricao: descricao,
          p_categoria_id: categoriaId || null,
          p_subcategoria_id: subcategoriaId || null,
          p_fornecedor_id: fornecedorId || null,
          p_centro_custo_id: centroId || null,
          p_competencia: competenciaFromMonth(competencia),
          p_vencimento: vencimento || null,
          p_valor: valor,
          p_recorrente: recorrente,
          p_observacao: observacao || null,
          p_justificativa: justificativa || null,
        });
        toast.success("Despesa atualizada.");
      } else {
        const r = await rpcFin("despesas_registrar", {
          p_descricao: descricao,
          p_categoria_id: categoriaId || null,
          p_subcategoria_id: subcategoriaId || null,
          p_fornecedor_id: fornecedorId || null,
          p_centro_custo_id: centroId || null,
          p_competencia: competenciaFromMonth(competencia),
          p_data_lancamento: dataLancamento,
          p_vencimento: vencimento || null,
          p_valor: valor,
          p_recorrente: recorrente,
          p_observacao: observacao || null,
          p_paga: paga,
          p_forma_pagamento_id: paga ? formaId || null : null,
          p_data_pagamento: paga ? dataPagamento : null,
        });
        toast.success(
          r["conta_pagar_id"]
            ? paga
              ? "Despesa registrada e quitada."
              : "Despesa registrada com obrigação em Contas a Pagar."
            : "Despesa registrada.",
        );
      }
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar despesa.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Despesa" : "Nova Despesa"}</DialogTitle>
          <DialogDescription>
            Despesas pagas ou com vencimento geram automaticamente a obrigação em Contas a Pagar.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField id="d-desc" label="Descrição" value={descricao} onChange={setDescricao} required />
          </div>
          {refs.data && (
            <CategoriaFields
              refs={refs.data}
              categoriaId={categoriaId}
              setCategoriaId={setCategoriaId}
              subcategoriaId={subcategoriaId}
              setSubcategoriaId={setSubcategoriaId}
              centroId={centroId}
              setCentroId={setCentroId}
            />
          )}
          <SelectField id="d-forn" label="Fornecedor" value={fornecedorId} onChange={setFornecedorId}>
            <option value="">—</option>
            {(refs.data?.fornecedores ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </SelectField>
          <div>
            <label htmlFor="d-comp" className={labelClass}>Competência *</label>
            <input
              id="d-comp"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className={inputClass}
            />
          </div>
          <DateField id="d-data" label="Data do Lançamento" value={dataLancamento} onChange={setDataLancamento} required />
          <DateField id="d-venc" label="Vencimento" value={vencimento} onChange={setVencimento} />
          <div>
            <label htmlFor="d-valor" className={labelClass}>Valor *</label>
            <MoneyInput id="d-valor" value={valor} onChange={setValor} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-[var(--primary)]"
            />
            Recorrente
          </label>
          {!editing && (
            <>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={paga}
                  onChange={(e) => setPaga(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-[var(--primary)]"
                />
                Já está paga
              </label>
              {paga && (
                <>
                  <SelectField id="d-forma" label="Forma de Pagamento" value={formaId} onChange={setFormaId} required>
                    <option value="">Selecione…</option>
                    {(refs.data?.formas ?? []).map((f) => (
                      <option key={f.id} value={f.id}>{f.nome}</option>
                    ))}
                  </SelectField>
                  <DateField id="d-dtpag" label="Data do Pagamento" value={dataPagamento} onChange={setDataPagamento} required />
                </>
              )}
            </>
          )}
          {editing && (
            <div className="sm:col-span-2">
              <TextField
                id="d-just"
                label="Justificativa (obrigatória se houver pagamentos)"
                value={justificativa}
                onChange={setJustificativa}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="d-obs" className={labelClass}>Observação</label>
            <Textarea id="d-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !descricao.trim() || !valor}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar despesa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= CONTA A PAGAR ============================= */

export function ContaPagarForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ContaPagarSaldo | null;
}) {
  const queryClient = useQueryClient();
  const refs = useFinanceiroRefs(open);
  const [saving, setSaving] = useState(false);

  const [descricao, setDescricao] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [subcategoriaId, setSubcategoriaId] = useState("");
  const [centroId, setCentroId] = useState("");
  const [competencia, setCompetencia] = useState(monthFromDateISO(todayManausISO()));
  const [dataEmissao, setDataEmissao] = useState(todayManausISO());
  const [vencimento, setVencimento] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [formaId, setFormaId] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [parcelas, setParcelas] = useState(1);
  const [intervalo, setIntervalo] = useState(30);
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setDescricao(editing?.descricao ?? "");
    setFornecedorId(editing?.fornecedor_id ?? "");
    setCategoriaId(editing?.categoria_id ?? "");
    setSubcategoriaId(editing?.subcategoria_id ?? "");
    setCentroId(editing?.centro_custo_id ?? "");
    setCompetencia(monthFromDateISO(editing?.competencia) || monthFromDateISO(todayManausISO()));
    setDataEmissao(editing?.data_emissao ?? todayManausISO());
    setVencimento(editing?.vencimento ?? "");
    setValor(editing?.valor_original ?? null);
    setFormaId(editing?.forma_pagamento_id ?? "");
    setRecorrente(editing?.recorrente ?? false);
    setParcelas(1);
    setIntervalo(30);
    setObservacao(editing?.observacao ?? "");
    setJustificativa("");
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await rpcFin("contas_pagar_atualizar", {
          p_id: editing.id,
          p_descricao: descricao,
          p_fornecedor_id: fornecedorId || null,
          p_categoria_id: categoriaId || null,
          p_subcategoria_id: subcategoriaId || null,
          p_centro_custo_id: centroId || null,
          p_competencia: competenciaFromMonth(competencia),
          p_vencimento: vencimento || null,
          p_valor_original: valor,
          p_forma_pagamento_id: formaId || null,
          p_observacao: observacao || null,
          p_justificativa: justificativa || null,
        });
        toast.success("Conta atualizada.");
      } else {
        const r = await rpcFin("contas_pagar_registrar", {
          p_descricao: descricao,
          p_fornecedor_id: fornecedorId || null,
          p_categoria_id: categoriaId || null,
          p_subcategoria_id: subcategoriaId || null,
          p_centro_custo_id: centroId || null,
          p_competencia: competenciaFromMonth(competencia),
          p_data_emissao: dataEmissao,
          p_vencimento: vencimento || null,
          p_valor: valor,
          p_forma_pagamento_id: formaId || null,
          p_recorrente: recorrente,
          p_observacao: observacao || null,
          p_parcelas: parcelas,
          p_intervalo_dias: intervalo,
        });
        toast.success(
          Number(r["parcelas"]) > 1 ? `Obrigação criada em ${r["parcelas"]} parcelas.` : "Conta a pagar criada.",
        );
      }
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar conta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Conta a Pagar" : "Nova Conta a Pagar"}</DialogTitle>
          <DialogDescription>Compromisso financeiro futuro da ITV. Suporta parcelamento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField id="cp-desc" label="Descrição" value={descricao} onChange={setDescricao} required />
          </div>
          <SelectField id="cp-forn" label="Fornecedor" value={fornecedorId} onChange={setFornecedorId}>
            <option value="">—</option>
            {(refs.data?.fornecedores ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </SelectField>
          {refs.data && (
            <CategoriaFields
              refs={refs.data}
              categoriaId={categoriaId}
              setCategoriaId={setCategoriaId}
              subcategoriaId={subcategoriaId}
              setSubcategoriaId={setSubcategoriaId}
              centroId={centroId}
              setCentroId={setCentroId}
            />
          )}
          <div>
            <label htmlFor="cp-comp" className={labelClass}>Competência</label>
            <input
              id="cp-comp"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className={inputClass}
            />
          </div>
          <DateField id="cp-emis" label="Data de Emissão" value={dataEmissao} onChange={setDataEmissao} required />
          <DateField id="cp-venc" label={editing || parcelas === 1 ? "Vencimento" : "1º Vencimento"} value={vencimento} onChange={setVencimento} required />
          <div>
            <label htmlFor="cp-valor" className={labelClass}>
              {editing ? "Valor *" : parcelas > 1 ? "Valor Total *" : "Valor *"}
            </label>
            <MoneyInput id="cp-valor" value={valor} onChange={setValor} />
          </div>
          <SelectField id="cp-forma" label="Forma de Pagamento Prevista" value={formaId} onChange={setFormaId}>
            <option value="">—</option>
            {(refs.data?.formas ?? []).map((f) => (
              <option key={f.id} value={f.id}>{f.nome}</option>
            ))}
          </SelectField>
          {!editing && (
            <>
              <div>
                <label htmlFor="cp-parc" className={labelClass}>Parcelas</label>
                <input
                  id="cp-parc"
                  type="number"
                  min={1}
                  max={60}
                  value={parcelas}
                  onChange={(e) => setParcelas(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className={inputClass}
                />
              </div>
              {parcelas > 1 && (
                <div>
                  <label htmlFor="cp-int" className={labelClass}>Intervalo (dias)</label>
                  <input
                    id="cp-int"
                    type="number"
                    min={1}
                    value={intervalo}
                    onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value) || 30))}
                    className={inputClass}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={recorrente}
                  onChange={(e) => setRecorrente(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-[var(--primary)]"
                />
                Recorrente
              </label>
            </>
          )}
          {editing && (
            <div className="sm:col-span-2">
              <TextField
                id="cp-just"
                label="Justificativa (obrigatória se houver pagamentos)"
                value={justificativa}
                onChange={setJustificativa}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="cp-obs" className={labelClass}>Observação</label>
            <Textarea id="cp-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !descricao.trim() || !valor || !vencimento}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar obrigação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= CONTA A RECEBER ============================= */

export function ContaReceberForm({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ContaReceberSaldo | null;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [cliente, setCliente] = useState("");
  const [os, setOs] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("");
  const [competencia, setCompetencia] = useState(monthFromDateISO(todayManausISO()));
  const [dataEmissao, setDataEmissao] = useState(todayManausISO());
  const [vencimento, setVencimento] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [parcelas, setParcelas] = useState(1);
  const [intervalo, setIntervalo] = useState(30);
  const [observacao, setObservacao] = useState("");
  const [justificativa, setJustificativa] = useState("");

  useEffect(() => {
    if (!open) return;
    setCliente(editing?.cliente ?? "");
    setOs(editing?.os ?? "");
    setDescricao(editing?.descricao ?? "");
    setOrigem(editing?.origem ?? "");
    setCompetencia(monthFromDateISO(editing?.competencia) || monthFromDateISO(todayManausISO()));
    setDataEmissao(editing?.data_emissao ?? todayManausISO());
    setVencimento(editing?.vencimento ?? "");
    setValor(editing?.valor_original ?? null);
    setParcelas(1);
    setIntervalo(30);
    setObservacao(editing?.observacao ?? "");
    setJustificativa("");
  }, [open, editing]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await rpcFin("contas_receber_atualizar", {
          p_id: editing.id,
          p_cliente: cliente,
          p_descricao: descricao,
          p_os: os || null,
          p_origem: origem || null,
          p_competencia: competenciaFromMonth(competencia),
          p_vencimento: vencimento || null,
          p_valor_original: valor,
          p_observacao: observacao || null,
          p_justificativa: justificativa || null,
        });
        toast.success("Conta atualizada.");
      } else {
        const r = await rpcFin("contas_receber_registrar", {
          p_cliente: cliente,
          p_descricao: descricao,
          p_os: os || null,
          p_origem: origem || null,
          p_competencia: competenciaFromMonth(competencia),
          p_data_emissao: dataEmissao,
          p_vencimento: vencimento || null,
          p_valor: valor,
          p_observacao: observacao || null,
          p_parcelas: parcelas,
          p_intervalo_dias: intervalo,
        });
        toast.success(
          Number(r["parcelas"]) > 1 ? `Conta criada em ${r["parcelas"]} parcelas.` : "Conta a receber criada.",
        );
      }
      invalidateFinanceiro(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar conta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar Conta a Receber" : "Nova Conta a Receber"}</DialogTitle>
          <DialogDescription>
            Direito de recebimento futuro. Ao receber, o valor entra automaticamente no Caixa Diário.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField id="cr-cli" label="Cliente" value={cliente} onChange={setCliente} required />
          <TextField id="cr-os" label="OS (quando aplicável)" value={os} onChange={setOs} placeholder="Nº da OS" />
          <div className="sm:col-span-2">
            <TextField id="cr-desc" label="Descrição" value={descricao} onChange={setDescricao} required />
          </div>
          <TextField
            id="cr-origem"
            label="Origem"
            value={origem}
            onChange={setOrigem}
            placeholder="Ex.: venda a prazo, boleto, crédito acordado"
          />
          <div>
            <label htmlFor="cr-comp" className={labelClass}>Competência</label>
            <input
              id="cr-comp"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className={inputClass}
            />
          </div>
          <DateField id="cr-emis" label="Data de Emissão" value={dataEmissao} onChange={setDataEmissao} required />
          <DateField id="cr-venc" label={editing || parcelas === 1 ? "Vencimento" : "1º Vencimento"} value={vencimento} onChange={setVencimento} required />
          <div>
            <label htmlFor="cr-valor" className={labelClass}>
              {editing || parcelas === 1 ? "Valor *" : "Valor Total *"}
            </label>
            <MoneyInput id="cr-valor" value={valor} onChange={setValor} />
          </div>
          {!editing && (
            <>
              <div>
                <label htmlFor="cr-parc" className={labelClass}>Parcelas</label>
                <input
                  id="cr-parc"
                  type="number"
                  min={1}
                  max={60}
                  value={parcelas}
                  onChange={(e) => setParcelas(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                  className={inputClass}
                />
              </div>
              {parcelas > 1 && (
                <div>
                  <label htmlFor="cr-int" className={labelClass}>Intervalo (dias)</label>
                  <input
                    id="cr-int"
                    type="number"
                    min={1}
                    value={intervalo}
                    onChange={(e) => setIntervalo(Math.max(1, Number(e.target.value) || 30))}
                    className={inputClass}
                  />
                </div>
              )}
            </>
          )}
          {editing && (
            <div className="sm:col-span-2">
              <TextField
                id="cr-just"
                label="Justificativa (obrigatória se houver recebimentos)"
                value={justificativa}
                onChange={setJustificativa}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="cr-obs" className={labelClass}>Observação</label>
            <Textarea id="cr-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !cliente.trim() || !descricao.trim() || !valor || !vencimento}>
              {saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar conta a receber"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
