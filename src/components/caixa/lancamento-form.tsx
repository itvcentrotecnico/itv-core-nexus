import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  inputClass,
  labelClass,
  round2,
  type CaixaLancamento,
  type CaixaRpcResult,
  type FormaPagamento,
  
  type TipoReceita,
} from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  COMISSAO_ENTREGA_VAZIA,
  ComissaoEntregaSection,
  useComissaoEntregaConfig,
  useEntregadores,
  type ComissaoEntregaEstado,
} from "@/components/caixa/comissao-entrega-section";
import type { ComissaoEntrega } from "@/lib/comissao-entrega";
import { SolicitarDescontoDialog, useDescontosDisponiveis } from "@/components/caixa/descontos";
import {
  resolverTaxa,
  useTaxasRecebimento,
  valorTaxa,
  type TaxaRecebimento,
} from "@/lib/taxas-recebimento";

const NONE = "__none__";

interface PagRow {
  key: number;
  forma_pagamento_id: string;
  valor: number | null;
  parcelas: number;
  taxa_percentual: number | null;
  taxa_valor: number | null;
  /** Origem do recebimento usada para localizar a taxa (ex.: Mercado Pago · Point). */
  adquirente: string;
  canal: string;
}

let rowKey = 1;
function emptyRow(formaId = ""): PagRow {
  return {
    key: rowKey++,
    forma_pagamento_id: formaId,
    valor: null,
    parcelas: 1,
    taxa_percentual: null,
    taxa_valor: null,
    adquirente: "",
    canal: "",
  };
}

/** Origens (adquirente + canal) com taxa configurada para o meio informado. */
function origensDoMeio(taxas: TaxaRecebimento[], meio: string | null | undefined, data: string) {
  if (!meio) return [];
  const mapa = new Map<string, { adquirente: string; canal: string }>();
  for (const t of taxas) {
    if (t.meio_pagamento.toLowerCase() !== meio.toLowerCase()) continue;
    if (!t.ativo) continue;
    if (t.vigencia_inicio > data || (t.vigencia_fim && t.vigencia_fim < data)) continue;
    mapa.set(`${t.adquirente}|${t.canal}`, { adquirente: t.adquirente, canal: t.canal });
  }
  return [...mapa.entries()].map(([chave, v]) => ({ chave, ...v }));
}

/** Parcelas com taxa configurada para a origem escolhida. */
function parcelasConfiguradas(
  taxas: TaxaRecebimento[],
  args: { adquirente: string; canal: string; meio: string; data: string },
): number[] {
  const list = taxas
    .filter(
      (t) =>
        t.ativo &&
        t.adquirente === args.adquirente &&
        t.canal === args.canal &&
        t.meio_pagamento.toLowerCase() === args.meio.toLowerCase() &&
        t.vigencia_inicio <= args.data &&
        (!t.vigencia_fim || t.vigencia_fim >= args.data),
    )
    .map((t) => t.parcelas);
  return [...new Set(list)].sort((a, b) => a - b);
}


interface LancamentoFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Data selecionada na tela do caixa (usada como padrão em novos lançamentos). */
  defaultDate: string;
  editing?: CaixaLancamento | null;
  onSaved: () => void;
}

export function LancamentoForm({ open, onOpenChange, defaultDate, editing, onSaved }: LancamentoFormProps) {
  const [data, setData] = useState(defaultDate);
  const [os, setOs] = useState("");
  const [cliente, setCliente] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [valorBruto, setValorBruto] = useState<number | null>(null);
  const [desconto, setDesconto] = useState<number | null>(null);
  const [observacao, setObservacao] = useState("");
  const [rows, setRows] = useState<PagRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [dupInfo, setDupInfo] = useState<NonNullable<CaixaRpcResult["existente"]> | null>(null);
  const [comissaoEntrega, setComissaoEntrega] = useState<ComissaoEntregaEstado>(COMISSAO_ENTREGA_VAZIA);
  const [autorizacaoId, setAutorizacaoId] = useState<string | null>(null);
  const [alcadaInfo, setAlcadaInfo] = useState<{ percentual: number; limite: number | null } | null>(null);
  const autorizacoesQuery = useDescontosDisponiveis(open);
  const autorizacoesDisponiveis = autorizacoesQuery.data ?? [];

  const configCeQuery = useComissaoEntregaConfig(open);
  const entregadoresQuery = useEntregadores(open);

  /** Comissão de entrega vigente do lançamento em edição. */
  const comissaoAtualQuery = useQuery({
    queryKey: ["comissao-entrega", "do-lancamento", editing?.id ?? null],
    enabled: open && !!editing,
    queryFn: async (): Promise<ComissaoEntrega | null> => {
      const { data, error } = await supabase.rpc("comissao_entrega_listar", {});
      if (error) return null;
      const res = data as unknown as { ok: boolean; itens?: ComissaoEntrega[] };
      if (!res?.ok) return null;
      return (
        (res.itens ?? []).find(
          (i) => i.caixa_lancamento_id === editing?.id && i.status !== "cancelada",
        ) ?? null
      );
    },
  });



  const tiposQuery = useQuery({
    queryKey: ["caixa", "tipos-receita"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_receita")
        .select("id, nome, ativo, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as TipoReceita[];
    },
  });

  const formasQuery = useQuery({
    queryKey: ["caixa", "formas-pagamento"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .select(
          "id, nome, ativo, ordem, eh_dinheiro, taxa_padrao_percentual, permite_parcelamento, max_parcelas, liquidacao_imediata, prazo_liquidacao_dias, meio_taxa",
        )
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data as FormaPagamento[];
    },
  });

  const taxasQuery = useTaxasRecebimento(open);
  const taxas = useMemo(() => taxasQuery.data ?? [], [taxasQuery.data]);



  const tecnicosQuery = useQuery({
    queryKey: ["caixa", "usuarios-basicos"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      return data;
    },
  });

  // Preenche/reseta o formulário ao abrir
  useEffect(() => {
    if (!open) return;
    setDupInfo(null);
    setAutorizacaoId(null);
    setAlcadaInfo(null);
    if (editing) {
      setData(editing.data_lancamento);
      setOs(editing.os ?? "");
      setCliente(editing.cliente ?? "");
      setTipoId(editing.tipo_receita_id);
      setDescricao(editing.descricao ?? "");
      setTecnicoId(editing.tecnico_id ?? "");
      setValorBruto(editing.valor_bruto);
      setDesconto(editing.desconto || null);
      setObservacao(editing.observacao ?? "");
      setRows(
        (editing.pagamentos ?? []).map((p) => ({
          key: rowKey++,
          forma_pagamento_id: p.forma_pagamento_id,
          valor: p.valor,
          parcelas: p.parcelas,
          taxa_percentual: p.taxa_percentual || null,
          taxa_valor: p.taxa_valor || null,
          adquirente: p.adquirente ?? "",
          canal: p.canal ?? "",
        })),
      );

    } else {
      setData(defaultDate);
      setOs("");
      setCliente("");
      setTipoId("");
      setDescricao("");
      setTecnicoId("");
      setValorBruto(null);
      setDesconto(null);
      setObservacao("");
      setRows([emptyRow()]);
      setComissaoEntrega(COMISSAO_ENTREGA_VAZIA);
    }
  }, [open, editing, defaultDate]);

  // Carrega a comissão de entrega vigente ao editar um lançamento
  useEffect(() => {
    if (!open || !editing) return;
    const atual = comissaoAtualQuery.data;
    setComissaoEntrega(
      atual
        ? {
            ativa: true,
            entregadorId: atual.entregador_id,
            tipo: atual.tipo,
            avaliacaoConfirmada: atual.avaliacao_confirmada,
            observacao: atual.avaliacao_observacao ?? "",
          }
        : COMISSAO_ENTREGA_VAZIA,
    );
  }, [open, editing, comissaoAtualQuery.data]);


  const valorFinal = useMemo(
    () => round2((valorBruto ?? 0) - (desconto ?? 0)),
    [valorBruto, desconto],
  );
  const somaPagamentos = useMemo(
    () => round2(rows.reduce((acc, r) => acc + (r.valor ?? 0), 0)),
    [rows],
  );
  const diferenca = useMemo(() => round2(valorFinal - somaPagamentos), [valorFinal, somaPagamentos]);

  /**
   * Pré-visualização da taxa por pagamento (o valor oficial é calculado no banco).
   * VALOR DA VENDA − TAXA DE RECEBIMENTO = VALOR LÍQUIDO.
   */
  const taxasLinhas = useMemo(() => {
    const formas = formasQuery.data ?? [];
    const mapa = new Map<
      number,
      { ok: boolean; message?: string; percentual: number; taxa: number; liquido: number; percentualCliente: number; juros: number }
    >();
    for (const r of rows) {
      const forma = formas.find((f) => f.id === r.forma_pagamento_id);
      const meio = forma?.meio_taxa ?? null;
      const valor = r.valor ?? 0;
      if (!forma || !meio || !r.adquirente) {
        mapa.set(r.key, { ok: true, percentual: 0, taxa: 0, liquido: round2(valor), percentualCliente: 0, juros: 0 });
        continue;
      }
      const res = resolverTaxa(taxas, {
        adquirente: r.adquirente,
        canal: r.canal,
        meio,
        parcelas: r.parcelas,
        data,
      });
      const taxa = valorTaxa(valor, res.percentualItv);
      mapa.set(r.key, {
        ok: res.ok,
        ...(res.message ? { message: res.message } : {}),
        percentual: res.percentualItv,
        taxa,
        liquido: round2(valor - taxa),
        percentualCliente: res.percentualCliente,
        juros: valorTaxa(valor, res.percentualCliente),
      });
    }
    return mapa;
  }, [rows, taxas, data, formasQuery.data]);

  const taxaTotal = useMemo(
    () => round2([...taxasLinhas.values()].reduce((a, t) => a + t.taxa, 0)),
    [taxasLinhas],
  );
  const liquidoTotal = useMemo(() => round2(somaPagamentos - taxaTotal), [somaPagamentos, taxaTotal]);

  function updateRow(key: number, patch: Partial<PagRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }



  function addRow() {
    const restante = diferenca > 0 ? diferenca : null;
    setRows((prev) => [...prev, { ...emptyRow(), valor: restante }]);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  function validate(): string | null {
    if (!data) return "Informe a data do lançamento.";
    if (!tipoId) return "Selecione o tipo de receita.";
    if (valorBruto == null || valorBruto <= 0) return "Informe o valor bruto.";
    if ((desconto ?? 0) < 0) return "O desconto não pode ser negativo.";
    if (valorFinal < 0) return "O desconto não pode ser maior que o valor bruto.";
    const validas = rows.filter((r) => r.forma_pagamento_id && (r.valor ?? 0) > 0);
    if (validas.length === 0) return "Informe ao menos uma forma de pagamento com valor.";
    if (somaPagamentos !== valorFinal) {
      return `A soma dos pagamentos (${formatCurrencyBRL(somaPagamentos)}) não corresponde ao valor final (${formatCurrencyBRL(valorFinal)}). Diferença: ${formatCurrencyBRL(diferenca)}.`;
    }
    const formasAtuais = formasQuery.data ?? [];
    for (const r of validas) {
      const forma = formasAtuais.find((f) => f.id === r.forma_pagamento_id);
      if (forma?.meio_taxa && !r.adquirente) {
        return `Informe a origem do recebimento (maquininha ou link) para o pagamento em ${forma.nome}.`;
      }
      const t = taxasLinhas.get(r.key);
      if (t && !t.ok) return t.message ?? "Taxa de recebimento ainda não configurada.";
    }

    if (comissaoEntrega.ativa) {
      if (!comissaoEntrega.entregadorId) return "Selecione o entregador da comissão de entrega.";
      if (
        comissaoEntrega.tipo === "entrega_avaliacao" &&
        configCeQuery.data?.valor_taxa_com_avaliacao == null
      ) {
        return "O valor de entrega + avaliação ainda não foi configurado pelo administrador.";
      }
    }
    return null;
  }

  /** Persiste a comissão de entrega vinculada ao lançamento (nunca afeta o faturamento). */
  async function salvarComissaoEntrega(lancamentoId: string) {
    if (!comissaoEntrega.ativa) {
      if (editing && comissaoAtualQuery.data) {
        const { data: res } = await supabase.rpc("comissao_entrega_remover", {
          p_lancamento_id: lancamentoId,
          p_motivo: "Comissão removida na edição do lançamento.",
        });
        const r = res as unknown as { ok: boolean; message?: string };
        if (r && !r.ok) toast.error(r.message ?? "Não foi possível remover a comissão de entrega.");
      }
      return;
    }
    const { data: res, error } = await supabase.rpc("comissao_entrega_salvar", {
      p_lancamento_id: lancamentoId,
      p_entregador_id: comissaoEntrega.entregadorId,
      p_tipo: comissaoEntrega.tipo,
      p_avaliacao_confirmada: comissaoEntrega.avaliacaoConfirmada,
      ...(comissaoEntrega.observacao.trim()
        ? { p_avaliacao_observacao: comissaoEntrega.observacao.trim() }
        : {}),
    });
    if (error) {
      toast.error("Lançamento salvo, mas a comissão de entrega não pôde ser registrada.");
      return;
    }
    const r = res as unknown as { ok: boolean; message?: string };
    if (r && !r.ok) {
      toast.error(r.message ?? "Comissão de entrega não registrada.");
    }
  }


  async function submit(confirmarDuplicidade: boolean) {
    // Campos opcionais são omitidos quando vazios (o banco aplica NULL/coalesce).
    const payload = {
      p_data: data,
      p_tipo_receita_id: tipoId,
      p_valor_bruto: valorBruto ?? 0,
      p_desconto: desconto ?? 0,
      p_pagamentos: rows
        .filter((r) => r.forma_pagamento_id && (r.valor ?? 0) > 0)
        .map((r) => ({
          forma_pagamento_id: r.forma_pagamento_id,
          valor: round2(r.valor ?? 0),
          parcelas: Math.max(1, r.parcelas || 1),
          // A taxa oficial é calculada no banco a partir da tabela vigente.
          ...(r.adquirente ? { adquirente: r.adquirente, canal: r.canal } : {}),
        })) as unknown as Json,

      p_confirmar_duplicidade: confirmarDuplicidade,
      ...(os.trim() ? { p_os: os.trim() } : {}),
      ...(cliente.trim() ? { p_cliente: cliente.trim() } : {}),
      ...(descricao.trim() ? { p_descricao: descricao.trim() } : {}),
      ...(tecnicoId ? { p_tecnico_id: tecnicoId } : {}),
      ...(observacao.trim() ? { p_observacao: observacao.trim() } : {}),
      ...(autorizacaoId ? { p_desconto_autorizacao_id: autorizacaoId } : {}),
    };

    setSaving(true);
    try {
      const { data: res, error } = editing
        ? await supabase.rpc("caixa_atualizar_lancamento", { p_id: editing.id, ...payload })
        : await supabase.rpc("caixa_registrar_lancamento", payload);
      if (error) {
        toast.error("Não foi possível salvar o lançamento. Tente novamente.");
        return;
      }
      const result = res as CaixaRpcResult;
      if (!result.ok) {
        if (result.code === "OS_DUPLICADA" && result.existente) {
          setDupInfo(result.existente);
          return;
        }
        if (result.code === "DESCONTO_ACIMA_ALCADA") {
          setAlcadaInfo({
            percentual: Number(result["percentual"] ?? 0),
            limite: result["limite"] == null ? null : Number(result["limite"]),
          });
          return;
        }
        toast.error(result.message ?? "Operação não concluída.");
        return;
      }
      const lancamentoId = (result.id as string | undefined) ?? editing?.id;
      if (lancamentoId) await salvarComissaoEntrega(lancamentoId);
      toast.success(editing ? "Lançamento atualizado." : "Lançamento registrado no caixa.");
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit() {
    const erro = validate();
    if (erro) {
      toast.error(erro);
      return;
    }
    void submit(false);
  }

  const tecnicos = tecnicosQuery.data ?? [];
  const formas = formasQuery.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
            <DialogDescription>
              Registre a entrada no caixa com uma ou mais formas de pagamento.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cx-data" className={labelClass}>
                Data
              </label>
              <input
                id="cx-data"
                type="date"
                value={data}
                max={todayManausISO()}
                onChange={(e) => setData(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cx-os" className={labelClass}>
                Nº da OS <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="cx-os"
                type="text"
                value={os}
                onChange={(e) => setOs(e.target.value)}
                placeholder="Ex.: 12345"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cx-cliente" className={labelClass}>
                Cliente <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="cx-cliente"
                type="text"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                placeholder="Nome do cliente"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tipo de receita</label>
              <Select value={tipoId} onValueChange={setTipoId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  {(tiposQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="cx-descricao" className={labelClass}>
                Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <input
                id="cx-descricao"
                type="text"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: Troca de tela TV 50&quot;"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Técnico <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Select value={tecnicoId || NONE} onValueChange={(v) => setTecnicoId(v === NONE ? "" : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {tecnicos.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="cx-bruto" className={labelClass}>
                  Valor bruto
                </label>
                <MoneyInput id="cx-bruto" value={valorBruto} onChange={setValorBruto} />
              </div>
              <div>
                <label htmlFor="cx-desconto" className={labelClass}>
                  Desconto
                </label>
                <MoneyInput id="cx-desconto" value={desconto} onChange={setDesconto} />
              </div>
            </div>
          </div>

          <div className="mt-2 flex items-center justify-between rounded-lg bg-secondary px-4 py-3">
            <span className="text-sm font-medium text-secondary-foreground">Valor final</span>
            <span
              className={cn(
                "font-display text-lg font-bold",
                valorFinal < 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {formatCurrencyBRL(valorFinal)}
            </span>
          </div>

          {/* Alçada de desconto */}
          {(desconto ?? 0) > 0 && autorizacoesDisponiveis.length > 0 && !autorizacaoId && (
            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <p className="font-medium text-foreground">Autorização de desconto aprovada disponível</p>
              <ul className="mt-2 space-y-1.5">
                {autorizacoesDisponiveis.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">
                      OS {a.os || "—"} · até {formatCurrencyBRL(a.valor_desconto)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAutorizacaoId(a.id)}
                      className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Usar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {autorizacaoId && (
            <div className="mt-2 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium text-primary">Desconto autorizado por gestor</span>
              <button
                type="button"
                onClick={() => setAutorizacaoId(null)}
                className="text-xs font-medium text-muted-foreground underline"
              >
                Remover
              </button>
            </div>
          )}

          {/* Pagamentos */}
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Pagamentos</h3>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Adicionar pagamento
              </button>
            </div>

            {rows.map((r, i) => (
              <div key={r.key} className="rounded-lg border border-border bg-card p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-12">
                  <div className="col-span-2 sm:col-span-4">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Forma
                    </label>
                    <Select
                      value={r.forma_pagamento_id}
                      onValueChange={(v) => {
                        const forma = formas.find((f) => f.id === v);
                        const parcelas = forma?.permite_parcelamento
                          ? Math.min(r.parcelas, forma.max_parcelas ?? 1)
                          : 1;
                        const origens = origensDoMeio(taxas, forma?.meio_taxa, data);
                        const origem = origens[0];
                        updateRow(r.key, {
                          forma_pagamento_id: v,
                          parcelas,
                          adquirente: origem?.adquirente ?? "",
                          canal: origem?.canal ?? "",
                        });
                      }}

                    >
                      <SelectTrigger className="w-full" aria-label={`Forma de pagamento ${i + 1}`}>
                        <SelectValue placeholder="Selecione…" />
                      </SelectTrigger>
                      <SelectContent>
                        {formas.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Valor
                    </label>
                    <MoneyInput
                      aria-label={`Valor do pagamento ${i + 1}`}
                      value={r.valor}
                      onChange={(v) => updateRow(r.key, { valor: v })}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-4">
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Parcelamento
                    </label>
                    {(() => {
                      const forma = formas.find((f) => f.id === r.forma_pagamento_id);
                      const max = forma?.permite_parcelamento ? Math.max(1, forma.max_parcelas ?? 1) : 1;
                      const configuradas =
                        forma?.meio_taxa && r.adquirente
                          ? parcelasConfiguradas(taxas, {
                              adquirente: r.adquirente,
                              canal: r.canal,
                              meio: forma.meio_taxa,
                              data,
                            }).filter((n) => n <= max)
                          : [];
                      const opcoes =
                        configuradas.length > 0
                          ? configuradas
                          : Array.from({ length: max }, (_, n) => n + 1);
                      return (
                        <select
                          value={r.parcelas}
                          disabled={opcoes.length <= 1}
                          aria-label={`Parcelas do pagamento ${i + 1}`}
                          onChange={(e) =>
                            updateRow(r.key, { parcelas: Math.max(1, Number(e.target.value) || 1) })
                          }
                          className={inputClass}
                        >
                          {opcoes.map((n) => (
                            <option key={n} value={n}>
                              {n}x
                            </option>
                          ))}
                        </select>
                      );
                    })()}
                  </div>
                  <div className="flex items-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      disabled={rows.length === 1}
                      aria-label={`Remover pagamento ${i + 1}`}
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Origem do recebimento — define a taxa aplicada automaticamente */}
                {(() => {
                  const forma = formas.find((f) => f.id === r.forma_pagamento_id);
                  const origens = origensDoMeio(taxas, forma?.meio_taxa, data);
                  if (!forma?.meio_taxa || origens.length === 0) return null;
                  return (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Recebido por
                      </label>
                      <select
                        value={r.adquirente ? `${r.adquirente}|${r.canal}` : ""}
                        aria-label={`Origem do recebimento ${i + 1}`}
                        onChange={(e) => {
                          const [adq = "", can = ""] = e.target.value.split("|");
                          updateRow(r.key, { adquirente: adq, canal: can });
                        }}
                        className={inputClass}
                      >
                        <option value="">Selecione…</option>
                        {origens.map((o) => (
                          <option key={o.chave} value={o.chave}>
                            {o.adquirente} · {o.canal}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}

                {/* Prévia da taxa de recebimento */}
                {(() => {
                  const t = taxasLinhas.get(r.key);
                  if (!t || (r.valor ?? 0) <= 0) return null;
                  if (!t.ok) {
                    return (
                      <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700">
                        {t.message}
                      </p>
                    );
                  }
                  if (t.percentual === 0 && t.percentualCliente === 0) return null;
                  return (
                    <div className="mt-2 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                      Taxa de recebimento{" "}
                      <strong className="text-foreground">
                        {t.percentual.toFixed(2).replace(".", ",")}%
                      </strong>{" "}
                      = {formatCurrencyBRL(t.taxa)} · Líquido{" "}
                      <strong className="text-primary">{formatCurrencyBRL(t.liquido)}</strong>
                      {t.percentualCliente > 0 && (
                        <span className="block">
                          Juros pagos pelo cliente: {t.percentualCliente.toFixed(2).replace(".", ",")}% (
                          {formatCurrencyBRL(t.juros)}) — não é custo da ITV.
                        </span>
                      )}
                    </div>
                  );
                })()}

                {(() => {
                  const forma = formas.find((f) => f.id === r.forma_pagamento_id);
                  if (!forma || forma.liquidacao_imediata !== false) return null;
                  return (
                    <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700">
                      {forma.nome} não entra como dinheiro recebido hoje: será gerada uma conta a receber
                      com vencimento em {forma.prazo_liquidacao_dias ?? 0} dia(s).
                    </p>
                  );
                })()}

              </div>
            ))}

            <div
              className={cn(
                "flex items-center justify-between rounded-lg px-4 py-3 text-sm",
                diferenca === 0 && valorFinal > 0
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span>
                Total informado: <strong>{formatCurrencyBRL(somaPagamentos)}</strong>
              </span>
              {diferenca !== 0 && (
                <span className="font-medium text-destructive">
                  Diferença: {formatCurrencyBRL(diferenca)}
                </span>
              )}
              {diferenca === 0 && valorFinal > 0 && (
                <span className="font-semibold">Pagamentos conferem</span>
              )}
            </div>

            {taxaTotal > 0 && (
              <dl className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Valor bruto</dt>
                  <dd className="font-medium text-foreground">{formatCurrencyBRL(valorBruto ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">(−) Desconto</dt>
                  <dd className="font-medium text-foreground">{formatCurrencyBRL(desconto ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">(−) Taxa de recebimento</dt>
                  <dd className="font-medium text-foreground">{formatCurrencyBRL(taxaTotal)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">= Líquido do recebimento</dt>
                  <dd className="font-semibold text-primary">{formatCurrencyBRL(liquidoTotal)}</dd>
                </div>
              </dl>
            )}

          </div>

          <ComissaoEntregaSection
            valor={comissaoEntrega}
            onChange={(patch) => setComissaoEntrega((prev) => ({ ...prev, ...patch }))}
            config={configCeQuery.data}
            entregadores={entregadoresQuery.data ?? []}
          />



          <div className="mt-4">
            <label htmlFor="cx-obs" className={labelClass}>
              Observação <span className="font-normal text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              id="cx-obs"
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className={cn(inputClass, "resize-none")}
            />
          </div>

          <DialogFooter className="mt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "Salvar alterações" : "Registrar lançamento"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de OS duplicada */}
      <AlertDialog open={!!dupInfo} onOpenChange={(v) => !v && setDupInfo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              OS já faturada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Esta OS já possui um lançamento financeiro ativo:</p>
                {dupInfo && (
                  <ul className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
                    <li>
                      <strong>OS:</strong> {dupInfo.os}
                    </li>
                    <li>
                      <strong>Data:</strong> {formatDateOnlyISO(dupInfo.data)}
                    </li>
                    {dupInfo.cliente && (
                      <li>
                        <strong>Cliente:</strong> {dupInfo.cliente}
                      </li>
                    )}
                    <li>
                      <strong>Valor:</strong> {formatCurrencyBRL(dupInfo.valor)}
                    </li>
                    {dupInfo.responsavel && (
                      <li>
                        <strong>Responsável:</strong> {dupInfo.responsavel}
                      </li>
                    )}
                  </ul>
                )}
                <p>Deseja registrar assim mesmo?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDupInfo(null)}>Voltar e revisar</AlertDialogCancel>
            <button
              type="button"
              onClick={() => {
                setDupInfo(null);
                void submit(true);
              }}
              className="inline-flex items-center rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90"
            >
              Registrar mesmo assim
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SolicitarDescontoDialog
        open={!!alcadaInfo}
        onOpenChange={(v) => !v && setAlcadaInfo(null)}
        contexto={{
          os: os.trim() || null,
          cliente: cliente.trim() || null,
          valorOriginal: valorBruto ?? 0,
          valorDesconto: desconto ?? 0,
        }}
        limite={alcadaInfo?.limite ?? null}
        onSolicitado={() => {
          setAlcadaInfo(null);
          void autorizacoesQuery.refetch();
        }}
      />
    </>
  );
}
