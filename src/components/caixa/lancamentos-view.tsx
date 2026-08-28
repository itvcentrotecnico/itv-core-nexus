/**
 * Visualização dos lançamentos do Caixa Diário em LISTA ou BLOCOS,
 * com filtros compartilhados, busca, paginação e resumo financeiro do período.
 * Nenhuma regra financeira é alterada aqui — apenas leitura e agregação.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Wallet,
  XCircle,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LANCAMENTO, round2, inputClass, type CaixaLancamento } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateTimeITV } from "@/lib/format";

export type CaixaEntregaResumo = {
  id: string;
  tipo: "entrega" | "entrega_avaliacao";
  valor: number;
  status: string;
  entregador?: { nome: string; nome_exibicao: string | null } | null;
};

export type LancamentoComEntrega = CaixaLancamento & {
  entregas?: CaixaEntregaResumo[] | null;
};

export type ViewMode = "lista" | "blocos";
const VIEW_KEY = "itv:caixa:view-mode";
const PAGE_SIZE = 25;

export interface CaixaFiltros {
  busca: string;
  tipoReceita: string;
  tecnico: string;
  responsavel: string;
  forma: string;
  status: string;
  entrega: string;
  os: string;
  cliente: string;
}

export const FILTROS_INICIAIS: CaixaFiltros = {
  busca: "",
  tipoReceita: "",
  tecnico: "",
  responsavel: "",
  forma: "",
  status: "",
  entrega: "todos",
  os: "",
  cliente: "",
};

function nomeEntregador(e: CaixaEntregaResumo): string {
  return e.entregador?.nome_exibicao || e.entregador?.nome || "Entregador";
}

function entregasAtivas(l: LancamentoComEntrega): CaixaEntregaResumo[] {
  return (l.entregas ?? []).filter((e) => e.status !== "cancelada");
}

function pagamentosResumo(l: CaixaLancamento): string {
  return (l.pagamentos ?? [])
    .map((p) => {
      const parc = p.parcelas > 1 ? ` ${p.parcelas}x` : "";
      return `${p.forma?.nome ?? "?"}${parc} ${formatCurrencyBRL(p.valor)}`;
    })
    .join(" · ");
}

export function StatusBadge({
  status,
  duplicidade,
}: {
  status: CaixaLancamento["status"];
  duplicidade: boolean;
}) {
  const s = STATUS_LANCAMENTO[status];
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.className)}>
        {s.label}
      </span>
      {duplicidade && (
        <span
          title="OS com mais de um lançamento (registrado com confirmação)"
          className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          OS duplicada
        </span>
      )}
    </span>
  );
}

interface Props {
  lancamentos: LancamentoComEntrega[];
  loading: boolean;
  diaBloqueado: boolean;
  podeEditar: boolean;
  podeCancelar: boolean;
  podeEstornar: boolean;
  periodo: { inicio: string; fim: string };
  onPeriodoChange: (p: { inicio: string; fim: string }) => void;
  onEdit: (l: CaixaLancamento) => void;
  onCancel: (l: CaixaLancamento) => void;
  onEstornar: (l: CaixaLancamento) => void;
}

export function LancamentosView({
  lancamentos,
  loading,
  diaBloqueado,
  podeEditar,
  podeCancelar,
  podeEstornar,
  periodo,
  onPeriodoChange,
  onEdit,
  onCancel,
  onEstornar,
}: Props) {
  const [view, setView] = useState<ViewMode>("lista");
  const [filtros, setFiltros] = useState<CaixaFiltros>(FILTROS_INICIAIS);
  const [ordem, setOrdem] = useState<"recentes" | "antigos" | "maior" | "menor">("recentes");
  const [page, setPage] = useState(1);
  const [maisFiltros, setMaisFiltros] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "lista" || saved === "blocos") setView(saved);
    else if (window.matchMedia("(max-width: 767px)").matches) setView("blocos");
  }, []);

  const setViewMode = (v: ViewMode) => {
    setView(v);
    if (typeof window !== "undefined") window.localStorage.setItem(VIEW_KEY, v);
  };

  const set = <K extends keyof CaixaFiltros>(k: K, v: CaixaFiltros[K]) => {
    setFiltros((f) => ({ ...f, [k]: v }));
    setPage(1);
  };

  /* Opções derivadas dos dados carregados */
  const opcoes = useMemo(() => {
    const tipos = new Set<string>();
    const tecnicos = new Set<string>();
    const responsaveis = new Set<string>();
    const formas = new Set<string>();
    for (const l of lancamentos) {
      if (l.tipo?.nome) tipos.add(l.tipo.nome);
      if (l.tecnico?.full_name) tecnicos.add(l.tecnico.full_name);
      if (l.responsavel?.full_name) responsaveis.add(l.responsavel.full_name);
      for (const p of l.pagamentos ?? []) if (p.forma?.nome) formas.add(p.forma.nome);
    }
    const sorted = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      tipos: sorted(tipos),
      tecnicos: sorted(tecnicos),
      responsaveis: sorted(responsaveis),
      formas: sorted(formas),
    };
  }, [lancamentos]);

  /* Filtragem — os dois modos usam exatamente os mesmos filtros */
  const filtrados = useMemo(() => {
    const busca = filtros.busca.trim().toLowerCase();
    const os = filtros.os.trim().toLowerCase();
    const cliente = filtros.cliente.trim().toLowerCase();
    const lista = lancamentos.filter((l) => {
      if (busca) {
        const alvo = `${l.os ?? ""} ${l.cliente ?? ""} ${l.descricao ?? ""}`.toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      if (os && !(l.os ?? "").toLowerCase().includes(os)) return false;
      if (cliente && !(l.cliente ?? "").toLowerCase().includes(cliente)) return false;
      if (filtros.tipoReceita && l.tipo?.nome !== filtros.tipoReceita) return false;
      if (filtros.tecnico && l.tecnico?.full_name !== filtros.tecnico) return false;
      if (filtros.responsavel && l.responsavel?.full_name !== filtros.responsavel) return false;
      if (filtros.status && l.status !== filtros.status) return false;
      if (filtros.forma && !(l.pagamentos ?? []).some((p) => p.forma?.nome === filtros.forma))
        return false;
      const ents = entregasAtivas(l);
      switch (filtros.entrega) {
        case "com":
          if (ents.length === 0) return false;
          break;
        case "sem":
          if (ents.length > 0) return false;
          break;
        case "entrega":
          if (!ents.some((e) => e.tipo === "entrega")) return false;
          break;
        case "entrega_avaliacao":
          if (!ents.some((e) => e.tipo === "entrega_avaliacao")) return false;
          break;
        default:
          break;
      }
      return true;
    });

    const cmp: Record<typeof ordem, (a: LancamentoComEntrega, b: LancamentoComEntrega) => number> = {
      recentes: (a, b) => b.created_at.localeCompare(a.created_at),
      antigos: (a, b) => a.created_at.localeCompare(b.created_at),
      maior: (a, b) => b.valor_final - a.valor_final,
      menor: (a, b) => a.valor_final - b.valor_final,
    };
    return [...lista].sort(cmp[ordem]);
  }, [lancamentos, filtros, ordem]);

  /* Resumo financeiro — sobre TODOS os registros filtrados, não só a página */
  const resumo = useMemo(() => {
    const ativos = filtrados.filter((l) => l.status === "ativo");
    const bruto = round2(ativos.reduce((a, l) => a + l.valor_bruto, 0));
    const descontos = round2(ativos.reduce((a, l) => a + l.desconto, 0));
    const entradas = round2(ativos.reduce((a, l) => a + l.valor_final, 0));
    const taxas = round2(ativos.reduce((a, l) => a + l.taxas_total, 0));
    const liquida = round2(ativos.reduce((a, l) => a + l.receita_liquida, 0));
    const cancelados = filtrados.filter((l) => l.status === "cancelado");
    const estornados = filtrados.filter((l) => l.status === "estornado");

    const formas = new Map<string, number>();
    // Detalhamento por parcelas dentro de cada forma (ex.: Crédito 1x..6x).
    const formasDet = new Map<string, Map<number, number>>();
    for (const l of ativos) {
      for (const p of l.pagamentos ?? []) {
        const nome = p.forma?.nome ?? "Outros";
        // Pagamento misto: cada forma recebe apenas a sua parcela do valor.
        const filtroForma = filtros.forma;
        if (filtroForma && nome !== filtroForma) continue;
        formas.set(nome, round2((formas.get(nome) ?? 0) + p.valor));
        const det = formasDet.get(nome) ?? new Map<number, number>();
        const parc = Math.max(1, Number(p.parcelas ?? 1));
        det.set(parc, round2((det.get(parc) ?? 0) + p.valor));
        formasDet.set(nome, det);
      }
    }
    const totalFormas = round2([...formas.values()].reduce((a, v) => a + v, 0));

    const ents = ativos.flatMap((l) => entregasAtivas(l));
    return {
      bruto,
      descontos,
      entradas,
      taxas,
      liquida,
      quantidade: ativos.length,
      ticket: ativos.length > 0 ? round2(entradas / ativos.length) : 0,
      canceladosQtd: cancelados.length,
      canceladosValor: round2(cancelados.reduce((a, l) => a + l.valor_final, 0)),
      estornadosQtd: estornados.length,
      estornadosValor: round2(estornados.reduce((a, l) => a + l.valor_final, 0)),
      formas: [...formas.entries()]
        .map(([forma, total]) => ({
          forma,
          total,
          percentual: totalFormas > 0 ? round2((total / totalFormas) * 100) : 0,
          parcelas: [...(formasDet.get(forma) ?? new Map<number, number>()).entries()]
            .map(([parc, valor]) => ({ parcelas: parc, valor }))
            .sort((a, b) => a.parcelas - b.parcelas),
        }))
        .sort((a, b) => b.total - a.total),
      entregaQtd: ents.length,
      entregaValor: round2(ents.reduce((a, e) => a + Number(e.valor ?? 0), 0)),
    };
  }, [filtrados, filtros.forma]);

  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const visiveis = filtrados.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const acoes = (l: CaixaLancamento) => {
    const ativo = l.status === "ativo";
    const temAcao = ativo && !diaBloqueado && (podeEditar || podeCancelar || podeEstornar);
    if (!temAcao) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Ações do lançamento"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {podeEditar && (
            <DropdownMenuItem onClick={() => onEdit(l)}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Editar
            </DropdownMenuItem>
          )}
          {podeEstornar && (
            <DropdownMenuItem onClick={() => onEstornar(l)}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Estornar
            </DropdownMenuItem>
          )}
          {podeCancelar && (
            <DropdownMenuItem
              onClick={() => onCancel(l)}
              className="text-destructive focus:text-destructive"
            >
              <XCircle className="mr-2 h-4 w-4" aria-hidden="true" />
              Cancelar
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="space-y-4">
      {/* Resumo financeiro — sempre no topo, respeita os filtros ativos */}
      <div className="rounded-xl border border-border bg-card p-4 lg:sticky lg:top-2 lg:z-20 lg:shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Resumo das entradas</p>
            <p className="font-display text-2xl font-bold text-foreground sm:text-3xl">
              {formatCurrencyBRL(resumo.entradas)}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>
              Lançamentos <strong className="text-foreground">{resumo.quantidade}</strong>
            </span>
            <span>
              Ticket médio{" "}
              <strong className="text-foreground">{formatCurrencyBRL(resumo.ticket)}</strong>
            </span>
            <span>
              Bruto <strong className="text-foreground">{formatCurrencyBRL(resumo.bruto)}</strong>
            </span>
            <span>
              Descontos{" "}
              <strong className="text-foreground">{formatCurrencyBRL(resumo.descontos)}</strong>
            </span>
            <span>
              Taxas <strong className="text-foreground">{formatCurrencyBRL(resumo.taxas)}</strong>
            </span>
            <span>
              Receita líquida{" "}
              <strong className="text-primary">{formatCurrencyBRL(resumo.liquida)}</strong>
            </span>
          </div>
        </div>

        {/* Somatória por forma de pagamento */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {resumo.formas.length === 0 ? (
            <p className="col-span-full text-xs text-muted-foreground">Sem entradas no filtro atual.</p>
          ) : (
            resumo.formas.map((f) => (
              <div key={f.forma} className="rounded-lg border border-border bg-background px-3 py-2">
                <p className="truncate text-[11px] font-medium text-muted-foreground">{f.forma}</p>
                <p className="font-display text-sm font-bold text-foreground">
                  {formatCurrencyBRL(f.total)}
                </p>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span>
            Comissões de entrega geradas{" "}
            <strong className="text-foreground">{resumo.entregaQtd}</strong> ·{" "}
            <strong className="text-foreground">{formatCurrencyBRL(resumo.entregaValor)}</strong>{" "}
            <span className="opacity-70">(indicador — não reduz o faturamento)</span>
          </span>
          <span>
            Cancelados no período <strong className="text-foreground">{resumo.canceladosQtd}</strong> ·{" "}
            {formatCurrencyBRL(resumo.canceladosValor)}
          </span>
          <span>
            Estornados no período <strong className="text-foreground">{resumo.estornadosQtd}</strong> ·{" "}
            {formatCurrencyBRL(resumo.estornadosValor)}
          </span>
        </div>
      </div>

      {/* Barra de busca, visualização e filtros */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Buscar OS, cliente ou descrição"
              placeholder="Buscar OS, cliente ou descrição"
              value={filtros.busca}
              onChange={(e) => set("busca", e.target.value)}
              className={cn(inputClass, "pl-9")}
            />
          </div>

          <div
            role="group"
            aria-label="Visualização"
            className="flex items-center gap-1 rounded-md border border-border bg-background p-1"
          >
            <button
              type="button"
              aria-pressed={view === "lista"}
              onClick={() => setViewMode("lista")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === "lista"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Lista
            </button>
            <button
              type="button"
              aria-pressed={view === "blocos"}
              onClick={() => setViewMode("blocos")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
                view === "blocos"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
              Blocos
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMaisFiltros((v) => !v)}
            aria-expanded={maisFiltros}
            className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Filtros
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", maisFiltros && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </div>

        {maisFiltros && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-muted-foreground">
              Período — início
              <input
                type="date"
                value={periodo.inicio}
                onChange={(e) =>
                  e.target.value && onPeriodoChange({ ...periodo, inicio: e.target.value })
                }
                className={cn(inputClass, "mt-1")}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Período — fim
              <input
                type="date"
                value={periodo.fim}
                onChange={(e) => e.target.value && onPeriodoChange({ ...periodo, fim: e.target.value })}
                className={cn(inputClass, "mt-1")}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              OS
              <input
                type="text"
                value={filtros.os}
                onChange={(e) => set("os", e.target.value)}
                className={cn(inputClass, "mt-1")}
              />
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Cliente
              <input
                type="text"
                value={filtros.cliente}
                onChange={(e) => set("cliente", e.target.value)}
                className={cn(inputClass, "mt-1")}
              />
            </label>
            <SelectFiltro
              label="Tipo de receita"
              value={filtros.tipoReceita}
              onChange={(v) => set("tipoReceita", v)}
              options={opcoes.tipos}
            />
            <SelectFiltro
              label="Técnico"
              value={filtros.tecnico}
              onChange={(v) => set("tecnico", v)}
              options={opcoes.tecnicos}
            />
            <SelectFiltro
              label="Responsável"
              value={filtros.responsavel}
              onChange={(v) => set("responsavel", v)}
              options={opcoes.responsaveis}
            />
            <SelectFiltro
              label="Forma de pagamento"
              value={filtros.forma}
              onChange={(v) => set("forma", v)}
              options={opcoes.formas}
            />
            <label className="text-xs font-medium text-muted-foreground">
              Status
              <select
                value={filtros.status}
                onChange={(e) => set("status", e.target.value)}
                className={cn(inputClass, "mt-1")}
              >
                <option value="">Todos</option>
                <option value="ativo">Ativo</option>
                <option value="cancelado">Cancelado</option>
                <option value="estornado">Estornado</option>
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Comissão de entrega
              <select
                value={filtros.entrega}
                onChange={(e) => set("entrega", e.target.value)}
                className={cn(inputClass, "mt-1")}
              >
                <option value="todos">Todos</option>
                <option value="com">Com comissão</option>
                <option value="sem">Sem comissão</option>
                <option value="entrega">Entrega simples</option>
                <option value="entrega_avaliacao">Entrega + avaliação</option>
              </select>
            </label>
            <label className="text-xs font-medium text-muted-foreground">
              Ordenação
              <select
                value={ordem}
                onChange={(e) => setOrdem(e.target.value as typeof ordem)}
                className={cn(inputClass, "mt-1")}
              >
                <option value="recentes">Mais recentes</option>
                <option value="antigos">Mais antigos</option>
                <option value="maior">Maior valor</option>
                <option value="menor">Menor valor</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setFiltros(FILTROS_INICIAIS);
                  setOrdem("recentes");
                  setPage(1);
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
              >
                Limpar filtros
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Carregando lançamentos…
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
          <Wallet className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-foreground">Nenhum lançamento encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajuste o período, a busca ou os filtros aplicados.
          </p>
        </div>
      ) : view === "lista" ? (
        <ListaView lancamentos={visiveis} acoes={acoes} />
      ) : (
        <BlocosView lancamentos={visiveis} acoes={acoes} />
      )}

      {/* Paginação */}
      {filtrados.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Mostrando {(pageSafe - 1) * PAGE_SIZE + 1}–
            {Math.min(pageSafe * PAGE_SIZE, filtrados.length)} de {filtrados.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pageSafe <= 1}
              onClick={() => setPage(pageSafe - 1)}
              className="rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage(pageSafe + 1)}
              className="rounded-md border border-border bg-card px-3 py-1.5 font-medium text-foreground disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectFiltro({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputClass, "mt-1")}
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

type AcoesRender = (l: CaixaLancamento) => React.ReactNode;

function ListaView({
  lancamentos,
  acoes,
}: {
  lancamentos: LancamentoComEntrega[];
  acoes: AcoesRender;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[1180px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-3">Data/Hora</th>
            <th className="px-3 py-3">OS</th>
            <th className="px-3 py-3">Cliente</th>
            <th className="px-3 py-3">Tipo</th>
            <th className="px-3 py-3">Descrição</th>
            <th className="px-3 py-3">Técnico</th>
            <th className="px-3 py-3 text-right">Bruto</th>
            <th className="px-3 py-3 text-right">Desc.</th>
            <th className="px-3 py-3 text-right">Final</th>
            <th className="px-3 py-3">Pagamento</th>
            <th className="px-3 py-3 text-right">Taxas</th>
            <th className="px-3 py-3 text-right">Líquida</th>
            <th className="px-3 py-3">Entrega</th>
            <th className="px-3 py-3">Responsável</th>
            <th className="px-3 py-3">Status</th>
            <th className="px-3 py-3" aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {lancamentos.map((l) => {
            const ents = entregasAtivas(l);
            return (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                  {formatDateTimeITV(l.created_at)}
                </td>
                <td className="px-3 py-3 font-medium text-foreground">{l.os ?? "—"}</td>
                <td className="max-w-40 truncate px-3 py-3 text-foreground">{l.cliente ?? "—"}</td>
                <td className="px-3 py-3 text-muted-foreground">{l.tipo?.nome ?? "—"}</td>
                <td className="max-w-48 truncate px-3 py-3 text-xs text-muted-foreground">
                  {l.descricao ?? "—"}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{l.tecnico?.full_name ?? "—"}</td>
                <td className="px-3 py-3 text-right text-muted-foreground">
                  {formatCurrencyBRL(l.valor_bruto)}
                </td>
                <td className="px-3 py-3 text-right text-muted-foreground">
                  {formatCurrencyBRL(l.desconto)}
                </td>
                <td
                  className={cn(
                    "px-3 py-3 text-right font-semibold",
                    l.status === "ativo" ? "text-foreground" : "text-muted-foreground line-through",
                  )}
                >
                  {formatCurrencyBRL(l.valor_final)}
                </td>
                <td className="max-w-52 px-3 py-3 text-xs text-muted-foreground">
                  {pagamentosResumo(l) || "—"}
                </td>
                <td className="px-3 py-3 text-right text-muted-foreground">
                  {formatCurrencyBRL(l.taxas_total)}
                </td>
                <td className="px-3 py-3 text-right text-foreground">
                  {formatCurrencyBRL(l.receita_liquida)}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {ents.length === 0
                    ? "—"
                    : ents
                        .map((e) => `${nomeEntregador(e)} ${formatCurrencyBRL(Number(e.valor ?? 0))}`)
                        .join(" · ")}
                </td>
                <td className="px-3 py-3 text-muted-foreground">{l.responsavel?.full_name ?? "—"}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={l.status} duplicidade={l.alerta_duplicidade} />
                  {l.motivo_cancelamento && (
                    <p className="mt-0.5 max-w-40 text-[11px] text-destructive">
                      {l.motivo_cancelamento}
                    </p>
                  )}
                </td>
                <td className="px-3 py-3 text-right">{acoes(l)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BlocosView({
  lancamentos,
  acoes,
}: {
  lancamentos: LancamentoComEntrega[];
  acoes: AcoesRender;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {lancamentos.map((l) => (
        <BlocoCard key={l.id} lancamento={l} acoes={acoes} />
      ))}
    </ul>
  );
}

function BlocoCard({
  lancamento: l,
  acoes,
}: {
  lancamento: LancamentoComEntrega;
  acoes: AcoesRender;
}) {
  const [aberto, setAberto] = useState(false);
  const ents = entregasAtivas(l);
  return (
    <li className="flex flex-col rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-foreground">
            {l.os ? `OS ${l.os}` : "Sem OS"}
          </p>
          <p className="truncate text-sm text-muted-foreground">{l.cliente ?? "—"}</p>
        </div>
        {acoes(l)}
      </div>

      <p
        className={cn(
          "mt-3 font-display text-xl font-bold",
          l.status === "ativo" ? "text-foreground" : "text-muted-foreground line-through",
        )}
      >
        {formatCurrencyBRL(l.valor_final)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{pagamentosResumo(l) || "Sem pagamento"}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={l.status} duplicidade={l.alerta_duplicidade} />
        {ents.length > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
            Entrega: {ents.map((e) => nomeEntregador(e)).join(", ")} —{" "}
            {formatCurrencyBRL(ents.reduce((a, e) => a + Number(e.valor ?? 0), 0))}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-primary hover:underline"
      >
        {aberto ? "Ocultar detalhes" : "Ver detalhes"}
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {aberto && (
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs">
          <Detalhe termo="Data/Hora" valor={formatDateTimeITV(l.created_at)} />
          <Detalhe termo="Tipo de receita" valor={l.tipo?.nome ?? "—"} />
          <Detalhe termo="Técnico" valor={l.tecnico?.full_name ?? "—"} />
          <Detalhe termo="Responsável" valor={l.responsavel?.full_name ?? "—"} />
          <Detalhe termo="Valor bruto" valor={formatCurrencyBRL(l.valor_bruto)} />
          <Detalhe termo="Desconto" valor={formatCurrencyBRL(l.desconto)} />
          <Detalhe termo="Taxas" valor={formatCurrencyBRL(l.taxas_total)} />
          <Detalhe termo="Receita líquida" valor={formatCurrencyBRL(l.receita_liquida)} />
          {l.descricao && <Detalhe termo="Descrição" valor={l.descricao} />}
          {l.motivo_cancelamento && <Detalhe termo="Motivo" valor={l.motivo_cancelamento} />}
        </dl>
      )}
    </li>
  );
}

function Detalhe({ termo, valor }: { termo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{termo}</dt>
      <dd className="truncate font-medium text-foreground">{valor}</dd>
    </div>
  );
}
