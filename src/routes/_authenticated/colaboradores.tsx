import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, History, Plus, UserPen, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiCard } from "./caixa";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { rpcFin } from "@/components/financeiro/shared";
import {
  STATUS_COLABORADOR,
  STATUS_COMPETENCIA,
  STATUS_ITEM_FOLHA,
  competenciaLabel,
  type Colaborador,
  type FolhaCompetencia,
  type FolhaLancamento,
  type FolhaResumo,
  type FolhaRpcResult,
} from "@/lib/folha";
import {
  AlterarSalarioDialog,
  AlterarStatusDialog,
  ColaboradorForm,
  DesligarDialog,
  invalidateFolha,
} from "@/components/folha/colaborador-form";
import { AdiantamentoForm, BeneficiosDialog, HistoricoColaboradorDialog } from "@/components/folha/extras";
import {
  AbrirCompetenciaDialog,
  CancelarLancamentoDialog,
  CompetenciaActions,
  LancamentoForm,
} from "@/components/folha/folha-actions";
import { PagamentosList, PagarDialog, PagarLoteDialog } from "@/components/folha/pagamentos";
import { mensagemErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: () => ({
    meta: [
      { title: "Colaboradores e Folha — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Gestão de colaboradores e folha gerencial da ITV Centro Técnico." },
      { property: "og:title", content: "Colaboradores e Folha — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Gestão de colaboradores e folha gerencial da ITV Centro Técnico." },
    ],
  }),
  component: ColaboradoresPage,
});

function ColaboradoresPage() {
  const { can, isAdmin } = useAccess();
  const podeColaboradores = can("colaboradores", "visualizar");
  const podeFolha = can("folha", "visualizar");

  if (!podeColaboradores && !podeFolha && !isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <Users className="size-10 text-muted-foreground/40" />
        <h1 className="font-display text-xl font-bold text-foreground">Acesso restrito</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Este módulo possui controle individual de privacidade. Solicite a liberação ao administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Colaboradores e Folha Gerencial</h1>
        <p className="text-sm text-muted-foreground">
          Cadastro, salários, benefícios e folha mensal gerencial. Folha gerencial interna — não substitui a folha contábil oficial.
        </p>
      </header>

      <Tabs defaultValue={podeColaboradores || isAdmin ? "colaboradores" : "folha"}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          {(podeColaboradores || isAdmin) && <TabsTrigger value="colaboradores" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Colaboradores</TabsTrigger>}
          {(podeFolha || isAdmin) && (
            <>
              <TabsTrigger value="folha" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Folha Mensal</TabsTrigger>
              <TabsTrigger value="lancamentos" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Lançamentos</TabsTrigger>
              <TabsTrigger value="resumo" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Resumo da Folha</TabsTrigger>
              <TabsTrigger value="historico" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Histórico</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="colaboradores" className="mt-6"><ColaboradoresTab /></TabsContent>
        <TabsContent value="folha" className="mt-6"><FolhaTab /></TabsContent>
        <TabsContent value="lancamentos" className="mt-6"><LancamentosTab /></TabsContent>
        <TabsContent value="resumo" className="mt-6"><ResumoTab /></TabsContent>
        <TabsContent value="historico" className="mt-6"><HistoricoTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ============================= HOOKS COMPARTILHADOS ============================= */

function useCompetencias(enabled: boolean) {
  return useQuery({
    queryKey: ["folha", "competencias"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folha_competencias")
        .select("*")
        .order("competencia", { ascending: false });
      if (error) throw error;
      return data as unknown as FolhaCompetencia[];
    },
  });
}

function useColaboradores(enabled: boolean) {
  return useQuery({
    queryKey: ["colaboradores", "lista"],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("colaboradores_view").select("*").order("nome");
      if (error) throw error;
      return data as unknown as Colaborador[];
    },
  });
}

function CompetenciaSelect({
  competencias,
  value,
  onChange,
}: {
  competencias: FolhaCompetencia[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label htmlFor="comp-sel" className={labelClass}>Competência</label>
      <select id="comp-sel" value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputClass, "sm:w-56")}>
        <option value="">Selecione…</option>
        {competencias.map((c) => (
          <option key={c.id} value={c.id}>
            {competenciaLabel(c.competencia)} — {STATUS_COMPETENCIA[c.status].label}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ============================= TAB: COLABORADORES ============================= */

function ColaboradoresTab() {
  const { can, isAdmin } = useAccess();
  const podeCriar = can("colaboradores", "criar");
  const podeEditar = can("colaboradores", "editar");
  const podeDesativar = can("colaboradores", "desativar");

  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("ativos");
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<Colaborador | null>(null);
  const [salarioDe, setSalarioDe] = useState<Colaborador | null>(null);
  const [statusDe, setStatusDe] = useState<Colaborador | null>(null);
  const [desligarDe, setDesligarDe] = useState<Colaborador | null>(null);
  const [beneficiosDe, setBeneficiosDe] = useState<Colaborador | null>(null);
  const [adiantamentoDe, setAdiantamentoDe] = useState<Colaborador | null>(null);
  const [historicoDe, setHistoricoDe] = useState<Colaborador | null>(null);

  const colabQuery = useColaboradores(true);
  const colaboradores = colabQuery.data ?? [];

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return colaboradores.filter((c) => {
      if (statusFiltro === "ativos" && c.status === "desligado") return false;
      if (statusFiltro !== "ativos" && statusFiltro !== "todos" && c.status !== statusFiltro) return false;
      if (!q) return true;
      return (
        c.nome.toLowerCase().includes(q) ||
        (c.nome_exibicao ?? "").toLowerCase().includes(q) ||
        (c.cargo_nome ?? "").toLowerCase().includes(q) ||
        (c.setor_nome ?? "").toLowerCase().includes(q)
      );
    });
  }, [colaboradores, busca, statusFiltro]);

  const ativos = colaboradores.filter((c) => c.status !== "desligado").length;
  const folhaMensal = colaboradores
    .filter((c) => c.status !== "desligado")
    .reduce((acc, c) => acc + (c.salario_atual ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Colaboradores Ativos" value={String(ativos)} />
        <KpiCard label="Folha Base Mensal" value={formatCurrencyBRL(folhaMensal)} />
        <KpiCard label="Em Férias/Afastados" value={String(colaboradores.filter((c) => c.status === "ferias" || c.status === "afastado").length)} />
        <KpiCard label="Desligados (histórico)" value={String(colaboradores.filter((c) => c.status === "desligado").length)} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="cb-busca" className={labelClass}>Buscar</label>
          <input
            id="cb-busca"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, cargo ou setor…"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="cb-status" className={labelClass}>Status</label>
          <select id="cb-status" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className={inputClass}>
            <option value="ativos">Ativos</option>
            <option value="todos">Todos</option>
            <option value="ferias">Férias</option>
            <option value="afastado">Afastado</option>
            <option value="desligado">Desligado</option>
          </select>
        </div>
        {(podeCriar || isAdmin) && (
          <Button onClick={() => { setEditando(null); setFormOpen(true); }}>
            <Plus className="size-4" /> Novo Colaborador
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {filtrados.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">
            {colaboradores.length === 0 ? "Nenhum colaborador cadastrado." : "Nenhum resultado para os filtros."}
          </li>
        )}
        {filtrados.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-foreground">{c.nome_exibicao || c.nome}</p>
                <Badge variant="outline" className={cn("border-0", STATUS_COLABORADOR[c.status].className)}>
                  {STATUS_COLABORADOR[c.status].label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {[c.cargo_nome, c.setor_nome, c.tipo_vinculo].filter(Boolean).join(" · ") || "Sem cargo/setor"}
                {c.data_admissao ? ` · Admissão ${formatDateOnlyISO(c.data_admissao)}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{formatCurrencyBRL(c.salario_atual ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground">salário atual</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(podeEditar || isAdmin) && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => { setEditando(c); setFormOpen(true); }}>
                    <UserPen className="size-4" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSalarioDe(c)}>Salário</Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatusDe(c)}>Status</Button>
                  <Button size="sm" variant="ghost" onClick={() => setBeneficiosDe(c)}>Benefícios</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdiantamentoDe(c)}>Adiantamento</Button>
                </>
              )}
              <Button size="sm" variant="ghost" onClick={() => setHistoricoDe(c)}>
                <History className="size-4" /> Histórico
              </Button>
              {(podeDesativar || isAdmin) && c.status !== "desligado" && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDesligarDe(c)}>
                  Desligar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <ColaboradorForm open={formOpen} onClose={() => setFormOpen(false)} editing={editando} />
      {salarioDe && <AlterarSalarioDialog colaborador={salarioDe} onClose={() => setSalarioDe(null)} />}
      {statusDe && <AlterarStatusDialog colaborador={statusDe} onClose={() => setStatusDe(null)} />}
      {desligarDe && <DesligarDialog colaborador={desligarDe} onClose={() => setDesligarDe(null)} />}
      {beneficiosDe && <BeneficiosDialog colaborador={beneficiosDe} onClose={() => setBeneficiosDe(null)} />}
      {adiantamentoDe && (
        <AdiantamentoForm open colaborador={adiantamentoDe} onClose={() => setAdiantamentoDe(null)} />
      )}
      {historicoDe && <HistoricoColaboradorDialog colaborador={historicoDe} onClose={() => setHistoricoDe(null)} />}
    </div>
  );
}

/* ============================= TAB: FOLHA MENSAL ============================= */

function useFolhaResumo(competenciaId: string) {
  return useQuery({
    queryKey: ["folha", "resumo", competenciaId],
    enabled: !!competenciaId,
    queryFn: () => rpcFin<FolhaResumo>("folha_resumo", { p_competencia_id: competenciaId }),
  });
}

function FolhaTab() {
  const { can, isAdmin } = useAccess();
  const queryClient = useQueryClient();
  const competenciasQuery = useCompetencias(true);
  const competencias = competenciasQuery.data ?? [];
  const [competenciaId, setCompetenciaId] = useState("");
  const [abrirOpen, setAbrirOpen] = useState(false);
  const [pagarItem, setPagarItem] = useState<{ colaborador_id: string; nome: string; saldo: number } | null>(null);
  const [loteOpen, setLoteOpen] = useState(false);

  const competencia = competencias.find((c) => c.id === competenciaId) ?? null;
  const resumoQuery = useFolhaResumo(competenciaId);
  const resumo = resumoQuery.data;

  const refresh = () => {
    invalidateFolha(queryClient);
    void resumoQuery.refetch();
  };

  async function conferir(colaboradorId: string) {
    try {
      await rpcFin<FolhaRpcResult>("folha_conferir_item", {
        p_competencia_id: competenciaId,
        p_colaborador_id: colaboradorId,
      });
      refresh();
      toast.success("Item conferido.");
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao conferir."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <CompetenciaSelect competencias={competencias} value={competenciaId} onChange={setCompetenciaId} />
        {(can("folha", "criar") || isAdmin) && (
          <Button onClick={() => setAbrirOpen(true)}>
            <Plus className="size-4" /> Abrir Competência
          </Button>
        )}
        {competencia && resumo && (can("folha", "pagar") || isAdmin) && competencia.status === "aprovada" && (
          <Button variant="outline" onClick={() => setLoteOpen(true)}>Pagar em Lote</Button>
        )}
      </div>

      {competencia && resumo && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className={cn("border-0", STATUS_COMPETENCIA[competencia.status].className)}>
              {STATUS_COMPETENCIA[competencia.status].label}
            </Badge>
            <CompetenciaActions
              competencia={competencia}
              resumo={resumo}
              canAprovar={can("folha", "aprovar") || isAdmin}
              canFechar={can("folha", "fechar") || isAdmin}
              canReabrir={can("folha", "reabrir") || isAdmin}
              onChanged={refresh}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Proventos" value={formatCurrencyBRL(resumo.total_proventos)} />
            <KpiCard label="Descontos" value={formatCurrencyBRL(resumo.total_descontos)} />
            <KpiCard label="Total da Folha" value={formatCurrencyBRL(resumo.total_folha)} />
            <KpiCard label="Total Pago" value={formatCurrencyBRL(resumo.total_pago)} />
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Colaborador</th>
                  <th className="px-4 py-3 font-medium">Cargo/Setor</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Proventos</th>
                  <th className="px-4 py-3 text-right font-medium">Descontos</th>
                  <th className="px-4 py-3 text-right font-medium">Líquido</th>
                  <th className="px-4 py-3 text-right font-medium">Pago</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resumo.por_colaborador.map((c) => (
                  <tr key={c.folha_colaborador_id}>
                    <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{[c.cargo, c.setor].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={cn("border-0", STATUS_ITEM_FOLHA[c.status].className)}>
                        {STATUS_ITEM_FOLHA[c.status].label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{formatCurrencyBRL(c.proventos)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrencyBRL(c.descontos)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrencyBRL(c.total)}</td>
                    <td className="px-4 py-3 text-right text-primary">{formatCurrencyBRL(c.pago)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrencyBRL(c.saldo)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {(can("folha", "editar") || isAdmin) &&
                          c.status === "pendente" &&
                          competencia.status !== "fechada" && (
                            <Button size="sm" variant="ghost" onClick={() => conferir(c.colaborador_id)}>Conferir</Button>
                          )}
                        {(can("folha", "pagar") || isAdmin) && c.saldo > 0 && competencia.status === "aprovada" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPagarItem({ colaborador_id: c.colaborador_id, nome: c.nome, saldo: c.saldo })}
                          >
                            Pagar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!competencia && (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Selecione uma competência ou abra uma nova para gerar a folha do mês.
        </p>
      )}

      <AbrirCompetenciaDialog open={abrirOpen} onClose={() => setAbrirOpen(false)} />
      {pagarItem && (
        <PagarDialog competenciaId={competenciaId} item={pagarItem} onClose={() => setPagarItem(null)} onChanged={refresh} />
      )}
      {loteOpen && resumo && (
        <PagarLoteDialog competenciaId={competenciaId} resumo={resumo} onClose={() => setLoteOpen(false)} onChanged={refresh} />
      )}
    </div>
  );
}

/* ============================= TAB: LANÇAMENTOS ============================= */

function LancamentosTab() {
  const { can, isAdmin } = useAccess();
  const queryClient = useQueryClient();
  const competenciasQuery = useCompetencias(true);
  const competencias = competenciasQuery.data ?? [];
  const [competenciaId, setCompetenciaId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [cancelando, setCancelando] = useState<FolhaLancamento | null>(null);
  const colabQuery = useColaboradores(true);

  const lancamentosQuery = useQuery({
    queryKey: ["folha", "lancamentos", competenciaId],
    enabled: !!competenciaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("folha_lancamentos")
        .select("*, tipo:folha_tipos_lancamento(nome), colaborador:colaboradores(nome)")
        .eq("competencia_id", competenciaId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as FolhaLancamento[];
    },
  });
  const lancamentos = lancamentosQuery.data ?? [];
  const competencia = competencias.find((c) => c.id === competenciaId) ?? null;
  const refresh = () => {
    invalidateFolha(queryClient);
    void lancamentosQuery.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <CompetenciaSelect competencias={competencias} value={competenciaId} onChange={setCompetenciaId} />
        {competencia && (can("folha", "criar") || isAdmin) && competencia.status !== "fechada" && (
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Novo Lançamento
          </Button>
        )}
      </div>

      {competenciaId && (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {lancamentos.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhum lançamento nesta competência.</li>
          )}
          {lancamentos.map((l) => (
            <li key={l.id} className={cn("flex flex-wrap items-center gap-2 px-4 py-3 text-sm", l.cancelado_em && "opacity-50")}>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">
                  {l.colaborador?.nome ?? "—"} · {l.tipo?.nome ?? "Tipo"}
                  {l.cancelado_em && (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Cancelado
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {l.origem}
                  {l.descricao ? ` · ${l.descricao}` : ""}
                  {l.motivo_cancelamento ? ` · Motivo: ${l.motivo_cancelamento}` : ""}
                </p>
              </div>
              <span className={cn("font-semibold", l.natureza === "provento" ? "text-primary" : "text-destructive")}>
                {l.natureza === "provento" ? "+" : "−"}{formatCurrencyBRL(l.valor)}
              </span>
              {!l.cancelado_em && (can("folha", "cancelar") || isAdmin) && competencia?.status !== "fechada" && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelando(l)}>
                  Cancelar
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {competencia && (
        <LancamentoForm
          open={formOpen}
          onClose={() => setFormOpen(false)}
          competencia={competencia}
          colaboradores={colabQuery.data ?? []}
        />
      )}
      {cancelando && (
        <CancelarLancamentoDialog
          lancamentoId={cancelando.id}
          descricao={`${cancelando.tipo?.nome ?? "Lançamento"} — ${formatCurrencyBRL(cancelando.valor)}`}
          onClose={() => setCancelando(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

/* ============================= TAB: RESUMO ============================= */

function ResumoTab() {
  const { can, isAdmin } = useAccess();
  const competenciasQuery = useCompetencias(true);
  const competencias = competenciasQuery.data ?? [];
  const [competenciaId, setCompetenciaId] = useState("");
  const resumoQuery = useFolhaResumo(competenciaId);
  const resumo = resumoQuery.data;
  const competencia = competencias.find((c) => c.id === competenciaId) ?? null;

  function exportCsv() {
    if (!resumo || !competencia) return;
    const linhas = [
      ["Colaborador", "Cargo", "Setor", "Status", "Proventos", "Descontos", "Líquido", "Pago", "Saldo"],
      ...resumo.por_colaborador.map((c) => [
        c.nome,
        c.cargo ?? "",
        c.setor ?? "",
        c.status,
        c.proventos.toFixed(2),
        c.descontos.toFixed(2),
        c.total.toFixed(2),
        c.pago.toFixed(2),
        c.saldo.toFixed(2),
      ]),
    ];
    const csv = linhas.map((l) => l.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(";")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `folha-${competencia.competencia}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <CompetenciaSelect competencias={competencias} value={competenciaId} onChange={setCompetenciaId} />
        {resumo && (can("folha", "exportar") || isAdmin) && (
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> Exportar CSV
          </Button>
        )}
      </div>

      {resumo && competencia && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Proventos" value={formatCurrencyBRL(resumo.total_proventos)} />
            <KpiCard label="Descontos" value={formatCurrencyBRL(resumo.total_descontos)} />
            <KpiCard label="Total da Folha" value={formatCurrencyBRL(resumo.total_folha)} />
            <KpiCard label="Total Pago" value={formatCurrencyBRL(resumo.total_pago)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-display text-sm font-bold text-foreground">Por Tipo de Lançamento</h3>
              <ul className="space-y-2 text-sm">
                {resumo.por_tipo.map((t, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{t.tipo}</span>
                    <span className={cn("font-semibold", t.natureza === "provento" ? "text-primary" : "text-destructive")}>
                      {formatCurrencyBRL(t.total)}
                    </span>
                  </li>
                ))}
                {resumo.por_tipo.length === 0 && <li className="text-muted-foreground">Sem dados.</li>}
              </ul>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-3 font-display text-sm font-bold text-foreground">Por Setor</h3>
              <ul className="space-y-2 text-sm">
                {resumo.por_setor.map((s, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{s.setor}</span>
                    <span className="font-semibold text-foreground">{formatCurrencyBRL(s.total)}</span>
                  </li>
                ))}
                {resumo.por_setor.length === 0 && <li className="text-muted-foreground">Sem dados.</li>}
              </ul>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Colaborador</th>
                  <th className="px-4 py-3 text-right font-medium">Proventos</th>
                  <th className="px-4 py-3 text-right font-medium">Descontos</th>
                  <th className="px-4 py-3 text-right font-medium">Líquido</th>
                  <th className="px-4 py-3 text-right font-medium">Pago</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {resumo.por_colaborador.map((c) => (
                  <tr key={c.folha_colaborador_id}>
                    <td className="px-4 py-3 font-medium text-foreground">{c.nome}</td>
                    <td className="px-4 py-3 text-right">{formatCurrencyBRL(c.proventos)}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrencyBRL(c.descontos)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrencyBRL(c.total)}</td>
                    <td className="px-4 py-3 text-right text-primary">{formatCurrencyBRL(c.pago)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrencyBRL(c.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!competenciaId && (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Selecione uma competência para ver o resumo consolidado.
        </p>
      )}
    </div>
  );
}

/* ============================= TAB: HISTÓRICO ============================= */

function HistoricoTab() {
  const { can, isAdmin } = useAccess();
  const competenciasQuery = useCompetencias(true);
  const competencias = competenciasQuery.data ?? [];
  const [competenciaId, setCompetenciaId] = useState("");
  const resumoQuery = useFolhaResumo(competenciaId);

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {competencias.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma competência registrada.</li>
        )}
        {competencias.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setCompetenciaId(c.id === competenciaId ? "" : c.id)}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
            >
              <span className="font-medium text-foreground">{competenciaLabel(c.competencia)}</span>
              <Badge variant="outline" className={cn("border-0", STATUS_COMPETENCIA[c.status].className)}>
                {STATUS_COMPETENCIA[c.status].label}
              </Badge>
              {c.fechada_em && (
                <span className="text-xs text-muted-foreground">Fechada em {formatDateOnlyISO(c.fechada_em)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {competenciaId && resumoQuery.data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Total da Folha" value={formatCurrencyBRL(resumoQuery.data.total_folha)} />
            <KpiCard label="Total Pago" value={formatCurrencyBRL(resumoQuery.data.total_pago)} />
            <KpiCard label="Proventos" value={formatCurrencyBRL(resumoQuery.data.total_proventos)} />
            <KpiCard label="Descontos" value={formatCurrencyBRL(resumoQuery.data.total_descontos)} />
          </div>
          <h3 className="font-display text-sm font-bold text-foreground">Pagamentos da Competência</h3>
          <PagamentosList
            competenciaId={competenciaId}
            canEstornar={can("folha", "estornar") || isAdmin}
            onChanged={() => void resumoQuery.refetch()}
          />
        </div>
      )}
    </div>
  );
}
