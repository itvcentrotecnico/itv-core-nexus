import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, History, Loader2, Minus, Printer, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { gerarResumoExecutivo } from "@/lib/resumo.functions";
import { variacao } from "@/lib/resumo-validacao";
import { formatCurrencyBRL, formatDateOnlyISO, formatDateTimeITV } from "@/lib/format";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const GRAV: Record<string, { label: string; cls: string }> = {
  critico: { label: "Crítico", cls: "border-destructive/40 bg-destructive/5 text-destructive" },
  atencao: { label: "Atenção", cls: "border-amber-500/40 bg-amber-500/5 text-amber-700" },
  informativo: { label: "Informativo", cls: "border-border bg-muted/40 text-foreground" },
};

async function rpc<T = J>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function toLocalInput(iso: string) {
  const d = new Date(new Date(iso).getTime() - 4 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}
function fromLocalInput(v: string) {
  return new Date(`${v}:00-04:00`).toISOString();
}

function Tendencia({ atual, anterior }: { atual: number; anterior: number }) {
  const { diff, pct } = variacao(atual, anterior);
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {pct == null ? `${diff >= 0 ? "+" : ""}${diff} vs anterior (base zero)` : `${pct >= 0 ? "+" : ""}${pct}% vs anterior`}
    </span>
  );
}

function Card({
  label,
  value,
  sub,
  atual,
  anterior,
  onDetalhe,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  atual?: number;
  anterior?: number;
  onDetalhe?: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {atual != null && anterior != null && <Tendencia atual={atual} anterior={anterior} />}
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      {onDetalhe && (
        <button type="button" onClick={onDetalhe} className="mt-1 text-[11px] font-semibold text-primary hover:underline print:hidden">
          Ver registros
        </button>
      )}
    </div>
  );
}

function Secao({ titulo, regra, children }: { titulo: string; regra?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 break-inside-avoid">
      <h2 className="mb-1 font-display text-sm font-bold text-foreground">{titulo}</h2>
      {regra && <p className="mb-3 text-[11px] text-muted-foreground">Regra: {regra}</p>}
      {children}
    </section>
  );
}

type Modo = "fechado" | "previa" | "personalizado";

export function ResumoExecutivo() {
  const qc = useQueryClient();
  const { isAdmin, can } = useAccess();
  const podeEditar = isAdmin || can("operacional", "editar");
  const gerar = useServerFn(gerarResumoExecutivo);

  const periodos = useQuery({ queryKey: ["resumo-periodos"], queryFn: () => rpc("resumo_periodos") });
  const [modo, setModo] = useState<Modo>("fechado");
  const [ini, setIni] = useState("");
  const [fim, setFim] = useState("");
  const [salvoId, setSalvoId] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<{ titulo: string; ind: string } | null>(null);

  const p = periodos.data;
  const intervalo = useMemo(() => {
    if (!p) return null;
    if (modo === "fechado") return { inicio: p.fechado_inicio as string, fim: p.fechado_fim as string };
    if (modo === "previa") return { inicio: p.previa_inicio as string, fim: new Date().toISOString() };
    if (ini && fim) return { inicio: fromLocalInput(ini), fim: fromLocalInput(fim) };
    return null;
  }, [p, modo, ini, fim]);

  const previa = useQuery({
    queryKey: ["resumo-previa", intervalo?.inicio, intervalo?.fim],
    queryFn: () => rpc("resumo_previa", { p_inicio: intervalo!.inicio, p_fim: intervalo!.fim }),
    enabled: !!intervalo && !salvoId,
  });
  const salvo = useQuery({
    queryKey: ["resumo-salvo", salvoId],
    queryFn: () => rpc("resumo_obter", { p_id: salvoId }),
    enabled: !!salvoId,
  });
  const historico = useQuery({
    queryKey: ["resumo-historico"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("resumos_executivos")
        .select("id, periodo_inicio, periodo_fim, versao, tipo, origem_geracao, narrativa_origem, revisado, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as J[];
    },
  });
  const agenda = useQuery({ queryKey: ["resumo-agenda"], queryFn: () => rpc("resumo_agenda_status") });

  const gerarM = useMutation({
    mutationFn: () => gerar({ data: { inicio: intervalo!.inicio, fim: intervalo!.fim } }),
    onSuccess: (r) => {
      toast.success(r.narrativa === "ia" ? "Resumo gerado e salvo." : "Resumo salvo (versão estruturada).");
      if (r.aviso) toast.warning(r.aviso);
      setSalvoId(r.id);
      void qc.invalidateQueries({ queryKey: ["resumo-historico"] });
      void qc.invalidateQueries({ queryKey: ["resumo-agenda"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rel: J | undefined = salvoId ? salvo.data : undefined;
  const m: J | undefined = salvoId ? rel?.indicadores : previa.data;
  const a = m?.atual;
  const b = m?.anterior;
  const regras = salvoId ? rel?.regras : m?.regras;
  const periodo = m?.periodo;
  const ehPrevia = salvoId ? rel?.tipo === "previa" : periodo && new Date(periodo.fim) > new Date(Date.now() - 60000) && modo !== "fechado";

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Controles */}
      <section className="rounded-xl border border-border bg-card p-4 print:hidden">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["fechado", "Semana encerrada"],
              ["previa", "Semana em andamento (prévia)"],
              ["personalizado", "Personalizado"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setModo(v);
                setSalvoId(null);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                modo === v && !salvoId ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        {modo === "personalizado" && !salvoId && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="re-ini">Início (Manaus)</Label>
              <Input id="re-ini" type="datetime-local" value={ini} onChange={(e) => setIni(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="re-fim">Fim (Manaus, não incluso)</Label>
              <Input id="re-fim" type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!intervalo} onClick={() => { setSalvoId(null); void previa.refetch(); }}>
            <RefreshCw className="mr-1 size-4" /> Atualizar prévia
          </Button>
          {podeEditar && (
            <Button size="sm" disabled={!intervalo || gerarM.isPending} onClick={() => gerarM.mutate()}>
              {gerarM.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
              Gerar resumo agora
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => document.getElementById("re-historico")?.scrollIntoView({ behavior: "smooth" })}>
            <History className="mr-1 size-4" /> Consultar histórico
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1 size-4" /> Imprimir
          </Button>
        </div>
      </section>

      {/* Cabeçalho do período */}
      {periodo && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                ehPrevia ? "bg-amber-500/10 text-amber-700" : "bg-primary/10 text-primary",
              )}
            >
              {ehPrevia ? "PRÉVIA — período em andamento" : "PERÍODO ENCERRADO"}
            </span>
            {rel && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Versão {rel.versao} · {rel.origem_geracao === "agendada" ? "Geração agendada" : `Gerado por ${rel.gerado_por_nome ?? "—"}`} ·{" "}
                {rel.narrativa_origem === "ia" ? "Texto por IA" : "Texto estruturado"} · {rel.revisado ? `Revisado por ${rel.revisado_por_nome ?? "—"}` : "Não revisado"}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-foreground">
            De <strong>{formatDateTimeITV(periodo.inicio)}</strong> até <strong>{formatDateTimeITV(periodo.fim)}</strong> (fim não incluso) · Comparado com{" "}
            {formatDateTimeITV(periodo.anterior_inicio)} a {formatDateTimeITV(periodo.anterior_fim)}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Indicadores calculados em {formatDateTimeITV(m.calculado_em)}
            {rel ? " e congelados nesta versão." : " (ao vivo)."}
          </p>
        </section>
      )}

      {(previa.isLoading || salvo.isLoading) && <p className="text-sm text-muted-foreground">Calculando indicadores…</p>}
      {(previa.isError || salvo.isError) && (
        <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">Não foi possível carregar o resumo. Tente novamente.</p>
      )}

      {a && b && (
        <>
          {/* Alertas */}
          <Secao titulo="Desvios e alertas">
            {(m.alertas ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum desvio relevante identificado pelas regras.</p>
            ) : (
              <ul className="space-y-2">
                {m.alertas.map((al: J, i: number) => (
                  <li key={i} className={cn("rounded-lg border p-2 text-sm", GRAV[al.gravidade]?.cls)}>
                    <strong>{GRAV[al.gravidade]?.label} · {al.area}:</strong> {al.texto}
                  </li>
                ))}
              </ul>
            )}
          </Secao>

          {/* Narrativa */}
          {rel && (
            <Secao titulo="Resumo executivo">
              <div className="space-y-3 text-sm text-foreground">
                <div>
                  <p className="font-semibold">Visão da semana</p>
                  <p>{rel.narrativa?.visao}</p>
                </div>
                <div>
                  <p className="font-semibold">Desvios relevantes</p>
                  <ul className="list-disc pl-5">{(rel.narrativa?.desvios ?? []).map((d: string, i: number) => <li key={i}>{d}</li>)}</ul>
                  {(rel.narrativa?.desvios ?? []).length === 0 && <p className="text-muted-foreground">Nenhum.</p>}
                </div>
                <div>
                  <p className="font-semibold">Bloqueios e decisões pendentes</p>
                  <p>{rel.narrativa?.bloqueios}</p>
                </div>
                <div>
                  <p className="font-semibold">Próximos passos (recomendações)</p>
                  <ul className="list-disc pl-5">{(rel.narrativa?.proximos_passos ?? []).map((d: string, i: number) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
            </Secao>
          )}

          <Prioridades
            key={salvoId ?? "previa"}
            itens={rel ? rel.prioridades : m.prioridades_sugeridas}
            resumoId={salvoId}
            revisado={!!rel?.revisado}
            podeEditar={podeEditar}
            onSalvo={() => void salvo.refetch()}
          />

          <Secao titulo="Leads e atendimento" regra={regras?.leads}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card label="Leads recebidos" value={a.leads.total} atual={a.leads.total} anterior={b.leads.total} onDetalhe={() => setDetalhe({ titulo: "Leads", ind: "leads" })} />
              <Card label="Atendidos" value={a.leads.atendidos} sub={`Pendentes: ${a.leads.pendentes}`} />
              <Card
                label="Média por dia"
                value={String(a.leads.media_dia).replace(".", ",")}
                sub={`${a.leads.dias_atendimento} dias de atendimento (seg–sáb)${m.metas_sugeridas?.leads_dia ? ` · meta sugerida ${m.metas_sugeridas.leads_dia}/dia (pendente de confirmação)` : ""}`}
              />
              <Card label="Conversão lead → entrada" value="—" sub="Dados insuficientes: não há vínculo entre lead e OS." />
            </div>
            {a.leads.por_origem.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Por origem: {a.leads.por_origem.map((o: J) => `${o.origem} (${o.total})`).join(" · ")}
              </p>
            )}
          </Secao>

          <Secao titulo="Entradas de TVs" regra={regras?.entradas}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card
                label="TVs recebidas"
                value={a.entradas.informadas ? a.entradas.total : "Sem dados"}
                sub={a.entradas.informadas ? `Fonte: ${a.entradas.fonte ?? "—"}` : "Entradas não informadas no Fechamento Semanal."}
                {...(a.entradas.informadas && b.entradas.informadas ? { atual: a.entradas.total, anterior: b.entradas.total } : {})}
              />
            </div>
          </Secao>

          <Secao titulo="Laboratório" regra={regras?.laboratorio}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card label="Serviços enviados" value={a.laboratorio.enviados} atual={a.laboratorio.enviados} anterior={b.laboratorio.enviados} onDetalhe={() => setDetalhe({ titulo: "Laboratório", ind: "laboratorio" })} />
              <Card label="Validados" value={a.laboratorio.validados} atual={a.laboratorio.validados} anterior={b.laboratorio.validados} />
              <Card label="Rejeitados / correção" value={a.laboratorio.rejeitados} />
              <Card label="Aguardando validação no corte" value={a.laboratorio.aguardando_validacao_corte} sub={`${a.laboratorio.aguardando_mais_48h} há mais de 48h`} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Etapas (análise, orçamento, conserto, aguardando peça, teste, expedição): dados insuficientes — ficam no INFOR OS.
            </p>
          </Secao>

          <Secao titulo="Prazo de orçamento de 6h">
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
              Configuração pendente · Dados insuficientes. {a.prazo_orcamento?.motivo} Marco inicial proposto: recebimento da TV. Contagem (corridas ou expediente) a definir pela gestão.
            </p>
          </Secao>

          <Secao titulo="Logística" regra={regras?.logistica}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card label="Coletas realizadas" value={a.logistica.coletas_realizadas} sub={`Agendadas: ${a.logistica.coletas_agendadas}`} atual={a.logistica.coletas_realizadas} anterior={b.logistica.coletas_realizadas} onDetalhe={() => setDetalhe({ titulo: "Coletas e entregas realizadas", ind: "logistica_realizadas" })} />
              <Card label="Entregas realizadas" value={a.logistica.entregas_realizadas} sub={`Agendadas: ${a.logistica.entregas_agendadas}`} atual={a.logistica.entregas_realizadas} anterior={b.logistica.entregas_realizadas} />
              <Card label="Vencidas no corte" value={a.logistica.vencidas_corte} sub={`Não realizadas no período: ${a.logistica.nao_realizadas}`} onDetalhe={() => setDetalhe({ titulo: "Compromissos vencidos", ind: "logistica_vencidas" })} />
              <Card label="Aguardando no corte" value={a.logistica.aguardando_coleta_corte + a.logistica.aguardando_entrega_corte} sub={`Coleta ${a.logistica.aguardando_coleta_corte} · Entrega ${a.logistica.aguardando_entrega_corte} · Sem motorista ${a.logistica.sem_motorista_corte}`} />
            </div>
            {a.logistica.por_motorista.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                Realizadas por motorista (registrado): {a.logistica.por_motorista.map((x: J) => `${x.motorista} (${x.realizadas})`).join(" · ")}
              </p>
            )}
          </Secao>

          <Secao titulo="TVs paradas e bloqueios" regra={regras?.bloqueios}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Card label="Pendências abertas" value={a.bloqueios.abertas} onDetalhe={() => setDetalhe({ titulo: "Pendências abertas", ind: "bloqueios" })} />
              <Card label="Há mais de 15 dias" value={a.bloqueios.mais_15_dias} />
              <Card label="Sem data de entrada" value={a.bloqueios.sem_data_entrada} sub="Contadas à parte" />
              <Card label="Decisões pendentes" value={a.decisoes.abertas} sub={`Vencidas: ${a.decisoes.vencidas}`} />
            </div>
            {a.bloqueios.por_motivo.length > 0 && (
              <p className="mt-3 text-xs text-muted-foreground">Por motivo: {a.bloqueios.por_motivo.map((x: J) => `${x.motivo} (${x.total})`).join(" · ")}</p>
            )}
          </Secao>

          {m.financeiro_restrito ? (
            <Secao titulo="Metas e financeiro">
              <p className="text-sm text-muted-foreground">Restrito ao seu perfil.</p>
            </Secao>
          ) : (
            <Secao titulo="Metas e financeiro" regra={`${regras?.financeiro ?? ""} ${regras?.metas ?? ""}`}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card label="Faturamento do período" value={formatCurrencyBRL(Number(a.financeiro.faturamento_total))} sub={`Diferença vs anterior: ${formatCurrencyBRL(Number(a.financeiro.faturamento_total) - Number(b.financeiro.faturamento_total))}`} onDetalhe={() => setDetalhe({ titulo: "Lançamentos de receita", ind: "financeiro" })} />
                <Card label="Serviços" value={formatCurrencyBRL(Number(a.financeiro.servicos))} sub={`Acessórios ${formatCurrencyBRL(Number(a.financeiro.acessorios))} · TVs ${formatCurrencyBRL(Number(a.financeiro.venda_tv))}`} />
                <Card
                  label={`Meta de serviços do mês (desde ${formatDateOnlyISO(a.metas.mes_inicio)})`}
                  value={a.metas.meta_servicos ? `${Math.round((Number(a.metas.servicos_mes) / Number(a.metas.meta_servicos)) * 100)}%` : "Sem meta"}
                  sub={a.metas.meta_servicos ? `${formatCurrencyBRL(Number(a.metas.servicos_mes))} de ${formatCurrencyBRL(Number(a.metas.meta_servicos))} · ${a.metas.meta_nome}` : "Nenhuma meta cadastrada para o mês."}
                />
                <Card
                  label="Faturamento acumulado do mês"
                  value={formatCurrencyBRL(Number(a.metas.faturamento_mes))}
                  sub={m.metas_sugeridas?.faturamento_mes ? `Referência histórica ${formatCurrencyBRL(Number(m.metas_sugeridas.faturamento_mes))}/mês — sugestão pendente de confirmação, não é meta vigente.` : undefined}
                />
              </div>
            </Secao>
          )}
        </>
      )}

      <Decisoes podeEditar={podeEditar} />

      {/* Histórico */}
      <section id="re-historico" className="rounded-xl border border-border bg-card p-4 print:hidden">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Histórico de relatórios</h2>
        {(historico.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {historico.data!.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setSalvoId(h.id)}
                  className={cn("flex w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm hover:bg-muted/50", salvoId === h.id && "bg-primary/5")}
                >
                  <span>
                    {formatDateTimeITV(h.periodo_inicio)} → {formatDateTimeITV(h.periodo_fim)} · v{h.versao}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {h.tipo === "previa" ? "Prévia" : "Encerrado"} · {h.origem_geracao === "agendada" ? "Agendado" : "Manual"} · {h.revisado ? "Revisado" : "Não revisado"} · {formatDateTimeITV(h.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Agenda podeEditar={podeEditar} config={p?.config} agenda={agenda.data} onSalvo={() => { void periodos.refetch(); void agenda.refetch(); }} onRetry={() => { setModo("fechado"); setSalvoId(null); gerarM.mutate(); }} />

      <Detalhe alvo={detalhe} intervalo={periodo ? { inicio: periodo.inicio, fim: periodo.fim } : null} onClose={() => setDetalhe(null)} />
    </div>
  );
}

function Prioridades({
  itens,
  resumoId,
  revisado,
  podeEditar,
  onSalvo,
}: {
  itens: J[];
  resumoId: string | null;
  revisado: boolean;
  podeEditar: boolean;
  onSalvo: () => void;
}) {
  const [lista, setLista] = useState<J[]>(itens ?? []);
  const [editando, setEditando] = useState(false);
  const salvar = useMutation({
    mutationFn: () => rpc("resumo_revisar", { p_id: resumoId, p_prioridades: lista }),
    onSuccess: () => {
      toast.success("Relatório marcado como revisado.");
      setEditando(false);
      onSalvo();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const set = (i: number, k: string, v: string) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <section className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 break-inside-avoid">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold text-foreground">
          3 prioridades da semana seguinte {resumoId ? (revisado ? "· Revisadas" : "· Recomendação (não revisada)") : "· Sugestão da prévia"}
        </h2>
        {resumoId && podeEditar && !editando && (
          <Button size="sm" variant="outline" className="print:hidden" onClick={() => setEditando(true)}>
            Ajustar e revisar
          </Button>
        )}
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {lista.map((p, i) => (
          <li key={i} className="rounded-lg border border-border bg-background p-3 text-sm">
            <p className="text-[11px] font-bold text-primary">Prioridade {i + 1}</p>
            {editando ? (
              <div className="mt-1 space-y-2">
                {(["acao", "evidencia", "resultado", "responsavel", "prazo"] as const).map((k) => (
                  <div key={k}>
                    <Label className="text-[11px] capitalize">{k === "acao" ? "Ação" : k === "evidencia" ? "Evidência" : k}</Label>
                    <Textarea rows={2} value={p[k] ?? ""} onChange={(e) => set(i, k, e.target.value)} />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <p className="font-semibold text-foreground">{p.acao}</p>
                <p className="mt-1 text-xs text-muted-foreground"><strong>Evidência:</strong> {p.evidencia}</p>
                <p className="text-xs text-muted-foreground"><strong>Resultado esperado:</strong> {p.resultado}</p>
                <p className="text-xs text-muted-foreground"><strong>Responsável:</strong> {p.responsavel || "A definir"}</p>
                <p className="text-xs text-muted-foreground"><strong>Prazo:</strong> {p.prazo}</p>
              </>
            )}
          </li>
        ))}
      </ol>
      {editando && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={salvar.isPending || lista.length !== 3} onClick={() => salvar.mutate()}>
            Salvar e marcar como revisado
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setLista(itens); setEditando(false); }}>
            Cancelar
          </Button>
        </div>
      )}
    </section>
  );
}

function Decisoes({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["decisoes-pendentes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("decisoes_pendentes").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return data as J[];
    },
  });
  const [desc, setDesc] = useState("");
  const [prazo, setPrazo] = useState("");
  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("decisoes_pendentes").insert({ descricao: desc.trim(), prazo: prazo || null });
      if (error) throw new Error("Não foi possível registrar a decisão.");
    },
    onSuccess: () => { setDesc(""); setPrazo(""); void qc.invalidateQueries({ queryKey: ["decisoes-pendentes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolver = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any)
        .from("decisoes_pendentes")
        .update({ status, resolvido_por: u.user?.id, resolvido_em: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error("Não foi possível atualizar.");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["decisoes-pendentes"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const abertas = (q.data ?? []).filter((d) => d.status === "aberta");
  const outras = (q.data ?? []).filter((d) => d.status !== "aberta").slice(0, 5);

  return (
    <section className="rounded-xl border border-border bg-card p-4 break-inside-avoid">
      <h2 className="mb-3 font-display text-sm font-bold text-foreground">Decisões pendentes da gestão</h2>
      {podeEditar && (
        <div className="mb-3 flex flex-col gap-2 sm:flex-row print:hidden">
          <Input placeholder="Decisão a tomar (ex.: aprovar compra de peças do lote X)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Input type="date" className="sm:w-44" value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label="Prazo" />
          <Button size="sm" disabled={desc.trim().length < 3 || add.isPending} onClick={() => add.mutate()}>
            Registrar
          </Button>
        </div>
      )}
      {abertas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma decisão pendente registrada.</p>
      ) : (
        <ul className="space-y-2">
          {abertas.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
              <span>
                {d.descricao}
                <span className="ml-2 text-[11px] text-muted-foreground">
                  Desde {formatDateTimeITV(d.created_at)}{d.prazo ? ` · Prazo ${formatDateOnlyISO(d.prazo)}` : " · Sem prazo"}
                </span>
              </span>
              {podeEditar && (
                <span className="flex gap-1 print:hidden">
                  <Button size="sm" variant="outline" onClick={() => resolver.mutate({ id: d.id, status: "resolvida" })}>Resolvida</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolver.mutate({ id: d.id, status: "cancelada" })}>Cancelar</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {outras.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Recentes: {outras.map((d) => `${d.descricao} (${d.status === "resolvida" ? "resolvida" : "cancelada"})`).join(" · ")}
        </p>
      )}
    </section>
  );
}

function Agenda({ podeEditar, config, agenda, onSalvo, onRetry }: { podeEditar: boolean; config: J; agenda: J; onSalvo: () => void; onRetry: () => void }) {
  const [dia, setDia] = useState<number | null>(null);
  const [hora, setHora] = useState<number | null>(null);
  const d = dia ?? config?.dia_semana ?? 6;
  const h = hora ?? config?.hora ?? 13;
  const salvar = useMutation({
    mutationFn: () => rpc("resumo_config_salvar", { p_dia: d, p_hora: h, p_destinatarios: config?.destinatarios ?? [] }),
    onSuccess: () => { toast.success("Horário da geração semanal atualizado."); onSalvo(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const ult = agenda?.ultima_execucao;
  const ativo = agenda?.agendado && ult?.status === "sucesso";

  return (
    <section className="rounded-xl border border-border bg-card p-4 print:hidden">
      <h2 className="mb-2 font-display text-sm font-bold text-foreground">Geração semanal automática</h2>
      <p className="text-sm text-foreground">
        Corte: <strong>{DIAS[d]} às {String(h).padStart(2, "0")}h</strong> (Manaus). Situação:{" "}
        {!agenda?.agendado ? (
          <strong className="text-destructive">não agendada</strong>
        ) : ativo ? (
          <strong className="text-primary">ativa (última execução com sucesso)</strong>
        ) : (
          <strong className="text-amber-700">agendada — aguardando a primeira execução para confirmar</strong>
        )}
      </p>
      {ult && (
        <p className="mt-1 text-xs text-muted-foreground">
          Última execução: {formatDateTimeITV(ult.executado_em)} · {ult.status === "sucesso" ? "Sucesso" : ult.status === "falha" ? `Falha: ${ult.mensagem}` : "Ignorada (período já gerado)"}
        </p>
      )}
      {ult?.status === "falha" && podeEditar && (
        <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>Tentar novamente</Button>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        A geração automática salva o resumo estruturado (sem IA). Avisos ficam só dentro do sistema; nada é enviado a clientes, WhatsApp ou e-mail.
      </p>
      {podeEditar && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="re-dia">Dia</Label>
            <select id="re-dia" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={d} onChange={(e) => setDia(Number(e.target.value))}>
              {DIAS.map((n, i) => <option key={n} value={i}>{n}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="re-hora">Hora</Label>
            <select id="re-hora" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={h} onChange={(e) => setHora(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}h</option>)}
            </select>
          </div>
          <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>Salvar horário</Button>
        </div>
      )}
    </section>
  );
}

function Detalhe({ alvo, intervalo, onClose }: { alvo: { titulo: string; ind: string } | null; intervalo: { inicio: string; fim: string } | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["resumo-detalhe", alvo?.ind, intervalo?.inicio, intervalo?.fim],
    queryFn: () => rpc<J[]>("resumo_detalhe", { p_inicio: intervalo!.inicio, p_fim: intervalo!.fim, p_indicador: alvo!.ind }),
    enabled: !!alvo && !!intervalo,
  });
  const linhas = q.data ?? [];
  const cols = linhas[0] ? Object.keys(linhas[0]) : [];
  const fmt = (k: string, v: unknown) => {
    if (v == null || v === "") return "—";
    if (k === "valor") return formatCurrencyBRL(Number(v));
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTimeITV(v);
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDateOnlyISO(v);
    return String(v);
  };
  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
        <DialogHeader>
          <DialogTitle>{alvo?.titulo} — registros de origem</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : q.isError ? (
          <p className="text-sm text-muted-foreground">{(q.error as Error).message.includes("permissão") ? "Sem permissão para ver estes registros." : "Não foi possível carregar."}</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum registro no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  {cols.map((c) => <th key={c} className="px-2 py-1 capitalize">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {cols.map((c) => <td key={c} className="px-2 py-1">{fmt(c, l[c])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">{linhas.length} registros.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
