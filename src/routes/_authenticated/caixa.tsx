import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LockOpen, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { LancamentoForm } from "@/components/caixa/lancamento-form";
import {
  CancelarLancamentoDialog,
  EstornarLancamentoDialog,
} from "@/components/caixa/lancamento-actions";
import { FecharCaixaDialog, ReabrirCaixaDialog } from "@/components/caixa/fechamento";
import { LancamentosView, type LancamentoComEntrega } from "@/components/caixa/lancamentos-view";
import { CaixaFisicoSection, useCaixaFisico } from "@/components/caixa/caixa-fisico";
import { ResumoDesempenho } from "@/components/caixa/resumo-desempenho";
import { PeriodoPresets } from "@/components/caixa/periodo-presets";
import { DescontosSection } from "@/components/caixa/descontos";
import { round2, type CaixaFechamento, type CaixaLancamento } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import {
  formatCurrencyBRL,
  formatDateOnlyISO,
  formatDateTimeITV,
  todayManausISO,
} from "@/lib/format";

export const Route = createFileRoute("/_authenticated/caixa")({
  head: () => ({
    meta: [
      { title: "Caixa Diário — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Registro das movimentações diárias de caixa da operação." },
      { property: "og:title", content: "Caixa Diário — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Registro das movimentações diárias de caixa da operação.",
      },
    ],
  }),
  component: CaixaPage,
});

function CaixaPage() {
  const { can, isLoading: accessLoading } = useAccess();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(todayManausISO());
  const [periodo, setPeriodo] = useState({ inicio: todayManausISO(), fim: todayManausISO() });
  const [tab, setTab] = useState<"lancamentos" | "fisico" | "descontos" | "fechamentos">(
    "lancamentos",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CaixaLancamento | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CaixaLancamento | null>(null);
  const [estornoTarget, setEstornoTarget] = useState<CaixaLancamento | null>(null);
  const [fecharOpen, setFecharOpen] = useState(false);
  const [reabrirTarget, setReabrirTarget] = useState<CaixaFechamento | null>(null);

  const mudarData = (d: string) => {
    setDate(d);
    setPeriodo({ inicio: d, fim: d });
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["caixa"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard-indicadores"] });
  };

  const podeVer = can("caixa", "visualizar");
  const podeCriar = can("caixa", "criar");
  const podeEditar = can("caixa", "editar");
  const podeCancelar = can("caixa", "cancelar");
  const podeEstornar = can("caixa", "estornar");
  const podeFechar = can("caixa", "fechar");
  const podeReabrir = can("caixa", "reabrir");
  const podeAdministrar = can("caixa", "administrar");
  const podeVerFinanceiro = podeAdministrar || can("financeiro", "visualizar");

  const lancamentosQuery = useQuery({
    queryKey: ["caixa", "lancamentos", periodo.inicio, periodo.fim],
    enabled: podeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_lancamentos")
        .select(
          "*, tipo:tipos_receita(nome), tecnico:profiles!caixa_lancamentos_tecnico_id_fkey(full_name), responsavel:profiles!caixa_lancamentos_responsavel_id_fkey(full_name), pagamentos:caixa_pagamentos(*, forma:formas_pagamento(nome, eh_dinheiro)), entregas:comissoes_entrega(id, tipo, valor, status, entregador:colaboradores(nome, nome_exibicao))",
        )
        .gte("data_lancamento", periodo.inicio)
        .lte("data_lancamento", periodo.fim)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as unknown as LancamentoComEntrega[];
    },
  });

  const fechamentosQuery = useQuery({
    queryKey: ["caixa", "fechamentos"],
    enabled: podeVer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("caixa_fechamentos")
        .select(
          "*, responsavel:profiles!caixa_fechamentos_responsavel_id_fkey(full_name), reabridor:profiles!caixa_fechamentos_reaberto_por_fkey(full_name)",
        )
        .order("data_referencia", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data as unknown as CaixaFechamento[];
    },
  });

  const lancamentos = useMemo(() => lancamentosQuery.data ?? [], [lancamentosQuery.data]);
  /** Totais do dia selecionado — usados no fechamento (regra financeira inalterada). */
  const ativos = useMemo(
    () => lancamentos.filter((l) => l.status === "ativo" && l.data_lancamento === date),
    [lancamentos, date],
  );

  const fechamentoAtual = useMemo(
    () =>
      (fechamentosQuery.data ?? []).find(
        (f) => f.data_referencia === date && f.status === "fechado",
      ) ?? null,
    [fechamentosQuery.data, date],
  );
  const diaFechado = !!fechamentoAtual;
  const diaBloqueado = diaFechado && !podeAdministrar;

  const totais = useMemo(() => {
    const faturamento = round2(ativos.reduce((acc, l) => acc + l.valor_final, 0));
    const taxas = round2(ativos.reduce((acc, l) => acc + l.taxas_total, 0));
    const liquida = round2(ativos.reduce((acc, l) => acc + l.receita_liquida, 0));
    return { faturamento, taxas, liquida };
  }, [ativos]);

  const dinheiroEsperado = useMemo(
    () =>
      round2(
        ativos.reduce(
          (acc, l) =>
            acc +
            (l.pagamentos ?? []).reduce((a, p) => a + (p.forma?.eh_dinheiro ? p.valor : 0), 0),
          0,
        ),
      ),
    [ativos],
  );

  const fisicoQuery = useCaixaFisico(date, podeVer);

  if (!accessLoading && !podeVer) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-xl font-bold text-foreground">Caixa Diário</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Você não tem permissão para acessar o caixa. Fale com um administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold text-foreground">Caixa Diário</h1>
            {diaFechado ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" aria-hidden="true" />
                Fechado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                Aberto
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Movimentações de {formatDateOnlyISO(date)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Data do caixa"
            value={date}
            onChange={(e) => mudarData(e.target.value || todayManausISO())}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
          {diaFechado && podeReabrir && (
            <button
              type="button"
              onClick={() => setReabrirTarget(fechamentoAtual)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <LockOpen className="h-4 w-4" aria-hidden="true" />
              Reabrir caixa
            </button>
          )}
          {!diaFechado && podeFechar && (
            <button
              type="button"
              onClick={() => setFecharOpen(true)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Fechar caixa
            </button>
          )}
          {podeCriar && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
              disabled={diaBloqueado}
              title={diaBloqueado ? "O caixa desta data já foi fechado." : undefined}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo lançamento
            </button>
          )}
        </div>
      </div>

      {/* Resumo de faturamento — cards fixos (Hoje / Semana / Mês), independentes dos filtros */}
      <ResumoDesempenho dataRef={date} podeVerFinanceiro={podeVerFinanceiro} />

      {/* Banner de fechamento */}
      {diaFechado && fechamentoAtual && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium text-foreground">
            Caixa fechado por {fechamentoAtual.responsavel?.full_name ?? "—"} em{" "}
            {formatDateTimeITV(fechamentoAtual.fechado_em)}
          </p>
          <p className="mt-1 text-muted-foreground">
            Dinheiro esperado {formatCurrencyBRL(fechamentoAtual.dinheiro_esperado)} · informado{" "}
            {formatCurrencyBRL(fechamentoAtual.dinheiro_informado)} · diferença{" "}
            {formatCurrencyBRL(fechamentoAtual.diferenca ?? 0)}
            {fechamentoAtual.observacao ? ` — ${fechamentoAtual.observacao}` : ""}
          </p>
        </div>
      )}

      {/* Abas */}
      <div
        role="tablist"
        aria-label="Seções do caixa"
        className="flex gap-1 rounded-lg border border-border bg-card p-1"
      >
        {(
          [
            { key: "lancamentos", label: "Lançamentos" },
            { key: "fisico", label: "Caixa físico" },
            { key: "descontos", label: "Descontos" },
            { key: "fechamentos", label: "Fechamentos" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-4",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "lancamentos" && (
        <div className="space-y-3">
          <PeriodoPresets periodo={periodo} onChange={setPeriodo} />
          <LancamentosView
            lancamentos={lancamentos}
            loading={lancamentosQuery.isLoading}
            diaBloqueado={diaBloqueado}
            podeEditar={podeEditar}
            podeCancelar={podeCancelar}
            podeEstornar={podeEstornar}
            periodo={periodo}
            onPeriodoChange={setPeriodo}
            onEdit={(l) => {
              setEditing(l);
              setFormOpen(true);
            }}
            onCancel={setCancelTarget}
            onEstornar={setEstornoTarget}
          />
        </div>
      )}

      {tab === "fisico" && (
        <CaixaFisicoSection
          date={date}
          resumo={fisicoQuery.data}
          podeRegistrar={podeCriar}
          diaBloqueado={diaBloqueado}
        />
      )}

      {tab === "descontos" && <DescontosSection periodo={periodo} />}

      {tab === "fechamentos" && (
        <FechamentosSection
          fechamentos={fechamentosQuery.data ?? []}
          loading={fechamentosQuery.isLoading}
          podeReabrir={podeReabrir}
          onReabrir={setReabrirTarget}
        />
      )}

      {/* Diálogos */}
      <LancamentoForm
        open={formOpen}
        onOpenChange={setFormOpen}
        defaultDate={date}
        editing={editing}
        onSaved={refresh}
      />
      <CancelarLancamentoDialog
        lancamento={cancelTarget}
        onOpenChange={(v) => !v && setCancelTarget(null)}
        onDone={refresh}
      />
      <EstornarLancamentoDialog
        lancamento={estornoTarget}
        onOpenChange={(v) => !v && setEstornoTarget(null)}
        onDone={refresh}
      />
      <FecharCaixaDialog
        open={fecharOpen}
        onOpenChange={setFecharOpen}
        date={date}
        dinheiroEsperado={dinheiroEsperado}
        fisico={fisicoQuery.data}
        totais={{ faturamento: totais.faturamento, taxas: totais.taxas, liquida: totais.liquida }}
        onDone={refresh}
      />
      <ReabrirCaixaDialog
        fechamento={reabrirTarget}
        onOpenChange={(v) => !v && setReabrirTarget(null)}
        onDone={refresh}
      />
    </div>
  );
}

export { KpiCard } from "@/components/caixa/kpi-card";

interface FechamentosSectionProps {
  fechamentos: CaixaFechamento[];
  loading: boolean;
  podeReabrir: boolean;
  onReabrir: (f: CaixaFechamento) => void;
}

function FechamentosSection({
  fechamentos,
  loading,
  podeReabrir,
  onReabrir,
}: FechamentosSectionProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregando fechamentos…
      </div>
    );
  }

  if (fechamentos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-10 text-center">
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">Nenhum fechamento registrado</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Os fechamentos diários do caixa aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Data</th>
            <th className="px-4 py-3">Responsável</th>
            <th className="px-4 py-3 text-right">Faturamento</th>
            <th className="px-4 py-3 text-right">Receita líquida</th>
            <th className="px-4 py-3 text-right">Dinheiro (esp./inf.)</th>
            <th className="px-4 py-3 text-right">Diferença</th>
            <th className="px-4 py-3">Status</th>
            {podeReabrir && <th className="px-4 py-3" aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {fechamentos.map((f) => (
            <tr key={f.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
              <td className="px-4 py-3 font-medium text-foreground">
                {formatDateOnlyISO(f.data_referencia)}
                <p className="text-xs font-normal text-muted-foreground">
                  {formatDateTimeITV(f.fechado_em)}
                </p>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {f.responsavel?.full_name ?? "—"}
                {f.status === "reaberto" && f.reabridor && (
                  <p className="text-xs">Reaberto por {f.reabridor.full_name}</p>
                )}
              </td>
              <td className="px-4 py-3 text-right text-foreground">
                {formatCurrencyBRL(f.faturamento_total)}
              </td>
              <td className="px-4 py-3 text-right text-foreground">
                {formatCurrencyBRL(f.receita_liquida)}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {formatCurrencyBRL(f.dinheiro_esperado)} / {formatCurrencyBRL(f.dinheiro_informado)}
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right font-medium",
                  (f.diferenca ?? 0) === 0 ? "text-primary" : "text-destructive",
                )}
              >
                {formatCurrencyBRL(f.diferenca ?? 0)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    f.status === "fechado"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {f.status === "fechado" ? "Fechado" : "Reaberto"}
                </span>
                {f.motivo_reabertura && (
                  <p className="mt-1 max-w-48 text-xs text-muted-foreground">
                    {f.motivo_reabertura}
                  </p>
                )}
              </td>
              {podeReabrir && (
                <td className="px-4 py-3 text-right">
                  {f.status === "fechado" && (
                    <button
                      type="button"
                      onClick={() => onReabrir(f)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                    >
                      <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      Reabrir
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
