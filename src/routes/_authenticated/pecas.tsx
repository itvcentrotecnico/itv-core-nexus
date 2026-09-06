import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Layers,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Scissors,
  TrendingDown,
  Wrench,
  XCircle,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { CustoForm } from "@/components/custos/custo-form";
import {
  CancelarCustoDialog,
  ConfirmarCustoDialog,
  DevolverCustoDialog,
} from "@/components/custos/custo-actions";
import { inputClass, round2 } from "@/lib/caixa";
import { STATUS_CUSTO, type CustoOS, type CustosIndicadores, type CustosPorOs } from "@/lib/custos";
import { cn } from "@/lib/utils";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pecas")({
  head: () => ({
    meta: [
      { title: "Peças e Custos — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content: "Custos diretos das Ordens de Serviço e margem parcial da operação.",
      },
      { property: "og:title", content: "Peças e Custos — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Custos diretos das Ordens de Serviço e margem parcial da operação.",
      },
    ],
  }),
  component: PecasPage,
});

const NONE = "__none__";

function firstDayOfMonthISO(): string {
  return `${todayManausISO().slice(0, 8)}01`;
}

function PecasPage() {
  const { can } = useAccess();
  const podeCriar = can("pecas", "criar");
  const podeEditar = can("pecas", "editar");
  const podeConfirmar = can("pecas", "aprovar");
  const podeCancelar = can("pecas", "cancelar");
  const podeEstornar = can("pecas", "estornar");

  const [from, setFrom] = useState(firstDayOfMonthISO());
  const [to, setTo] = useState(todayManausISO());
  const [busca, setBusca] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState(NONE);
  const [filtroFornecedor, setFiltroFornecedor] = useState(NONE);
  const [filtroTipo, setFiltroTipo] = useState(NONE);
  const [filtroCategoria, setFiltroCategoria] = useState(NONE);
  const [filtroStatus, setFiltroStatus] = useState(NONE);
  const [aba, setAba] = useState<"lista" | "por-os">("lista");

  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<CustoOS | null>(null);
  const [confirmando, setConfirmando] = useState<CustoOS | null>(null);
  const [cancelando, setCancelando] = useState<CustoOS | null>(null);
  const [devolvendo, setDevolvendo] = useState<CustoOS | null>(null);

  const periodoValido = !!from && !!to && from <= to;

  const listQuery = useQuery({
    queryKey: ["custos-list", from, to],
    enabled: periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("custos_os")
        .select(
          "*, tipo:tipos_custo(nome, eh_peca), categoria:categorias_pecas(nome), fornecedor:fornecedores(nome), tecnico:profiles!custos_os_tecnico_id_fkey(full_name), responsavel:profiles!custos_os_created_by_fkey(full_name)",
        )
        .gte("data_lancamento", from)
        .lte("data_lancamento", to)
        .order("data_lancamento", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const custos = (data ?? []) as unknown as CustoOS[];

      // Cliente vem do Caixa (fonte oficial) — uma única consulta para todas as OS do período
      const osList = [...new Set(custos.map((c) => c.os))];
      const clientePorOs = new Map<string, string>();
      if (osList.length > 0) {
        try {
          const { data: lancs } = await supabase
            .from("caixa_lancamentos")
            .select("os, cliente")
            .in("os", osList)
            .eq("status", "ativo");
          for (const l of lancs ?? []) {
            if (l.os && l.cliente && !clientePorOs.has(l.os)) clientePorOs.set(l.os, l.cliente);
          }
        } catch {
          // Sem permissão de visualização do Caixa: segue sem o nome do cliente
        }
      }
      return { custos, clientePorOs };
    },
  });

  const indicadoresQuery = useQuery({
    queryKey: ["custos-indicadores", from, to],
    enabled: periodoValido,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("custos_indicadores", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as CustosIndicadores;
    },
  });

  const porOsQuery = useQuery({
    queryKey: ["custos-por-os", from, to],
    enabled: periodoValido && aba === "por-os",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("custos_por_os", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as CustosPorOs;
    },
  });

  const custos = listQuery.data?.custos ?? [];
  const clientePorOs = listQuery.data?.clientePorOs ?? new Map<string, string>();
  const ind = indicadoresQuery.data;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return custos.filter((c) => {
      if (filtroTecnico !== NONE && c.tecnico_id !== filtroTecnico) return false;
      if (filtroFornecedor !== NONE && c.fornecedor_id !== filtroFornecedor) return false;
      if (filtroTipo !== NONE && c.tipo_custo_id !== filtroTipo) return false;
      if (filtroCategoria !== NONE && c.categoria_id !== filtroCategoria) return false;
      if (filtroStatus !== NONE && c.status !== filtroStatus) return false;
      if (q) {
        const alvo = [
          c.os,
          clientePorOs.get(c.os) ?? "",
          c.descricao,
          c.fornecedor?.nome ?? "",
          c.marca ?? "",
          c.modelo ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(q)) return false;
      }
      return true;
    });
  }, [
    custos,
    busca,
    filtroTecnico,
    filtroFornecedor,
    filtroTipo,
    filtroCategoria,
    filtroStatus,
    clientePorOs,
  ]);

  // Opções de filtro derivadas dos dados carregados
  const opcoes = useMemo(() => {
    const tecnicos = new Map<string, string>();
    const fornecedores = new Map<string, string>();
    const tipos = new Map<string, string>();
    const categorias = new Map<string, string>();
    for (const c of custos) {
      if (c.tecnico_id && c.tecnico?.full_name) tecnicos.set(c.tecnico_id, c.tecnico.full_name);
      if (c.fornecedor_id && c.fornecedor?.nome)
        fornecedores.set(c.fornecedor_id, c.fornecedor.nome);
      if (c.tipo?.nome) tipos.set(c.tipo_custo_id, c.tipo.nome);
      if (c.categoria_id && c.categoria?.nome) categorias.set(c.categoria_id, c.categoria.nome);
    }
    return { tecnicos, fornecedores, tipos, categorias };
  }, [custos]);

  function recarregar() {
    void listQuery.refetch();
    void indicadoresQuery.refetch();
    if (aba === "por-os") void porOsQuery.refetch();
  }

  const kpis = [
    {
      label: "Custo Total do Período",
      value: ind?.ok ? formatCurrencyBRL(ind.custo_total) : "R$ 0,00",
      icon: TrendingDown,
    },
    {
      label: "Custo de Peças",
      value: ind?.ok ? formatCurrencyBRL(ind.custo_pecas) : "R$ 0,00",
      icon: Package,
    },
    {
      label: "Outros Custos Diretos",
      value: ind?.ok ? formatCurrencyBRL(ind.outros_custos) : "R$ 0,00",
      icon: Wrench,
    },
    {
      label: "OS com Custos",
      value: ind?.ok ? String(ind.os_com_custos) : "0",
      icon: ClipboardList,
    },
    {
      label: "Custo Médio por OS",
      value: ind?.ok ? formatCurrencyBRL(ind.custo_medio) : "R$ 0,00",
      icon: Layers,
    },
    {
      label: "Custo / Receita Líquida",
      value:
        ind?.ok && ind.custo_sobre_receita_pct != null
          ? `${ind.custo_sobre_receita_pct.toLocaleString("pt-BR")}%`
          : "—",
      icon: Scissors,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Peças e Custos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Custos diretos das Ordens de Serviço</p>
        </div>
        {podeCriar && (
          <button
            type="button"
            onClick={() => {
              setEditando(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Registrar Custo
          </button>
        )}
      </div>

      {/* Período */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <div>
          <label
            htmlFor="custos-from"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            De
          </label>
          <input
            id="custos-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="custos-to"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Até
          </label>
          <input
            id="custos-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <k.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </div>
            <p className="mt-2 font-display text-lg font-bold text-card-foreground sm:text-xl">
              {k.value}
            </p>
          </div>
        ))}
      </div>

      {/* Busca e filtros */}
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="sm:col-span-3 lg:col-span-2">
          <label
            htmlFor="custos-busca"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Busca
          </label>
          <input
            id="custos-busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="OS, cliente, descrição, peça ou fornecedor"
            className={inputClass}
          />
        </div>
        {(
          [
            ["Técnico", filtroTecnico, setFiltroTecnico, opcoes.tecnicos],
            ["Fornecedor", filtroFornecedor, setFiltroFornecedor, opcoes.fornecedores],
            ["Tipo", filtroTipo, setFiltroTipo, opcoes.tipos],
            ["Categoria", filtroCategoria, setFiltroCategoria, opcoes.categorias],
          ] as const
        ).map(([label, value, setter, map]) => (
          <div key={label}>
            <label
              htmlFor={`filtro-${label}`}
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              {label}
            </label>
            <select
              id={`filtro-${label}`}
              value={value}
              onChange={(e) => setter(e.target.value)}
              className={inputClass}
            >
              <option value={NONE}>Todos</option>
              {[...map.entries()].map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div>
          <label
            htmlFor="filtro-status"
            className="mb-1 block text-xs font-medium text-muted-foreground"
          >
            Status
          </label>
          <select
            id="filtro-status"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className={inputClass}
          >
            <option value={NONE}>Todos</option>
            {Object.entries(STATUS_CUSTO).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Abas */}
      <div
        role="tablist"
        aria-label="Visualização"
        className="flex gap-1 rounded-lg border border-border bg-card p-1"
      >
        {(
          [
            ["lista", "Lançamentos"],
            ["por-os", "Custos por OS"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={aba === key}
            onClick={() => setAba(key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              aba === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "lista" ? (
        <>
          {/* Desktop: tabela */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">OS</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Técnico</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">Fornecedor</th>
                  <th className="px-4 py-3 text-right font-medium">Qtd</th>
                  <th className="px-4 py-3 text-right font-medium">Custo Unit.</th>
                  <th className="px-4 py-3 text-right font-medium">Custo Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Responsável</th>
                  <th className="px-4 py-3 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {formatDateOnlyISO(c.data_lancamento)}
                    </td>
                    <td className="px-4 py-3 font-medium">{c.os}</td>
                    <td className="px-4 py-3">{clientePorOs.get(c.os) ?? "—"}</td>
                    <td className="px-4 py-3">{c.tecnico?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{c.tipo?.nome ?? "—"}</td>
                    <td className="max-w-56 px-4 py-3">
                      <p className="truncate" title={c.descricao}>
                        {c.descricao}
                      </p>
                      {c.categoria?.nome && (
                        <p className="text-xs text-muted-foreground">{c.categoria.nome}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">{c.fornecedor?.nome ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{c.quantidade.toLocaleString("pt-BR")}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatCurrencyBRL(c.custo_unitario)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <p className="font-medium">{formatCurrencyBRL(c.custo_total)}</p>
                      {c.devolvido_total > 0 && (
                        <p className="text-xs text-muted-foreground">
                          líquido: {formatCurrencyBRL(round2(c.custo_total - c.devolvido_total))}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_CUSTO[c.status].className,
                        )}
                      >
                        {STATUS_CUSTO[c.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">{c.responsavel?.full_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {podeConfirmar && c.status === "registrado" && (
                          <button
                            type="button"
                            title="Confirmar"
                            aria-label="Confirmar custo"
                            onClick={() => setConfirmando(c)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {podeEditar && (c.status === "registrado" || c.status === "confirmado") && (
                          <button
                            type="button"
                            title="Editar"
                            aria-label="Editar custo"
                            onClick={() => {
                              setEditando(c);
                              setFormOpen(true);
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                        {podeEstornar &&
                          (c.status === "registrado" || c.status === "confirmado") && (
                            <button
                              type="button"
                              title="Devolução / Estorno"
                              aria-label="Devolução ou estorno"
                              onClick={() => setDevolvendo(c)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <RotateCcw className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        {podeCancelar && c.status !== "cancelado" && c.status !== "estornado" && (
                          <button
                            type="button"
                            title="Cancelar"
                            aria-label="Cancelar custo"
                            onClick={() => setCancelando(c)}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={13}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      {listQuery.isLoading
                        ? "Carregando…"
                        : "Nenhum custo no período com os filtros atuais."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards */}
          <div className="space-y-3 md:hidden">
            {filtrados.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      OS {c.os} · {c.tipo?.nome}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDateOnlyISO(c.data_lancamento)}
                      {clientePorOs.get(c.os) ? ` · ${clientePorOs.get(c.os)}` : ""}
                      {c.tecnico?.full_name ? ` · ${c.tecnico.full_name}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_CUSTO[c.status].className,
                    )}
                  >
                    {STATUS_CUSTO[c.status].label}
                  </span>
                </div>
                <p className="mt-2 text-sm text-foreground">{c.descricao}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.fornecedor?.nome ? `${c.fornecedor.nome} · ` : ""}
                  {c.quantidade.toLocaleString("pt-BR")} × {formatCurrencyBRL(c.custo_unitario)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="font-display text-base font-bold text-card-foreground">
                    {formatCurrencyBRL(c.custo_total)}
                    {c.devolvido_total > 0 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        líquido {formatCurrencyBRL(round2(c.custo_total - c.devolvido_total))}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1">
                    {podeConfirmar && c.status === "registrado" && (
                      <button
                        type="button"
                        aria-label="Confirmar custo"
                        onClick={() => setConfirmando(c)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {podeEditar && (c.status === "registrado" || c.status === "confirmado") && (
                      <button
                        type="button"
                        aria-label="Editar custo"
                        onClick={() => {
                          setEditando(c);
                          setFormOpen(true);
                        }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {podeEstornar && (c.status === "registrado" || c.status === "confirmado") && (
                      <button
                        type="button"
                        aria-label="Devolução ou estorno"
                        onClick={() => setDevolvendo(c)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {podeCancelar && c.status !== "cancelado" && c.status !== "estornado" && (
                      <button
                        type="button"
                        aria-label="Cancelar custo"
                        onClick={() => setCancelando(c)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filtrados.length === 0 && (
              <p className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
                {listQuery.isLoading
                  ? "Carregando…"
                  : "Nenhum custo no período com os filtros atuais."}
              </p>
            )}
          </div>
        </>
      ) : (
        <PorOsView data={porOsQuery.data} loading={porOsQuery.isLoading} />
      )}

      <CustoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editando}
        onSaved={recarregar}
      />
      <ConfirmarCustoDialog
        custo={confirmando}
        onClose={() => setConfirmando(null)}
        onDone={recarregar}
      />
      <CancelarCustoDialog
        custo={cancelando}
        onClose={() => setCancelando(null)}
        onDone={recarregar}
      />
      <DevolverCustoDialog
        custo={devolvendo}
        onClose={() => setDevolvendo(null)}
        onDone={recarregar}
      />
    </div>
  );
}

/** Agrupamento por OS com margem parcial e alertas configuráveis. */
function PorOsView({ data, loading }: { data: CustosPorOs | undefined; loading: boolean }) {
  if (loading) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
        Carregando…
      </p>
    );
  }
  const grupos = data?.os ?? [];
  if (grupos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
        Nenhuma OS com custos no período.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Margem Parcial = Receita Líquida (Caixa) − Custos Diretos. Indicador parcial: as comissões
        ainda não estão implementadas.
      </p>
      {grupos.map((g) => (
        <div key={g.os} className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-display text-base font-bold text-card-foreground">OS {g.os}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {g.cliente ?? "Cliente não informado"}
                {g.tecnico ? ` · ${g.tecnico}` : ""}
                {g.faturado_em
                  ? ` · faturada em ${formatDateOnlyISO(g.faturado_em)}`
                  : " · ainda não faturada no Caixa"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {g.alerta_custo_elevado && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Atenção — custo elevado nesta OS
                </span>
              )}
              {g.alerta_margem_baixa && !g.alerta_custo_elevado && (
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Margem parcial abaixo do recomendado
                </span>
              )}
            </div>
          </div>

          <ul className="mt-3 space-y-1.5">
            {g.itens.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">
                  {item.descricao}
                  <span className="ml-2 text-xs text-muted-foreground">{item.tipo}</span>
                </span>
                <span className="shrink-0 font-medium text-foreground">
                  {formatCurrencyBRL(item.valor_liquido)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-3 text-sm sm:grid-cols-3">
            <p className="text-muted-foreground">
              Receita Líquida:{" "}
              <strong className="text-foreground">
                {g.receita_liquida != null ? formatCurrencyBRL(g.receita_liquida) : "—"}
              </strong>
            </p>
            <p className="text-muted-foreground">
              Total de Custos:{" "}
              <strong className="text-foreground">{formatCurrencyBRL(g.custo_total)}</strong>
            </p>
            <p className="text-muted-foreground">
              Margem Parcial:{" "}
              {(g.margem_contribuicao ?? g.margem_parcial) != null ? (
                <strong
                  className={
                    (g.margem_contribuicao ?? g.margem_parcial)! >= 0
                      ? "text-primary"
                      : "text-destructive"
                  }
                >
                  {formatCurrencyBRL((g.margem_contribuicao ?? g.margem_parcial)!)}
                  {g.margem_pct != null && (
                    <span className="ml-1 text-xs font-normal">
                      ({g.margem_pct.toLocaleString("pt-BR")}%)
                    </span>
                  )}
                </strong>
              ) : (
                <strong className="text-foreground">aguardando faturamento</strong>
              )}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
