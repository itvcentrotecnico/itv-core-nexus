/**
 * Boletos CNPJ / Contas a Receber dentro do Caixa Diário.
 * Reutiliza o mesmo título de contas_receber do Financeiro (sem estrutura paralela).
 * Faturamento conta na data da venda; recebimento só gera entrada financeira.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BellRing, CalendarClock, Loader2, Plus, Search, Trash2 } from "lucide-react";
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
import { useAccess } from "@/hooks/use-auth";
import { GRUPO_RECEITA_LABEL, inputClass, labelClass, round2, type GrupoReceita } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Tipos e utilitários                                                 */
/* ------------------------------------------------------------------ */

export interface ClienteCnpj {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  telefone: string | null;
  email_financeiro: string | null;
  contato: string | null;
}

export interface BoletoRow {
  key: number;
  vencimento: string;
  valor: number | null;
  documento: string;
}

export interface FaturadoEstado {
  cliente: ClienteCnpj | null;
  emissao: string;
  notaFiscal: string;
  responsavelId: string;
  boletos: BoletoRow[];
}

let bKey = 1;
export function novoBoleto(valor: number | null = null): BoletoRow {
  return { key: bKey++, vencimento: "", valor, documento: "" };
}
export function faturadoVazio(): FaturadoEstado {
  return { cliente: null, emissao: todayManausISO(), notaFiscal: "", responsavelId: "", boletos: [novoBoleto()] };
}

export function formatCnpj(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function validarFaturado(f: FaturadoEstado, valorFinal: number, dataVenda: string): string | null {
  if (!f.cliente) return "Selecione ou cadastre a empresa (CNPJ).";
  if (f.boletos.length === 0) return "Informe ao menos um boleto.";
  for (const b of f.boletos) {
    if (!b.vencimento) return "Informe o vencimento de todos os boletos.";
    if (b.vencimento < dataVenda) return "O vencimento não pode ser anterior à data da venda.";
    if ((b.valor ?? 0) <= 0) return "Todo boleto deve ter valor maior que zero.";
  }
  const soma = round2(f.boletos.reduce((a, b) => a + (b.valor ?? 0), 0));
  if (soma !== round2(valorFinal)) {
    return `A soma dos boletos (${formatCurrencyBRL(soma)}) precisa ser igual ao valor faturado (${formatCurrencyBRL(valorFinal)}).`;
  }
  return null;
}

interface RpcRes {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
  [k: string]: unknown;
}

/* ------------------------------------------------------------------ */
/* Seção do formulário: Faturado / Boleto a receber                    */
/* ------------------------------------------------------------------ */

export function FaturadoSection({
  valor,
  onChange,
  valorFinal,
}: {
  valor: FaturadoEstado;
  onChange: (patch: Partial<FaturadoEstado>) => void;
  valorFinal: number;
}) {
  const [busca, setBusca] = useState("");
  const [novoOpen, setNovoOpen] = useState(false);

  const clientesQuery = useQuery({
    queryKey: ["clientes-cnpj"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clientes_cnpj")
        .select("id, razao_social, nome_fantasia, cnpj, telefone, email_financeiro, contato")
        .eq("ativo", true)
        .order("razao_social")
        .limit(1000);
      if (error) throw error;
      return data as ClienteCnpj[];
    },
  });
  const usuariosQuery = useQuery({
    queryKey: ["usuarios-basicos"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; full_name: string }[];
    },
  });

  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, "");
    if (!q) return [];
    return (clientesQuery.data ?? [])
      .filter(
        (c) =>
          c.razao_social.toLowerCase().includes(q) ||
          (c.nome_fantasia ?? "").toLowerCase().includes(q) ||
          (qd.length >= 3 && c.cnpj.includes(qd)),
      )
      .slice(0, 6);
  }, [busca, clientesQuery.data]);

  const soma = round2(valor.boletos.reduce((a, b) => a + (b.valor ?? 0), 0));
  const dif = round2(valorFinal - soma);

  const updateBoleto = (key: number, patch: Partial<BoletoRow>) =>
    onChange({ boletos: valor.boletos.map((b) => (b.key === key ? { ...b, ...patch } : b)) });

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-border bg-secondary/30 p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">
        O valor entra no faturamento na data da venda, mas <strong>não</strong> entra no dinheiro do caixa. A
        entrada financeira acontece só ao confirmar o recebimento do boleto.
      </p>

      {/* Empresa */}
      <div>
        <label className={labelClass}>Empresa (CNPJ) *</label>
        {valor.cliente ? (
          <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <div>
              <p className="font-medium text-foreground">{valor.cliente.razao_social}</p>
              <p className="text-xs text-muted-foreground">
                CNPJ {formatCnpj(valor.cliente.cnpj)}
                {valor.cliente.nome_fantasia ? ` · ${valor.cliente.nome_fantasia}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ cliente: null })}
              className="text-xs font-medium text-muted-foreground underline"
            >
              Trocar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por razão social, fantasia ou CNPJ"
                className={cn(inputClass, "pl-9")}
              />
            </div>
            {resultados.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border bg-card">
                {resultados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ cliente: c });
                        setBusca("");
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-secondary"
                    >
                      <span className="font-medium text-foreground">{c.razao_social}</span>
                      <span className="block text-xs text-muted-foreground">CNPJ {formatCnpj(c.cnpj)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setNovoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Cadastrar empresa
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass}>Data de emissão</label>
          <input
            type="date"
            value={valor.emissao}
            onChange={(e) => onChange({ emissao: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>
            Nota Fiscal <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            value={valor.notaFiscal}
            onChange={(e) => onChange({ notaFiscal: e.target.value })}
            placeholder="Nº da NF"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Responsável pelo acompanhamento</label>
          <Select
            value={valor.responsavelId || "__eu__"}
            onValueChange={(v) => onChange({ responsavelId: v === "__eu__" ? "" : v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__eu__">Eu (quem está lançando)</SelectItem>
              {(usuariosQuery.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Boletos */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Boletos</h3>
          <button
            type="button"
            onClick={() => onChange({ boletos: [...valor.boletos, novoBoleto(dif > 0 ? dif : null)] })}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar boleto
          </button>
        </div>
        {valor.boletos.map((b, i) => (
          <div key={b.key} className="grid grid-cols-2 gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-12">
            <div className="col-span-1 sm:col-span-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Vencimento *</label>
              <input
                type="date"
                aria-label={`Vencimento do boleto ${i + 1}`}
                value={b.vencimento}
                onChange={(e) => updateBoleto(b.key, { vencimento: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="col-span-1 sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Valor *</label>
              <MoneyInput value={b.valor} onChange={(v) => updateBoleto(b.key, { valor: v })} />
            </div>
            <div className="col-span-2 flex items-end gap-2 sm:col-span-5">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Nº do boleto</label>
                <input
                  value={b.documento}
                  onChange={(e) => updateBoleto(b.key, { documento: e.target.value })}
                  placeholder="Opcional"
                  className={inputClass}
                />
              </div>
              {valor.boletos.length > 1 && (
                <button
                  type="button"
                  aria-label="Remover boleto"
                  onClick={() => onChange({ boletos: valor.boletos.filter((x) => x.key !== b.key) })}
                  className="mb-0.5 rounded-md border border-border p-2 text-muted-foreground hover:bg-secondary"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
        <p className={cn("text-xs", dif === 0 ? "text-primary" : "text-destructive")}>
          Soma dos boletos {formatCurrencyBRL(soma)} de {formatCurrencyBRL(valorFinal)}
          {dif !== 0 ? ` · diferença ${formatCurrencyBRL(dif)}` : " · confere"}
        </p>
      </div>

      <NovaEmpresaDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onSaved={(c) => onChange({ cliente: c })}
      />
    </div>
  );
}

function NovaEmpresaDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: (c: ClienteCnpj) => void;
}) {
  const qc = useQueryClient();
  const [f, setF] = useState({ razao: "", fantasia: "", cnpj: "", tel: "", email: "", contato: "", obs: "" });
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("clientes_cnpj_salvar", {
        p_razao_social: f.razao,
        p_cnpj: f.cnpj,
        p_nome_fantasia: f.fantasia,
        p_telefone: f.tel,
        p_email: f.email,
        p_contato: f.contato,
        p_observacao: f.obs,
      });
      if (error) return void toast.error("Não foi possível salvar a empresa.");
      const r = data as unknown as RpcRes;
      if (!r.ok) return void toast.error(r.message ?? "Empresa não salva.");
      toast.success(r["existente"] ? "CNPJ já cadastrado — cadastro reaproveitado." : "Empresa cadastrada.");
      await qc.invalidateQueries({ queryKey: ["clientes-cnpj"] });
      const { data: c } = await supabase
        .from("clientes_cnpj")
        .select("id, razao_social, nome_fantasia, cnpj, telefone, email_financeiro, contato")
        .eq("id", r.id as string)
        .single();
      if (c) onSaved(c as ClienteCnpj);
      setF({ razao: "", fantasia: "", cnpj: "", tel: "", email: "", contato: "", obs: "" });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const campo = (k: keyof typeof f, label: string, extra?: { placeholder?: string; mask?: boolean }) => (
    <div>
      <label className={labelClass}>{label}</label>
      <input
        value={f[k]}
        placeholder={extra?.placeholder}
        onChange={(e) => setF((p) => ({ ...p, [k]: extra?.mask ? formatCnpj(e.target.value) : e.target.value }))}
        className={inputClass}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar empresa</DialogTitle>
          <DialogDescription>Se o CNPJ já existir, o cadastro atual é reaproveitado.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">{campo("razao", "Razão Social *")}</div>
          {campo("cnpj", "CNPJ *", { placeholder: "00.000.000/0000-00", mask: true })}
          {campo("fantasia", "Nome Fantasia")}
          {campo("tel", "Telefone / WhatsApp")}
          {campo("email", "E-mail financeiro")}
          {campo("contato", "Contato responsável")}
          {campo("obs", "Observações")}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void salvar()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar empresa
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Painel de boletos                                                   */
/* ------------------------------------------------------------------ */

export type BoletoStatus =
  | "a_receber"
  | "vence_hoje"
  | "vencido"
  | "parcial"
  | "recebido"
  | "cancelado"
  | "renegociado";

export interface BoletoItem {
  id: string;
  cliente: string;
  cnpj: string | null;
  nome_fantasia: string | null;
  os: string | null;
  descricao: string;
  valor_original: number;
  recebido: number;
  saldo: number;
  data_emissao: string;
  data_faturamento: string | null;
  vencimento: string;
  dias: number;
  status: BoletoStatus;
  documento: string | null;
  nota_fiscal: string | null;
  grupo_receita: GrupoReceita | null;
  responsavel: string | null;
  responsavel_id: string;
  parcela_atual: number | null;
  parcela_total: number | null;
  ultimo_recebimento: string | null;
}

export interface BoletosPainel {
  ok: boolean;
  hoje: string;
  itens: BoletoItem[];
  totais: {
    a_receber: number;
    vence_hoje: number;
    vence_7: number;
    vencido: number;
    qtd_vencidos: number;
    recebido_mes: number;
  };
}

export const STATUS_BOLETO: Record<BoletoStatus, { label: string; className: string }> = {
  a_receber: { label: "A receber", className: "bg-secondary text-foreground" },
  vence_hoje: { label: "Vence hoje", className: "bg-accent text-accent-foreground" },
  vencido: { label: "Vencido", className: "bg-destructive/10 text-destructive" },
  parcial: { label: "Recebido parcialmente", className: "bg-primary/10 text-primary" },
  recebido: { label: "Recebido", className: "bg-primary/15 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  renegociado: { label: "Renegociado", className: "bg-accent text-accent-foreground" },
};

export function useBoletosPainel(enabled = true) {
  return useQuery({
    queryKey: ["caixa", "boletos"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("cr_boletos_painel");
      if (error) throw error;
      return data as unknown as BoletosPainel;
    },
  });
}

function diasTexto(b: BoletoItem) {
  if (b.status === "recebido" || b.status === "cancelado") return "—";
  if (b.dias === 0) return "Vence hoje";
  if (b.dias < 0) return `${-b.dias} dia${b.dias === -1 ? "" : "s"} em atraso`;
  return `Vence em ${b.dias} dia${b.dias === 1 ? "" : "s"}`;
}

/** Alertas: 5, 3, 1 dia antes, no dia e após o vencimento (derivado — nunca duplica). */
export function alertasDe(itens: BoletoItem[]) {
  return itens.filter(
    (b) =>
      (b.status !== "recebido" && b.status !== "cancelado") &&
      (b.dias < 0 || [0, 1, 3, 5].includes(b.dias)),
  );
}

type FiltroStatus = "abertos" | "vence_hoje" | "vencido" | "recebido" | "todos";

export function BoletosSection() {
  const { can } = useAccess();
  const qc = useQueryClient();
  const painel = useBoletosPainel();
  const [status, setStatus] = useState<FiltroStatus>("abertos");
  const [grupo, setGrupo] = useState<GrupoReceita | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [responsavel, setResponsavel] = useState("todos");
  const [receber, setReceber] = useState<BoletoItem | null>(null);
  const [vencer, setVencer] = useState<BoletoItem | null>(null);
  const [cancelar, setCancelar] = useState<BoletoItem | null>(null);

  const podeReceber = can("financeiro", "receber");
  const podeVencimento = can("financeiro", "editar") || can("caixa", "administrar");
  const podeCancelar = can("financeiro", "cancelar");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["caixa"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-indicadores"] });
  };

  const itens = painel.data?.itens ?? [];
  const responsaveis = useMemo(
    () => Array.from(new Map(itens.map((i) => [i.responsavel_id, i.responsavel ?? "—"])).entries()),
    [itens],
  );
  const filtrados = itens.filter((b) => {
    if (status === "abertos" && (b.status === "recebido" || b.status === "cancelado")) return false;
    if (status === "vence_hoje" && b.status !== "vence_hoje") return false;
    if (status === "vencido" && b.status !== "vencido") return false;
    if (status === "recebido" && b.status !== "recebido") return false;
    if (grupo !== "todos" && b.grupo_receita !== grupo) return false;
    if (responsavel !== "todos" && b.responsavel_id !== responsavel) return false;
    const q = busca.trim().toLowerCase();
    if (q && !`${b.cliente} ${b.nome_fantasia ?? ""} ${b.cnpj ?? ""} ${b.os ?? ""}`.toLowerCase().includes(q))
      return false;
    return true;
  });
  const alertas = alertasDe(itens);
  const t = painel.data?.totais;

  if (painel.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregando boletos…
      </div>
    );
  }
  if (painel.data && !painel.data.ok) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Você não tem permissão para ver os boletos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { l: "A receber", v: t?.a_receber ?? 0 },
          { l: "Vence hoje", v: t?.vence_hoje ?? 0 },
          { l: "Vencem em 7 dias", v: t?.vence_7 ?? 0 },
          { l: "Vencidos", v: t?.vencido ?? 0, danger: true },
          { l: "Recebidos no mês", v: t?.recebido_mes ?? 0 },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.l}</p>
            <p
              className={cn(
                "mt-1 font-display text-lg font-bold",
                c.danger && c.v > 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {formatCurrencyBRL(c.v)}
            </p>
          </div>
        ))}
      </div>

      {alertas.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-accent/40 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <BellRing className="h-4 w-4 text-primary" /> Alertas de vencimento
          </p>
          <ul className="space-y-1.5">
            {alertas.slice(0, 8).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  <strong>{b.cliente}</strong>
                  {b.os ? ` · OS ${b.os}` : ""} · {formatCurrencyBRL(b.saldo)} ·{" "}
                  <span className={b.dias < 0 ? "text-destructive" : "text-muted-foreground"}>{diasTexto(b)}</span>
                </span>
                {podeReceber && (
                  <button
                    type="button"
                    onClick={() => setReceber(b)}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                  >
                    Confirmar recebimento
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              ["abertos", "A receber"],
              ["vence_hoje", "Vence hoje"],
              ["vencido", "Vencidos"],
              ["recebido", "Recebidos"],
              ["todos", "Todos"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setStatus(k)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium",
                status === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <Select value={grupo} onValueChange={(v) => setGrupo(v as GrupoReceita | "todos")}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as receitas</SelectItem>
            {(Object.keys(GRUPO_RECEITA_LABEL) as GrupoReceita[]).map((g) => (
              <SelectItem key={g} value={g}>
                {GRUPO_RECEITA_LABEL[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={responsavel} onValueChange={setResponsavel}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os responsáveis</SelectItem>
            {responsaveis.map(([id, nome]) => (
              <SelectItem key={id} value={id}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Empresa, CNPJ ou OS"
          className={cn(inputClass, "lg:max-w-xs")}
        />
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          Nenhum boleto neste filtro.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((b) => {
            const aberto = b.status !== "recebido" && b.status !== "cancelado";
            return (
              <div key={b.id} className="flex flex-col rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{b.cliente}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.cnpj ? `CNPJ ${formatCnpj(b.cnpj)}` : "Sem CNPJ"}
                      {b.os ? ` · OS ${b.os}` : ""}
                      {b.parcela_total && b.parcela_total > 1 ? ` · ${b.parcela_atual}/${b.parcela_total}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_BOLETO[b.status].className)}>
                    {STATUS_BOLETO[b.status].label}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted-foreground">Valor</dt>
                  <dd className="text-right font-semibold text-foreground">{formatCurrencyBRL(b.valor_original)}</dd>
                  {b.recebido > 0 && (
                    <>
                      <dt className="text-muted-foreground">Recebido / saldo</dt>
                      <dd className="text-right text-foreground">
                        {formatCurrencyBRL(b.recebido)} / {formatCurrencyBRL(b.saldo)}
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">Categoria</dt>
                  <dd className="text-right text-foreground">
                    {b.grupo_receita ? GRUPO_RECEITA_LABEL[b.grupo_receita] : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Faturado em</dt>
                  <dd className="text-right text-foreground">
                    {formatDateOnlyISO(b.data_faturamento ?? b.data_emissao)}
                  </dd>
                  <dt className="text-muted-foreground">Vencimento</dt>
                  <dd className="text-right text-foreground">{formatDateOnlyISO(b.vencimento)}</dd>
                  <dt className="text-muted-foreground">Prazo</dt>
                  <dd className={cn("text-right", b.dias < 0 && aberto ? "font-medium text-destructive" : "text-foreground")}>
                    {diasTexto(b)}
                  </dd>
                  <dt className="text-muted-foreground">Responsável</dt>
                  <dd className="truncate text-right text-foreground">{b.responsavel ?? "—"}</dd>
                  {b.documento && (
                    <>
                      <dt className="text-muted-foreground">Nº boleto</dt>
                      <dd className="text-right text-foreground">{b.documento}</dd>
                    </>
                  )}
                  {b.nota_fiscal && (
                    <>
                      <dt className="text-muted-foreground">NF</dt>
                      <dd className="text-right text-foreground">{b.nota_fiscal}</dd>
                    </>
                  )}
                </dl>
                {aberto && (podeReceber || podeVencimento || podeCancelar) && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                    {podeReceber && (
                      <button
                        type="button"
                        onClick={() => setReceber(b)}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover"
                      >
                        Confirmar recebimento
                      </button>
                    )}
                    {podeVencimento && (
                      <button
                        type="button"
                        onClick={() => setVencer(b)}
                        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary"
                      >
                        <CalendarClock className="h-3.5 w-3.5" /> Vencimento
                      </button>
                    )}
                    {podeCancelar && b.recebido === 0 && (
                      <button
                        type="button"
                        onClick={() => setCancelar(b)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/5"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmarRecebimentoDialog boleto={receber} onClose={() => setReceber(null)} onDone={refresh} />
      <AlterarVencimentoDialog boleto={vencer} onClose={() => setVencer(null)} onDone={refresh} />
      <CancelarBoletoDialog boleto={cancelar} onClose={() => setCancelar(null)} onDone={refresh} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diálogos                                                            */
/* ------------------------------------------------------------------ */

function ConfirmarRecebimentoDialog({
  boleto,
  onClose,
  onDone,
}: {
  boleto: BoletoItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [data, setData] = useState(todayManausISO());
  const [valor, setValor] = useState<number | null>(null);
  const [forma, setForma] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);

  if (boleto && boleto.id !== lastId) {
    setLastId(boleto.id);
    setValor(boleto.saldo);
    setData(todayManausISO());
    setForma("");
    setObs("");
  }

  const formasQuery = useQuery({
    queryKey: ["formas-liquidacao"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("formas_pagamento")
        .select("id, nome")
        .eq("ativo", true)
        .eq("liquidacao_imediata", true)
        .order("ordem");
      if (error) throw error;
      return data as { id: string; nome: string }[];
    },
  });

  async function salvar() {
    if (!boleto) return;
    if (!forma) return void toast.error("Selecione a forma efetiva de recebimento.");
    if (!valor || valor <= 0) return void toast.error("Informe o valor recebido.");
    setSaving(true);
    try {
      const { data: res, error } = await supabase.rpc("contas_receber_receber", {
        p_conta_id: boleto.id,
        p_data_recebimento: data,
        p_valor: valor,
        p_forma_pagamento_id: forma,
        ...(obs.trim() ? { p_observacao: obs.trim() } : {}),
      });
      if (error) return void toast.error("Não foi possível confirmar o recebimento.");
      const r = res as unknown as RpcRes;
      if (!r.ok) return void toast.error(r.message ?? "Recebimento não registrado.");
      toast.success(
        Number(r["saldo"] ?? 0) > 0
          ? `Recebimento parcial registrado. Saldo: ${formatCurrencyBRL(Number(r["saldo"]))}.`
          : "Boleto recebido. Entrada lançada no caixa do dia.",
      );
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!boleto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar recebimento</DialogTitle>
          <DialogDescription>
            {boleto?.cliente}
            {boleto?.os ? ` · OS ${boleto.os}` : ""} — saldo {formatCurrencyBRL(boleto?.saldo ?? 0)}. A entrada vai
            para o caixa na data do recebimento, sem somar de novo no faturamento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Data do recebimento *</label>
            <input type="date" value={data} max={todayManausISO()} onChange={(e) => setData(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Valor recebido *</label>
            <MoneyInput value={valor} onChange={setValor} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Forma efetiva *</label>
            <Select value={forma} onValueChange={setForma}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent>
                {(formasQuery.data ?? []).map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Observação</label>
            <input value={obs} onChange={(e) => setObs(e.target.value)} className={inputClass} />
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
            Voltar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void salvar()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AlterarVencimentoDialog({
  boleto,
  onClose,
  onDone,
}: {
  boleto: BoletoItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [venc, setVenc] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!boleto) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("cr_alterar_vencimento", {
        p_conta_id: boleto.id,
        p_vencimento: venc,
        p_motivo: motivo,
      });
      if (error) return void toast.error("Não foi possível alterar o vencimento.");
      const r = data as unknown as RpcRes;
      if (!r.ok) return void toast.error(r.message ?? "Vencimento não alterado.");
      toast.success("Vencimento alterado. Histórico registrado.");
      setVenc("");
      setMotivo("");
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!boleto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar vencimento</DialogTitle>
          <DialogDescription>
            Vencimento atual: {boleto ? formatDateOnlyISO(boleto.vencimento) : ""}. O anterior fica guardado no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Novo vencimento *</label>
            <input type="date" value={venc} onChange={(e) => setVenc(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Motivo *</label>
            <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={cn(inputClass, "resize-none")} />
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
            Voltar
          </button>
          <button
            type="button"
            disabled={saving || !venc || !motivo.trim()}
            onClick={() => void salvar()}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelarBoletoDialog({
  boleto,
  onClose,
  onDone,
}: {
  boleto: BoletoItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  async function salvar() {
    if (!boleto) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("contas_receber_cancelar", { p_id: boleto.id, p_motivo: motivo });
      if (error) return void toast.error("Não foi possível cancelar o boleto.");
      const r = data as unknown as RpcRes;
      if (!r.ok) return void toast.error(r.message ?? "Boleto não cancelado.");
      toast.success("Boleto cancelado.");
      setMotivo("");
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!boleto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" /> Cancelar boleto
          </DialogTitle>
          <DialogDescription>
            O boleto não é apagado: fica como cancelado, com motivo e responsável registrados.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label className={labelClass}>Motivo *</label>
          <textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={cn(inputClass, "resize-none")} />
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
            Voltar
          </button>
          <button
            type="button"
            disabled={saving || !motivo.trim()}
            onClick={() => void salvar()}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar boleto
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Card do Dashboard                                                   */
/* ------------------------------------------------------------------ */

export function ContasReceberCard() {
  const painel = useBoletosPainel();
  const t = painel.data?.ok ? painel.data.totais : null;
  if (!t) return null;
  const alertas = alertasDe(painel.data?.itens ?? []).length;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Contas a Receber
        </h2>
        {alertas > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-primary">
            <BellRing className="h-3 w-3" /> {alertas} alerta{alertas > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{formatCurrencyBRL(t.a_receber)}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Próximos 7 dias</dt>
          <dd className="font-medium text-foreground">{formatCurrencyBRL(t.vence_7)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vencido</dt>
          <dd className={cn("font-medium", t.vencido > 0 ? "text-destructive" : "text-foreground")}>
            {formatCurrencyBRL(t.vencido)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
