import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Wallet,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FAIXAS_ATRASO,
  STATUS_CONTA_PAGAR,
  STATUS_CONTA_RECEBER,
  STATUS_DESPESA,
  monthFromDateISO,
  type ContaPagarSaldo,
  type ContaReceberSaldo,
  type Despesa,
  type FinanceiroFluxo,
  type FinanceiroIndicadores,
} from "@/lib/financeiro";
import { rpcFin } from "@/components/financeiro/shared";
import { ContaPagarForm, ContaReceberForm, DespesaForm } from "@/components/financeiro/forms";
import { CancelarFinanceiroDialog, MovimentosContaList, PagarDialog, ReceberDialog } from "@/components/financeiro/movimentos";
import { CategoriasTab } from "@/components/financeiro/categorias-tab";
import { DreTab } from "@/components/financeiro/dre-tab";
import { TributosTab } from "@/components/financeiro/tributos-tab";

export const Route = createFileRoute("/_authenticated/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Despesas, contas a pagar, contas a receber e fluxo de caixa." },
      { property: "og:title", content: "Financeiro — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Despesas, contas a pagar, contas a receber e fluxo de caixa." },
    ],
  }),
  component: FinanceiroPage,
});

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-xl font-bold",
          tone === "good" && "text-primary",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", className)}>{label}</span>
  );
}

const money = (n: number | null | undefined) => formatCurrencyBRL(n ?? 0);

type TabKey = "visao" | "dre" | "despesas" | "pagar" | "receber" | "tributos" | "fluxo" | "categorias";

const TABS: { key: TabKey; label: string }[] = [
  { key: "visao", label: "Visão Geral" },
  { key: "dre", label: "DRE Gerencial" },
  { key: "despesas", label: "Despesas" },
  { key: "pagar", label: "Contas a Pagar" },
  { key: "receber", label: "Contas a Receber" },
  { key: "tributos", label: "Tributos" },
  { key: "fluxo", label: "Fluxo de Caixa" },
  { key: "categorias", label: "Categorias" },
];

function FinanceiroPage() {
  const { can } = useAccess();
  const [tab, setTab] = useState<TabKey>("visao");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Financeiro</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Controle financeiro e compromissos da ITV — acesso restrito e liberado individualmente pelo administrador.
        </p>
      </header>

      <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Seções do Financeiro">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "visao" && <VisaoGeralTab />}
      {tab === "dre" && <DreTab />}
      {tab === "tributos" && <TributosTab />}
      {tab === "despesas" && <DespesasTab can={can} />}
      {tab === "pagar" && <ContasPagarTab can={can} />}
      {tab === "receber" && <ContasReceberTab can={can} />}
      {tab === "fluxo" && <FluxoTab />}
      {tab === "categorias" && <CategoriasTab podeConfigurar={can("financeiro", "configurar")} />}
    </div>
  );
}

/* ============================= VISÃO GERAL ============================= */

function VisaoGeralTab() {
  const [mes, setMes] = useState(monthFromDateISO(todayManausISO()));
  const from = `${mes}-01`;
  const to = useMemo(() => {
    const parts = mes.split("-").map(Number);
    return new Date(Date.UTC(parts[0] ?? 2026, parts[1] ?? 1, 0)).toISOString().slice(0, 10);
  }, [mes]);

  const indQuery = useQuery({
    queryKey: ["financeiro", "indicadores", from, to],
    queryFn: () => rpcFin<FinanceiroIndicadores>("financeiro_indicadores", { p_from: from, p_to: to }),
  });
  const ind = indQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="vg-mes" className={labelClass}>Competência</label>
          <input id="vg-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={inputClass} />
        </div>
      </div>
      {indQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando indicadores…</p>}
      {ind && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard label="Receita Líquida" value={money(ind.receita_liquida)} sub="Caixa no período" />
          <KpiCard label="Margem de Contribuição" value={money(ind.margem_contribuicao)} sub="Receita − Custos − Comissões" tone={ind.margem_contribuicao < 0 ? "bad" : "good"} />
          <KpiCard label="Despesas Operacionais" value={money(ind.despesas_operacionais)} sub="Competência do período" />
          <KpiCard label="Resultado antes da Folha" value={money(ind.resultado_antes_folha)} sub="Margem − Despesas" tone={ind.resultado_antes_folha < 0 ? "bad" : "good"} />
          <KpiCard label="Folha Gerencial" value={money(ind.folha_gerencial)} sub={`Pendente: ${money(ind.folha_pendente)}`} />
          <KpiCard label="Resultado Operacional" value={money(ind.resultado_operacional)} sub="Receita − Custos − Comissões − Despesas − Folha" tone={ind.resultado_operacional < 0 ? "bad" : "good"} />
          <KpiCard label="Margem Operacional" value={`${ind.margem_operacional.toFixed(1)}%`} sub="Resultado ÷ Receita" tone={ind.margem_operacional < 0 ? "bad" : "good"} />
          <KpiCard label="A Pagar (pendente)" value={money(ind.contas_pagar_pendente)} sub={`Vencido: ${money(ind.contas_pagar_vencido)}`} tone={ind.contas_pagar_vencido > 0 ? "bad" : undefined} />
          <KpiCard label="A Receber (pendente)" value={money(ind.contas_receber_pendente)} sub={`Vencido: ${money(ind.contas_receber_vencido)}`} tone={ind.contas_receber_vencido > 0 ? "bad" : undefined} />
          <KpiCard label="Entradas previstas 30d" value={money(ind.entradas_previstas_30d)} />
          <KpiCard label="Saldo Projetado 30d" value={money(ind.saldo_projetado_30d)} sub={`Saídas: ${money(ind.saidas_previstas_30d)}`} tone={ind.saldo_projetado_30d < 0 ? "bad" : "good"} />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Resultado Operacional = Receita − Custos − Comissões − Despesas − Folha Gerencial. Metas entram em etapa futura.
      </p>
    </div>
  );
}

/* ============================= DESPESAS ============================= */

function DespesasTab({ can }: { can: ReturnType<typeof useAccess>["can"] }) {
  const [mes, setMes] = useState(monthFromDateISO(todayManausISO()));
  const [status, setStatus] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Despesa | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Despesa | null>(null);

  const despesasQuery = useQuery({
    queryKey: ["financeiro", "despesas", mes, status],
    queryFn: async () => {
      let q = supabase
        .from("despesas")
        .select(
          "*, categoria:categorias_financeiras(nome), fornecedor:fornecedores(nome), centro:centros_custo(nome), responsavel:profiles!despesas_responsavel_id_fkey(full_name)",
        )
        .gte("competencia", `${mes}-01`)
        .lte("competencia", `${mes}-31`)
        .order("data_lancamento", { ascending: false });
      if (status) q = q.eq("status", status as never);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Despesa[];
    },
  });
  const despesas = despesasQuery.data ?? [];
  const total = despesas.filter((d) => d.status !== "cancelada").reduce((acc, d) => acc + Number(d.valor), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="dp-mes" className={labelClass}>Competência</label>
          <input id="dp-mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="dp-status" className={labelClass}>Status</label>
          <select id="dp-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            <option value="">Todos</option>
            {Object.entries(STATUS_DESPESA).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Total: <strong className="text-foreground">{money(total)}</strong>
          </p>
          {can("financeiro", "criar") && (
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Nova Despesa
            </Button>
          )}
        </div>
      </div>

      {despesasQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!despesasQuery.isLoading && despesas.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Nenhuma despesa no período.
        </p>
      )}
      <ul className="space-y-2">
        {despesas.map((d) => (
          <li key={d.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{d.descricao}</p>
              <Badge {...STATUS_DESPESA[d.status]} />
              {d.recorrente && <Badge label="Recorrente" className="bg-secondary text-secondary-foreground" />}
              <span className="ml-auto font-display font-bold text-foreground">{money(d.valor)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {d.categoria?.nome ?? "Sem categoria"}
              {d.centro?.nome ? ` · ${d.centro.nome}` : ""}
              {d.fornecedor?.nome ? ` · ${d.fornecedor.nome}` : ""}
              {` · Lançada em ${formatDateOnlyISO(d.data_lancamento)}`}
              {d.vencimento ? ` · Vence ${formatDateOnlyISO(d.vencimento)}` : ""}
              {d.responsavel?.full_name ? ` · por ${d.responsavel.full_name}` : ""}
            </p>
            {d.status !== "cancelada" && (can("financeiro", "editar") || can("financeiro", "cancelar")) && (
              <div className="mt-2 flex gap-2">
                {can("financeiro", "editar") && (
                  <Button size="sm" variant="outline" onClick={() => { setEditing(d); setFormOpen(true); }}>
                    <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Editar
                  </Button>
                )}
                {can("financeiro", "cancelar") && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelTarget(d)}>
                    <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Cancelar
                  </Button>
                )}
              </div>
            )}
            {d.status === "cancelada" && d.motivo_cancelamento && (
              <p className="mt-1 text-xs text-muted-foreground">Motivo: {d.motivo_cancelamento}</p>
            )}
          </li>
        ))}
      </ul>

      <DespesaForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      {cancelTarget && (
        <CancelarFinanceiroDialog
          tipo="despesa"
          id={cancelTarget.id}
          titulo={cancelTarget.descricao}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </div>
  );
}

/* ============================= CONTAS A PAGAR ============================= */

function ContasPagarTab({ can }: { can: ReturnType<typeof useAccess>["can"] }) {
  const [filtro, setFiltro] = useState<"abertas" | "vencidas" | "todas" | "canceladas">("abertas");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContaPagarSaldo | null>(null);
  const [pagarTarget, setPagarTarget] = useState<ContaPagarSaldo | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContaPagarSaldo | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  const contasQuery = useQuery({
    queryKey: ["financeiro", "contas-pagar"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_pagar_saldos")
        .select("*")
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return data as unknown as ContaPagarSaldo[];
    },
  });
  const todas = contasQuery.data ?? [];
  const hoje = todayManausISO();

  const abertas = todas.filter((c) => c.status === "pendente" || c.status === "parcialmente_pago");
  const contas = todas.filter((c) => {
    if (filtro === "abertas") return c.status === "pendente" || c.status === "parcialmente_pago";
    if (filtro === "vencidas") return c.vencido && c.saldo > 0;
    if (filtro === "canceladas") return c.status === "cancelado";
    return true;
  });

  const emDias = (n: number) =>
    abertas
      .filter((c) => {
        const diff = Math.floor((Date.parse(c.vencimento) - Date.parse(hoje)) / 86_400_000);
        return diff >= 0 && diff <= n;
      })
      .reduce((acc, c) => acc + Number(c.saldo), 0);
  const vencidas = abertas.filter((c) => c.vencido);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Vencidas" value={money(vencidas.reduce((a, c) => a + Number(c.saldo), 0))} sub={`${vencidas.length} conta(s)`} tone={vencidas.length > 0 ? "bad" : undefined} />
        <KpiCard label="Vencem hoje" value={money(abertas.filter((c) => c.vencimento === hoje).reduce((a, c) => a + Number(c.saldo), 0))} />
        <KpiCard label="Próximos 7 dias" value={money(emDias(7))} />
        <KpiCard label="Próximos 30 dias" value={money(emDias(30))} />
        <KpiCard label="Total pendente" value={money(abertas.reduce((a, c) => a + Number(c.saldo), 0))} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["abertas", "vencidas", "todas", "canceladas"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
              filtro === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {f === "abertas" ? "Abertas" : f === "vencidas" ? "Vencidas" : f === "todas" ? "Todas" : "Canceladas"}
          </button>
        ))}
        {can("financeiro", "criar") && (
          <Button size="sm" className="ml-auto" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Nova Conta a Pagar
          </Button>
        )}
      </div>

      {contasQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!contasQuery.isLoading && contas.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Nenhuma conta encontrada.
        </p>
      )}
      <ul className="space-y-2">
        {contas.map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              className="w-full p-4 text-left"
              onClick={() => setExpandida(expandida === c.id ? null : c.id)}
              aria-expanded={expandida === c.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                {expandida === c.id ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                <ArrowDownCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
                <p className="font-medium text-foreground">{c.descricao}</p>
                {c.parcela_total && (
                  <Badge label={`${c.parcela_atual}/${c.parcela_total}`} className="bg-secondary text-secondary-foreground" />
                )}
                <Badge {...STATUS_CONTA_PAGAR[c.status]} />
                {c.vencido && c.saldo > 0 && (
                  <Badge label={`Vencida há ${c.dias_atraso}d`} className="bg-destructive/10 text-destructive" />
                )}
                <span className="ml-auto font-display font-bold text-foreground">{money(c.saldo)}</span>
              </div>
              <p className="mt-1 pl-6 text-xs text-muted-foreground">
                {c.fornecedor_nome ?? "Sem fornecedor"} · Vence {formatDateOnlyISO(c.vencimento)} · Original {money(c.valor_original)} · Pago {money(c.valor_pago)}
              </p>
            </button>
            {expandida === c.id && (
              <div className="border-t border-border">
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {c.saldo > 0 && can("financeiro", "pagar") && (
                    <Button size="sm" onClick={() => setPagarTarget(c)}>
                      <Wallet className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Registrar Pagamento
                    </Button>
                  )}
                  {c.status !== "cancelado" && can("financeiro", "editar") && (
                    <Button size="sm" variant="outline" onClick={() => { setEditing(c); setFormOpen(true); }}>
                      <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Editar
                    </Button>
                  )}
                  {c.status !== "cancelado" && can("financeiro", "cancelar") && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelTarget(c)}>
                      <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Cancelar
                    </Button>
                  )}
                </div>
                <MovimentosContaList tipo="pagar" contaId={c.id} podeEstornar={can("financeiro", "estornar")} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <ContaPagarForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      {pagarTarget && <PagarDialog conta={pagarTarget} onClose={() => setPagarTarget(null)} />}
      {cancelTarget && (
        <CancelarFinanceiroDialog tipo="pagar" id={cancelTarget.id} titulo={cancelTarget.descricao} onClose={() => setCancelTarget(null)} />
      )}
    </div>
  );
}

/* ============================= CONTAS A RECEBER ============================= */

function ContasReceberTab({ can }: { can: ReturnType<typeof useAccess>["can"] }) {
  const [filtro, setFiltro] = useState<"abertas" | "vencidas" | "todas" | "canceladas">("abertas");
  const [faixa, setFaixa] = useState<string>("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContaReceberSaldo | null>(null);
  const [receberTarget, setReceberTarget] = useState<ContaReceberSaldo | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContaReceberSaldo | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  const contasQuery = useQuery({
    queryKey: ["financeiro", "contas-receber"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contas_receber_saldos")
        .select("*")
        .order("vencimento", { ascending: true });
      if (error) throw error;
      return data as unknown as ContaReceberSaldo[];
    },
  });
  const todas = contasQuery.data ?? [];
  const hoje = todayManausISO();
  const abertas = todas.filter((c) => c.status === "pendente" || c.status === "parcialmente_recebido");
  const vencidas = abertas.filter((c) => c.vencido);

  const contas = todas.filter((c) => {
    if (filtro === "abertas" && !(c.status === "pendente" || c.status === "parcialmente_recebido")) return false;
    if (filtro === "vencidas" && !(c.vencido && c.saldo > 0)) return false;
    if (filtro === "canceladas" && c.status !== "cancelado") return false;
    if (faixa) {
      const f = FAIXAS_ATRASO.find((x) => x.key === faixa);
      if (f && !(c.vencido && f.test(c.dias_atraso) && c.saldo > 0)) return false;
    }
    return true;
  });

  const emDias = (n: number) =>
    abertas
      .filter((c) => {
        const diff = Math.floor((Date.parse(c.vencimento) - Date.parse(hoje)) / 86_400_000);
        return diff >= 0 && diff <= n;
      })
      .reduce((acc, c) => acc + Number(c.saldo), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Vencidas (inadimplência)" value={money(vencidas.reduce((a, c) => a + Number(c.saldo), 0))} sub={`${vencidas.length} conta(s)`} tone={vencidas.length > 0 ? "bad" : undefined} />
        <KpiCard label="Vencem hoje" value={money(abertas.filter((c) => c.vencimento === hoje).reduce((a, c) => a + Number(c.saldo), 0))} />
        <KpiCard label="Próximos 7 dias" value={money(emDias(7))} />
        <KpiCard label="Próximos 30 dias" value={money(emDias(30))} />
        <KpiCard label="Total a receber" value={money(abertas.reduce((a, c) => a + Number(c.saldo), 0))} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["abertas", "vencidas", "todas", "canceladas"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              filtro === f ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80",
            )}
          >
            {f === "abertas" ? "Abertas" : f === "vencidas" ? "Vencidas" : f === "todas" ? "Todas" : "Canceladas"}
          </button>
        ))}
        <select
          aria-label="Faixa de atraso"
          value={faixa}
          onChange={(e) => setFaixa(e.target.value)}
          className={cn(inputClass, "w-auto text-xs")}
        >
          <option value="">Todas as faixas de atraso</option>
          {FAIXAS_ATRASO.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
        {can("financeiro", "criar") && (
          <Button size="sm" className="ml-auto" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Nova Conta a Receber
          </Button>
        )}
      </div>

      {contasQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!contasQuery.isLoading && contas.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center text-sm text-muted-foreground">
          Nenhuma conta encontrada.
        </p>
      )}
      <ul className="space-y-2">
        {contas.map((c) => (
          <li key={c.id} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              className="w-full p-4 text-left"
              onClick={() => setExpandida(expandida === c.id ? null : c.id)}
              aria-expanded={expandida === c.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                {expandida === c.id ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
                <ArrowUpCircle className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="font-medium text-foreground">{c.cliente}</p>
                {c.os && <Badge label={`OS ${c.os}`} className="bg-secondary text-secondary-foreground" />}
                {c.parcela_total && (
                  <Badge label={`${c.parcela_atual}/${c.parcela_total}`} className="bg-secondary text-secondary-foreground" />
                )}
                <Badge {...STATUS_CONTA_RECEBER[c.status]} />
                {c.vencido && c.saldo > 0 && (
                  <Badge label={`Vencida há ${c.dias_atraso}d`} className="bg-destructive/10 text-destructive" />
                )}
                <span className="ml-auto font-display font-bold text-foreground">{money(c.saldo)}</span>
              </div>
              <p className="mt-1 pl-6 text-xs text-muted-foreground">
                {c.descricao} · Vence {formatDateOnlyISO(c.vencimento)} · Original {money(c.valor_original)} · Recebido {money(c.valor_recebido)}
              </p>
            </button>
            {expandida === c.id && (
              <div className="border-t border-border">
                <div className="flex flex-wrap gap-2 px-3 pt-3">
                  {c.saldo > 0 && can("financeiro", "receber") && (
                    <Button size="sm" onClick={() => setReceberTarget(c)}>
                      <Wallet className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Registrar Recebimento
                    </Button>
                  )}
                  {c.status !== "cancelado" && can("financeiro", "editar") && (
                    <Button size="sm" variant="outline" onClick={() => { setEditing(c); setFormOpen(true); }}>
                      <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Editar
                    </Button>
                  )}
                  {c.status !== "cancelado" && can("financeiro", "cancelar") && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelTarget(c)}>
                      <XCircle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Cancelar
                    </Button>
                  )}
                </div>
                <MovimentosContaList tipo="receber" contaId={c.id} podeEstornar={can("financeiro", "estornar")} />
              </div>
            )}
          </li>
        ))}
      </ul>

      <ContaReceberForm open={formOpen} onClose={() => setFormOpen(false)} editing={editing} />
      {receberTarget && <ReceberDialog conta={receberTarget} onClose={() => setReceberTarget(null)} />}
      {cancelTarget && (
        <CancelarFinanceiroDialog tipo="receber" id={cancelTarget.id} titulo={`${cancelTarget.cliente} — ${cancelTarget.descricao}`} onClose={() => setCancelTarget(null)} />
      )}
    </div>
  );
}

/* ============================= FLUXO DE CAIXA ============================= */

function FluxoTab() {
  const from = todayManausISO();
  const to = useMemo(() => new Date(Date.parse(from) + 29 * 86_400_000).toISOString().slice(0, 10), [from]);

  const fluxoQuery = useQuery({
    queryKey: ["financeiro", "fluxo", from, to],
    queryFn: () => rpcFin<FinanceiroFluxo>("financeiro_fluxo", { p_from: from, p_to: to }),
  });
  const fluxo = fluxoQuery.data;

  const projecao = useMemo(() => {
    if (!fluxo?.dias) return null;
    let saldo = Number(fluxo.saldo_inicial);
    let primeiroNegativo: { data: string; saldo: number } | null = null;
    const pontos = fluxo.dias.map((d) => {
      saldo += Number(d.entradas) - Number(d.saidas);
      if (!primeiroNegativo && saldo < 0) primeiroNegativo = { data: d.data, saldo };
      return { ...d, saldo };
    });
    const ate = (n: number) => {
      const slice = fluxo.dias!.slice(0, n);
      return {
        entradas: slice.reduce((a, d) => a + Number(d.entradas), 0),
        saidas: slice.reduce((a, d) => a + Number(d.saidas), 0),
        saldo: pontos[Math.min(n, pontos.length) - 1]?.saldo ?? saldo,
      };
    };
    return { pontos, primeiroNegativo, d7: ate(7), d15: ate(15), d30: ate(30) };
  }, [fluxo]);

  if (fluxoQuery.isLoading) return <p className="text-sm text-muted-foreground">Carregando fluxo…</p>;
  if (!fluxo || !projecao) return <p className="text-sm text-muted-foreground">Sem dados de projeção.</p>;

  const { pontos, primeiroNegativo, d7, d15, d30 } = projecao;
  const W = 600;
  const H = 160;
  const minVal = Math.min(0, ...pontos.map((p) => p.saldo));
  const maxAbs = Math.max(1, ...pontos.map((p) => Math.abs(p.saldo)));
  const range = maxAbs - minVal || 1;
  const yOf = (v: number) => H - ((v - minVal) / range) * H;
  const line = pontos.map((p, i) => `${(i / Math.max(1, pontos.length - 1)) * W},${yOf(p.saldo)}`).join(" ");

  return (
    <div className="space-y-4">
      {primeiroNegativo && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">
          <strong>Atenção:</strong> projeção de caixa negativa em{" "}
          <strong>{formatDateOnlyISO((primeiroNegativo as { data: string }).data)}</strong> — saldo projetado de{" "}
          <strong className="text-destructive">{money((primeiroNegativo as { saldo: number }).saldo)}</strong>.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Saldo inicial (hoje)" value={money(fluxo.saldo_inicial)} sub="Receita líquida acumulada do Caixa" />
        {[{ l: "7 dias", v: d7 }, { l: "15 dias", v: d15 }, { l: "30 dias", v: d30 }].map(({ l, v }) => (
          <KpiCard
            key={l}
            label={`Saldo em ${l}`}
            value={money(v.saldo)}
            sub={`+${money(v.entradas)} / −${money(v.saidas)}`}
            tone={v.saldo < 0 ? "bad" : "good"}
          />
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-display text-sm font-bold text-foreground">Saldo projetado — próximos 30 dias</h3>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Evolução do saldo projetado">
          <line x1={0} y1={yOf(0)} x2={W} y2={yOf(0)} stroke="var(--destructive)" strokeDasharray="4 3" strokeWidth={1} />
          <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatDateOnlyISO(pontos[0]?.data ?? from)}</span>
          <span>{formatDateOnlyISO(pontos[pontos.length - 1]?.data ?? to)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 text-right font-medium">Entradas</th>
              <th className="px-4 py-2 text-right font-medium">Saídas</th>
              <th className="px-4 py-2 text-right font-medium">Saldo projetado</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p) => (
              <tr key={p.data} className={cn("border-b border-border last:border-0", p.saldo < 0 && "bg-destructive/5")}>
                <td className="px-4 py-1.5">{formatDateOnlyISO(p.data)}</td>
                <td className="px-4 py-1.5 text-right text-primary">{money(p.entradas)}</td>
                <td className="px-4 py-1.5 text-right text-destructive">{money(p.saidas)}</td>
                <td className={cn("px-4 py-1.5 text-right font-semibold", p.saldo < 0 ? "text-destructive" : "text-foreground")}>
                  {money(p.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
