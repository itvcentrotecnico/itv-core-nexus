import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  NIVEL_BADGE,
  TIPO_META_LABEL,
  type ProducaoMeusIndicadores,
  type ProducaoRegistro,
  type ProducaoStatus,
} from "@/lib/producao";
import { DetalheProducaoDialog } from "@/components/producao/detalhe-dialog";
import { MetasTab } from "@/components/producao/metas";
import { RegistroProducaoDialog } from "@/components/producao/registro-form";
import { rpcProd, StatusBadgeProducao } from "@/components/producao/shared";
import { KpiCard } from "./caixa";

export const Route = createFileRoute("/_authenticated/producao")({
  head: () => ({
    meta: [
      { title: "Minha Produção — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Registro e acompanhamento da produção técnica individual." },
      { property: "og:title", content: "Minha Produção — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Registro e acompanhamento da produção técnica individual." },
    ],
  }),
  component: ProducaoPage,
});

function mesAtual(): { from: string; to: string } {
  const hoje = todayManausISO();
  return { from: `${hoje.slice(0, 7)}-01`, to: hoje };
}

function ProducaoPage() {
  const { can, isAdmin, profile } = useAccess();
  const podeCriar = isAdmin || can("producao", "criar");
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<ProducaoRegistro | null>(null);
  const [detalhe, setDetalhe] = useState<ProducaoRegistro | null>(null);

  const inicial = useMemo(mesAtual, []);
  const [from, setFrom] = useState(inicial.from);
  const [to, setTo] = useState(inicial.to);
  const [fStatus, setFStatus] = useState<"" | ProducaoStatus>("");
  const [fOs, setFOs] = useState("");

  const indQuery = useQuery({
    queryKey: ["producao", "meus-indicadores", from, to],
    queryFn: () => rpcProd<ProducaoMeusIndicadores>("producao_meus_indicadores", { p_from: from, p_to: to }),
  });

  const listaQuery = useQuery({
    queryKey: ["producao", "minha-lista", from, to, fStatus, fOs],
    queryFn: async () => {
      let q = supabase
        .from("producao_tecnica")
        .select("*, tipo_servico:tipos_servico_tecnico(nome)")
        .gte("data_execucao", from)
        .lte("data_execucao", to)
        .order("data_execucao", { ascending: false })
        .order("created_at", { ascending: false });
      if (fStatus) q = q.eq("status", fStatus);
      if (fOs.trim()) q = q.ilike("os", `%${fOs.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ProducaoRegistro[];
    },
  });

  const ind = indQuery.data;
  const registros = listaQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Minha Produção</h1>
          <p className="text-sm text-muted-foreground">
            Registre seus serviços e acompanhe a validação gerencial. Nada aqui gera comissão ou custo automaticamente.
          </p>
        </div>
        {podeCriar && (
          <Button onClick={() => { setEditando(null); setNovoOpen(true); }}>
            <Plus className="mr-1.5 h-4 w-4" /> Registrar serviço
          </Button>
        )}
      </header>

      {ind && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Serviços no período" value={String(ind.registrados)} sub={`${ind.validados} validados`} />
          <KpiCard label="Aguardando validação" value={String(ind.pendentes_validacao)} sub={`${ind.rascunhos} rascunho(s)`} />
          <KpiCard label="Correções / Rejeitados" value={`${ind.correcao_solicitada} / ${ind.rejeitados}`} />
          <KpiCard label="Valor validado" value={formatCurrencyBRL(ind.valor_validado)} sub={`Ticket médio ${formatCurrencyBRL(ind.ticket_medio)}`} highlight />
        </div>
      )}

      {ind?.meta && (
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-foreground">
              Meta {(TIPO_META_LABEL[ind.meta.tipo] ?? "").toLowerCase()} · {formatDateOnlyISO(ind.meta.inicio)} → {formatDateOnlyISO(ind.meta.fim)}
            </h2>
            {ind.meta.nivel && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${NIVEL_BADGE[ind.meta.nivel] ?? "bg-muted text-muted-foreground"}`}>
                {ind.meta.nivel}
              </span>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <Progress value={Math.min(ind.meta.percentual ?? 0, 100)} className="h-2.5" />
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              {ind.meta.tipo !== "quantidade" && (
                <span>
                  Realizado: <strong className="text-foreground">{formatCurrencyBRL(ind.meta.realizado_valor)}</strong>
                  {ind.meta.valor_meta != null && <> de {formatCurrencyBRL(ind.meta.valor_meta)}</>}
                </span>
              )}
              {ind.meta.tipo !== "valor" && (
                <span>
                  Serviços validados: <strong className="text-foreground">{ind.meta.realizado_qtd}</strong>
                  {ind.meta.quantidade_meta != null && <> de {ind.meta.quantidade_meta}</>}
                </span>
              )}
              {ind.meta.percentual != null && (
                <span>Atingimento: <strong className="text-foreground">{ind.meta.percentual.toFixed(1)}%</strong></span>
              )}
              {ind.meta.projecao != null && (
                <span>
                  Projeção no fim do período:{" "}
                  <strong className="text-foreground">
                    {ind.meta.tipo === "quantidade" ? `${Math.round(ind.meta.projecao)} serviços` : formatCurrencyBRL(ind.meta.projecao)}
                  </strong>
                </span>
              )}
            </div>
          </div>
        </section>
      )}
      {ind && !ind.meta && (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Nenhuma meta ativa para o período. Quando a gerência cadastrar sua meta, o progresso aparece aqui.
        </p>
      )}

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Meus registros</TabsTrigger>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="pf-from" className={labelClass}>De</label>
              <input id="pf-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pf-to" className={labelClass}>Até</label>
              <input id="pf-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pf-status" className={labelClass}>Status</label>
              <select id="pf-status" value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className={inputClass}>
                <option value="">Todos</option>
                <option value="rascunho">Rascunho</option>
                <option value="enviado_validacao">Enviado p/ validação</option>
                <option value="validado">Validado</option>
                <option value="correcao_solicitada">Correção solicitada</option>
                <option value="rejeitado">Rejeitado</option>
              </select>
            </div>
            <div>
              <label htmlFor="pf-os" className={labelClass}>Buscar OS</label>
              <input id="pf-os" value={fOs} onChange={(e) => setFOs(e.target.value)} className={inputClass} placeholder="Nº da OS" />
            </div>
          </div>

          {listaQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando registros…</p>
          ) : registros.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum registro no período. Use "Registrar serviço" para lançar sua produção.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">OS</th>
                    <th className="px-3 py-2 font-medium">Cliente / Equipamento</th>
                    <th className="px-3 py-2 font-medium">Serviço</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {registros.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                      onClick={() => setDetalhe(r)}>
                      <td className="px-3 py-2 text-muted-foreground">{formatDateOnlyISO(r.data_execucao)}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.os}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.cliente ?? "—"}
                        {r.marca_tv && <span className="block text-[11px]">{[r.marca_tv, r.modelo_tv].filter(Boolean).join(" ")}</span>}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground" title={r.servico_executado}>
                        {r.tipo_servico?.nome ?? r.servico_executado}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {r.valor_servico != null ? formatCurrencyBRL(r.valor_servico) : "—"}
                      </td>
                      <td className="px-3 py-2"><StatusBadgeProducao status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="desempenho" className="mt-4">
          {ind ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <KpiCard label="Qualidade (sem correção/rejeição)" value={ind.percentual_validado_sem_correcao != null ? `${ind.percentual_validado_sem_correcao.toFixed(1)}%` : "—"} sub="Validados ÷ concluídos" />
              <KpiCard label="Tempo médio de validação" value={`${ind.tempo_medio_validacao_horas.toFixed(1)}h`} sub="Envio → validação" />
              <KpiCard label="Ticket médio validado" value={formatCurrencyBRL(ind.ticket_medio)} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Carregando desempenho…</p>
          )}
        </TabsContent>

        <TabsContent value="metas" className="mt-4">
          <MetasTab />
        </TabsContent>
      </Tabs>

      <RegistroProducaoDialog
        open={novoOpen || !!editando}
        registro={editando}
        onClose={() => { setNovoOpen(false); setEditando(null); }}
      />
      <DetalheProducaoDialog
        registro={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={(r) => { setDetalhe(null); setEditando(r); }}
      />
    </div>
  );
}
