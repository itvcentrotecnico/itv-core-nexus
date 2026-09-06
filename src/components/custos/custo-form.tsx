import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/caixa/money-input";
import { inputClass, labelClass, round2 } from "@/lib/caixa";
import type {
  CategoriaPeca,
  CustoOS,
  CustosRpcResult,
  Fornecedor,
  OsCaixaRef,
  TipoCusto,
} from "@/lib/custos";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { mensagemErro } from "@/lib/erros";

const NONE = "__none__";
const NOVO_FORNECEDOR = "__novo__";

interface TecnicoOption {
  id: string;
  full_name: string;
  roles: string[];
}

interface CustoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: CustoOS | null;
  onSaved: () => void;
}

/**
 * Formulário rápido de custo por OS. Consulta o Caixa ao digitar a OS
 * (somente referência — nunca edita dados do Caixa).
 */
export function CustoForm({ open, onOpenChange, editing, onSaved }: CustoFormProps) {
  const isEdit = !!editing;

  const [data, setData] = useState(todayManausISO());
  const [os, setOs] = useState("");
  const [osConsultada, setOsConsultada] = useState<string | null>(null);
  const [caixaRef, setCaixaRef] = useState<OsCaixaRef | null>(null);
  const [buscandoOs, setBuscandoOs] = useState(false);
  const [tipoId, setTipoId] = useState("");
  const [categoriaId, setCategoriaId] = useState<string>(NONE);
  const [descricao, setDescricao] = useState("");
  const [tecnicoId, setTecnicoId] = useState<string>(NONE);
  const [tecnicoManual, setTecnicoManual] = useState(false);
  const [fornecedorSel, setFornecedorSel] = useState<string>(NONE);
  const [novoFornecedorNome, setNovoFornecedorNome] = useState("");
  const [novoFornecedorFone, setNovoFornecedorFone] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [compatibilidade, setCompatibilidade] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [custoUnitario, setCustoUnitario] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  const auxQuery = useQuery({
    queryKey: ["custos-aux"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [tipos, categorias, fornecedores, tecnicos] = await Promise.all([
        supabase.from("tipos_custo").select("id, nome, eh_peca, ativo, ordem").eq("ativo", true).order("ordem"),
        supabase.from("categorias_pecas").select("id, nome, ativo, ordem").eq("ativo", true).order("ordem"),
        supabase.from("fornecedores").select("id, nome, telefone, observacao, ativo").eq("ativo", true).order("nome"),
        supabase.rpc("usuarios_basicos"),
      ]);
      if (tipos.error) throw tipos.error;
      if (categorias.error) throw categorias.error;
      if (fornecedores.error) throw fornecedores.error;
      return {
        tipos: (tipos.data ?? []) as TipoCusto[],
        categorias: (categorias.data ?? []) as CategoriaPeca[],
        fornecedores: (fornecedores.data ?? []) as Fornecedor[],
        tecnicos: ((tecnicos.data ?? []) as TecnicoOption[]).filter(
          (t) => t.roles.includes("tecnico") || t.roles.includes("administrador") || t.roles.includes("adm_financeiro") || t.roles.includes("adm_operacional"),
        ),
      };
    },
  });

  const tipos = auxQuery.data?.tipos ?? [];
  const categorias = auxQuery.data?.categorias ?? [];
  const fornecedores = auxQuery.data?.fornecedores ?? [];
  const tecnicos = auxQuery.data?.tecnicos ?? [];

  const tipoAtual = useMemo(() => tipos.find((t) => t.id === tipoId) ?? null, [tipos, tipoId]);
  const mostrarCategoria = tipoAtual?.eh_peca ?? false;

  // Preenche / limpa ao abrir
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setData(editing.data_lancamento);
      setOs(editing.os);
      setOsConsultada(null);
      setCaixaRef(null);
      setTipoId(editing.tipo_custo_id);
      setCategoriaId(editing.categoria_id ?? NONE);
      setDescricao(editing.descricao);
      setTecnicoId(editing.tecnico_id ?? NONE);
      setTecnicoManual(!!editing.tecnico_id);
      setFornecedorSel(editing.fornecedor_id ?? NONE);
      setMarca(editing.marca ?? "");
      setModelo(editing.modelo ?? "");
      setCompatibilidade(editing.compatibilidade ?? "");
      setQuantidade(String(editing.quantidade));
      setCustoUnitario(editing.custo_unitario);
      setObservacao(editing.observacao ?? "");
    } else {
      setData(todayManausISO());
      setOs("");
      setOsConsultada(null);
      setCaixaRef(null);
      setTipoId("");
      setCategoriaId(NONE);
      setDescricao("");
      setTecnicoId(NONE);
      setTecnicoManual(false);
      setFornecedorSel(NONE);
      setNovoFornecedorNome("");
      setNovoFornecedorFone("");
      setMarca("");
      setModelo("");
      setCompatibilidade("");
      setQuantidade("1");
      setCustoUnitario(null);
      setObservacao("");
    }
  }, [open, editing]);

  // Consulta automática da OS no Caixa (com debounce leve)
  useEffect(() => {
    if (!open) return;
    const numero = os.trim();
    if (!numero) {
      setOsConsultada(null);
      setCaixaRef(null);
      return;
    }
    if (numero === osConsultada) return;
    const timer = setTimeout(async () => {
      setBuscandoOs(true);
      try {
        const { data: rows, error } = await supabase
          .from("caixa_lancamentos")
          .select(
            "os, cliente, data_lancamento, valor_bruto, desconto, receita_liquida, tecnico_id, tecnico:profiles!caixa_lancamentos_tecnico_id_fkey(full_name), pagamentos:caixa_pagamentos(forma:formas_pagamento(nome))",
          )
          .eq("os", numero)
          .eq("status", "ativo")
          .order("data_lancamento", { ascending: false })
          .limit(1);
        if (error) throw error;
        const row = rows?.[0] as
          | (Omit<OsCaixaRef, "tecnico_nome" | "pagamentos"> & {
              tecnico?: { full_name: string } | null;
              pagamentos?: { forma: { nome: string } | null }[];
            })
          | undefined;
        if (row) {
          setCaixaRef({
            os: row.os,
            cliente: row.cliente,
            data_lancamento: row.data_lancamento,
            valor_bruto: row.valor_bruto,
            desconto: row.desconto,
            receita_liquida: row.receita_liquida,
            tecnico_id: row.tecnico_id,
            tecnico_nome: row.tecnico?.full_name ?? null,
            pagamentos: (row.pagamentos ?? [])
              .map((p) => p.forma?.nome)
              .filter(Boolean)
              .join(" + "),
          });
          // Sugere o técnico da OS quando o usuário não escolheu manualmente
          if (row.tecnico_id && !tecnicoManual) setTecnicoId(row.tecnico_id);
        } else {
          setCaixaRef(null);
        }
        setOsConsultada(numero);
      } catch {
        // Sem acesso ao Caixa (RLS): trata como não encontrada, sem bloquear
        setCaixaRef(null);
        setOsConsultada(numero);
      } finally {
        setBuscandoOs(false);
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os, open]);

  const qtd = useMemo(() => {
    const n = Number(quantidade.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [quantidade]);

  const custoTotal = useMemo(
    () => (qtd > 0 && custoUnitario != null ? round2(qtd * custoUnitario) : null),
    [qtd, custoUnitario],
  );

  const podeSalvar =
    !!data &&
    !!os.trim() &&
    !!tipoId &&
    !!descricao.trim() &&
    qtd > 0 &&
    custoUnitario != null &&
    custoUnitario > 0 &&
    (fornecedorSel !== NOVO_FORNECEDOR || !!novoFornecedorNome.trim()) &&
    !saving;

  async function handleSave() {
    if (!podeSalvar) return;
    setSaving(true);
    try {
      let fornecedorId = fornecedorSel === NONE ? null : fornecedorSel;
      if (fornecedorSel === NOVO_FORNECEDOR) {
        const { data: novo, error } = await supabase
          .from("fornecedores")
          .insert({
            nome: novoFornecedorNome.trim(),
            telefone: novoFornecedorFone.trim() || null,
          })
          .select("id")
          .single();
        if (error) throw error;
        fornecedorId = novo.id;
      }

      const payload = {
        p_data: data,
        p_os: os.trim(),
        p_tipo_custo_id: tipoId,
        p_descricao: descricao.trim(),
        p_tecnico_id: tecnicoId === NONE ? null : tecnicoId,
        p_categoria_id: mostrarCategoria && categoriaId !== NONE ? categoriaId : null,
        p_marca: marca.trim() || null,
        p_modelo: modelo.trim() || null,
        p_compatibilidade: compatibilidade.trim() || null,
        p_fornecedor_id: fornecedorId,
        p_quantidade: qtd,
        p_custo_unitario: custoUnitario,
        p_observacao: observacao.trim() || null,
      };

      // Os tipos gerados marcam parâmetros opcionais como não-nulos; o cast preserva o null real.
      const { data: result, error } = isEdit
        ? await supabase.rpc("custos_atualizar", { p_id: editing!.id, ...payload } as never)
        : await supabase.rpc("custos_registrar", payload as never);
      if (error) throw error;
      const res = result as unknown as CustosRpcResult;
      if (!res.ok) {
        toast.error(res.message ?? "Não foi possível salvar o custo.");
        return;
      }
      toast.success(isEdit ? "Custo atualizado." : "Custo registrado.", {
        description: `Custo total: ${formatCurrencyBRL(res.custo_total ?? 0)}`,
      });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(mensagemErro(e, "Erro inesperado ao salvar."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar Custo" : "Registrar Custo"}</DialogTitle>
          <DialogDescription>
            Custo direto vinculado a uma Ordem de Serviço. Os dados do Caixa são apenas referência.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="custo-data" className={labelClass}>Data *</label>
            <input
              id="custo-data"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="custo-os" className={labelClass}>Número da OS *</label>
            <div className="relative">
              <input
                id="custo-os"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={os}
                onChange={(e) => setOs(e.target.value)}
                placeholder="Ex: 45821"
                className={inputClass}
              />
              {buscandoOs && (
                <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>

        {/* Consulta da OS no Caixa */}
        {os.trim() && osConsultada === os.trim() && (
          caixaRef ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                OS encontrada no Caixa
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                <span>Cliente: <strong className="text-foreground">{caixaRef.cliente ?? "—"}</strong></span>
                <span>Técnico: <strong className="text-foreground">{caixaRef.tecnico_nome ?? "—"}</strong></span>
                <span>Receita líquida: <strong className="text-foreground">{formatCurrencyBRL(caixaRef.receita_liquida)}</strong></span>
                <span>Faturado em: <strong className="text-foreground">{formatDateOnlyISO(caixaRef.data_lancamento)}</strong></span>
              </div>
              {caixaRef.pagamentos && (
                <p className="mt-1 text-xs text-muted-foreground">Pagamento: {caixaRef.pagamentos}</p>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <Search className="h-4 w-4" aria-hidden="true" />
                Esta OS ainda não possui faturamento registrado no Caixa.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                O custo pode ser lançado normalmente — a margem será calculada quando a OS for faturada.
              </p>
            </div>
          )
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} id="custo-tipo-label">Tipo de Custo *</label>
            <Select value={tipoId} onValueChange={setTipoId}>
              <SelectTrigger aria-labelledby="custo-tipo-label">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {tipos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mostrarCategoria && (
            <div>
              <label className={labelClass} id="custo-categoria-label">Categoria da Peça</label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger aria-labelledby="custo-categoria-label">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem categoria</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="custo-descricao" className={labelClass}>Descrição *</label>
          <input
            id="custo-descricao"
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: Kit de barras LED, Placa Main, Recuperação BGA"
            maxLength={200}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} id="custo-tecnico-label">Técnico</label>
            <Select
              value={tecnicoId}
              onValueChange={(v) => {
                setTecnicoId(v);
                setTecnicoManual(true);
              }}
            >
              <SelectTrigger aria-labelledby="custo-tecnico-label">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não informado</SelectItem>
                {tecnicos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className={labelClass} id="custo-fornecedor-label">Fornecedor</label>
            <Select value={fornecedorSel} onValueChange={setFornecedorSel}>
              <SelectTrigger aria-labelledby="custo-fornecedor-label">
                <SelectValue placeholder="Opcional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Não se aplica</SelectItem>
                {fornecedores.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                ))}
                <SelectItem value={NOVO_FORNECEDOR}>+ Novo fornecedor…</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {fornecedorSel === NOVO_FORNECEDOR && (
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-dashed border-border p-3 sm:grid-cols-2">
            <div>
              <label htmlFor="novo-fornecedor-nome" className={labelClass}>Nome do fornecedor *</label>
              <input
                id="novo-fornecedor-nome"
                type="text"
                value={novoFornecedorNome}
                onChange={(e) => setNovoFornecedorNome(e.target.value)}
                maxLength={120}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="novo-fornecedor-fone" className={labelClass}>Telefone</label>
              <input
                id="novo-fornecedor-fone"
                type="tel"
                value={novoFornecedorFone}
                onChange={(e) => setNovoFornecedorFone(e.target.value)}
                maxLength={20}
                className={inputClass}
              />
            </div>
          </div>
        )}

        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
            Marca, modelo e compatibilidade (opcional)
          </summary>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="custo-marca" className={labelClass}>Marca</label>
              <input id="custo-marca" type="text" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Samsung" maxLength={60} className={inputClass} />
            </div>
            <div>
              <label htmlFor="custo-modelo" className={labelClass}>Modelo</label>
              <input id="custo-modelo" type="text" value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="BN44-00932A" maxLength={60} className={inputClass} />
            </div>
            <div>
              <label htmlFor="custo-compat" className={labelClass}>Compatibilidade</label>
              <input id="custo-compat" type="text" value={compatibilidade} onChange={(e) => setCompatibilidade(e.target.value)} placeholder="UN55RU7100" maxLength={80} className={inputClass} />
            </div>
          </div>
        </details>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="custo-qtd" className={labelClass}>Quantidade *</label>
            <input
              id="custo-qtd"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value.replace(/[^\d.,]/g, ""))}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="custo-unit" className={labelClass}>Custo Unitário *</label>
            <MoneyInput id="custo-unit" value={custoUnitario} onChange={setCustoUnitario} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className={labelClass}>Custo Total</span>
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm font-semibold text-foreground" aria-live="polite">
              {custoTotal != null ? formatCurrencyBRL(custoTotal) : "—"}
            </p>
          </div>
        </div>

        {isEdit && editing!.devolvido_total > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Este custo já possui {formatCurrencyBRL(editing!.devolvido_total)} devolvido — o total não pode ficar abaixo disso.
          </p>
        )}

        <div>
          <label htmlFor="custo-obs" className={labelClass}>Observação</label>
          <textarea
            id="custo-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ex: peça comprada especificamente para esta OS"
            className={inputClass}
          />
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!podeSalvar}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {isEdit ? "Salvar alterações" : "Confirmar registro"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
