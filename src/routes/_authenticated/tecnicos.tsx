import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  NIVEL_BADGE,
  type ProducaoFilaIndicadores,
  type ProducaoRankingItem,
  type ProducaoRegistro,
  type ProducaoStatus,
} from "@/lib/producao";
import { DetalheProducaoDialog } from "@/components/producao/detalhe-dialog";
import { MetasTab } from "@/components/producao/metas";
import { rpcProd, StatusBadgeProducao, useProducaoRefs } from "@/components/producao/shared";
import { KpiCard } from "./caixa";

export const Route = createFileRoute("/_authenticated/tecnicos")({
  head: () => ({
    meta: [
      { title: "Validação Técnica — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content: "Validação gerencial da produção técnica e desempenho da equipe.",
      },
      { property: "og:title", content: "Validação Técnica — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Validação gerencial da produção técnica e desempenho da equipe.",
      },
    ],
  }),
  component: TecnicosPage,
});

export function TecnicosPage({
  abaInicial = "fila",
  semTitulo = false,
}: {
  abaInicial?: string;
  semTitulo?: boolean;
} = {}) {
  const { isAdmin, can } = useAccess();
  const { ehGerencia, tecnicos } = useProducaoRefs();
  const podeConfigurarMetas = isAdmin || can("producao", "configurar_metas");
  const [detalhe, setDetalhe] = useState<ProducaoRegistro | null>(null);

  const inicial = useMemo(() => {
    const hoje = todayManausISO();
    return { from: `${hoje.slice(0, 7)}-01`, to: hoje };
  }, []);
  const [from, setFrom] = useState(inicial.from);
  const [to, setTo] = useState(inicial.to);
  const [fTecnico, setFTecnico] = useState("");
  const [fStatus, setFStatus] = useState<"" | ProducaoStatus>("");

  const filaQuery = useQuery({
    queryKey: ["producao", "fila-indicadores"],
    enabled: ehGerencia,
    queryFn: () => rpcProd<ProducaoFilaIndicadores>("producao_fila_indicadores"),
  });

  const filaListaQuery = useQuery({
    queryKey: ["producao", "fila-lista"],
    enabled: ehGerencia,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_tecnica")
        .select(
          "*, tecnico:profiles!producao_tecnica_tecnico_id_fkey(full_name), tipo_servico:tipos_servico_tecnico(nome)",
        )
        .eq("status", "enviado_validacao")
        .order("enviado_em", { ascending: true });
      if (error) throw error;
      return data as unknown as ProducaoRegistro[];
    },
  });

  const equipeQuery = useQuery({
    queryKey: ["producao", "equipe-lista", from, to, fTecnico, fStatus],
    enabled: ehGerencia,
    queryFn: async () => {
      let q = supabase
        .from("producao_tecnica")
        .select(
          "*, tecnico:profiles!producao_tecnica_tecnico_id_fkey(full_name), tipo_servico:tipos_servico_tecnico(nome)",
        )
        .neq("status", "cancelado")
        .gte("data_execucao", from)
        .lte("data_execucao", to)
        .order("data_execucao", { ascending: false });
      if (fTecnico) q = q.eq("tecnico_id", fTecnico);
      if (fStatus) q = q.eq("status", fStatus);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ProducaoRegistro[];
    },
  });

  const rankingQuery = useQuery({
    queryKey: ["producao", "ranking", from, to],
    enabled: ehGerencia,
    queryFn: () => rpcProd<ProducaoRankingItem[]>("producao_ranking", { p_from: from, p_to: to }),
  });

  if (!ehGerencia) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <ClipboardCheck className="size-10 text-muted-foreground/40" />
        <h1 className="font-display text-xl font-bold text-foreground">Acesso restrito</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          A validação de produção é exclusiva da gerência. Acompanhe seus registros em "Produção".
        </p>
      </div>
    );
  }

  const fila = filaQuery.data;
  const filaLista = filaListaQuery.data ?? [];
  const equipe = equipeQuery.data ?? [];
  const ranking = rankingQuery.data ?? [];

  return (
    <div className="space-y-6">
      {!semTitulo && (
        <header>
          <h1 className="font-display text-2xl font-bold text-foreground">Validação Técnica</h1>
          <p className="text-sm text-muted-foreground">
            Confira, valide, solicite correções ou rejeite os serviços registrados pela equipe.
          </p>
        </header>
      )}

      {fila && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard
            label="Aguardando validação"
            value={String(fila.aguardando_validacao)}
            sub={`Tempo médio em fila ${fila.tempo_medio_fila_horas.toFixed(1)}h`}
            highlight={fila.aguardando_validacao > 0}
          />
          <KpiCard
            label="Validados hoje"
            value={String(fila.validados_hoje)}
            sub={`${fila.validados_mes} no mês`}
          />
          <KpiCard
            label="Correções pendentes"
            value={String(fila.correcao_solicitada)}
            sub={`${fila.rejeitados_mes} rejeitados no mês`}
          />
          <KpiCard
            label="Valor validado no mês"
            value={formatCurrencyBRL(fila.valor_validado_mes)}
          />
        </div>
      )}

      <Tabs defaultValue={abaInicial}>
        <TabsList>
          <TabsTrigger value="fila">
            Fila de validação ({fila?.aguardando_validacao ?? 0})
          </TabsTrigger>
          <TabsTrigger value="equipe">Produção da equipe</TabsTrigger>
          <TabsTrigger value="ranking">Desempenho</TabsTrigger>
          {podeConfigurarMetas && <TabsTrigger value="metas">Metas</TabsTrigger>}
        </TabsList>

        <TabsContent value="fila" className="mt-4">
          {filaListaQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando fila…</p>
          ) : filaLista.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum serviço aguardando validação. Bom trabalho!
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Enviado em</th>
                    <th className="px-3 py-2 font-medium">Técnico</th>
                    <th className="px-3 py-2 font-medium">OS</th>
                    <th className="px-3 py-2 font-medium">Serviço</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {filaLista.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                      onClick={() => setDetalhe(r)}
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.enviado_em
                          ? new Date(r.enviado_em).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "—"}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {r.tecnico?.full_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-foreground">{r.os}</td>
                      <td
                        className="max-w-[240px] truncate px-3 py-2 text-muted-foreground"
                        title={r.servico_executado}
                      >
                        {r.tipo_servico?.nome ?? r.servico_executado}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {r.valor_servico != null ? formatCurrencyBRL(r.valor_servico) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Clique em um registro para conferir detalhes, fotos e validar.
          </p>
        </TabsContent>

        <TabsContent value="equipe" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label htmlFor="tf-from" className={labelClass}>
                De
              </label>
              <input
                id="tf-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tf-to" className={labelClass}>
                Até
              </label>
              <input
                id="tf-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="tf-tecnico" className={labelClass}>
                Técnico
              </label>
              <select
                id="tf-tecnico"
                value={fTecnico}
                onChange={(e) => setFTecnico(e.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tf-status" className={labelClass}>
                Status
              </label>
              <select
                id="tf-status"
                value={fStatus}
                onChange={(e) => setFStatus(e.target.value as typeof fStatus)}
                className={inputClass}
              >
                <option value="">Todos</option>
                <option value="rascunho">Rascunho</option>
                <option value="enviado_validacao">Enviado p/ validação</option>
                <option value="validado">Validado</option>
                <option value="correcao_solicitada">Correção solicitada</option>
                <option value="rejeitado">Rejeitado</option>
              </select>
            </div>
          </div>

          {equipe.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum registro no período com esses filtros.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Técnico</th>
                    <th className="px-3 py-2 font-medium">OS</th>
                    <th className="px-3 py-2 font-medium">Serviço</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {equipe.map((r) => (
                    <tr
                      key={r.id}
                      className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                      onClick={() => setDetalhe(r)}
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDateOnlyISO(r.data_execucao)}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">
                        {r.tecnico?.full_name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-foreground">{r.os}</td>
                      <td
                        className="max-w-[220px] truncate px-3 py-2 text-muted-foreground"
                        title={r.servico_executado}
                      >
                        {r.tipo_servico?.nome ?? r.servico_executado}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {r.valor_servico != null ? formatCurrencyBRL(r.valor_servico) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadgeProducao status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ranking" className="mt-4">
          {ranking.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Sem produção validada no período para montar o ranking.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Técnico</th>
                    <th className="px-3 py-2 font-medium text-right">Serviços validados</th>
                    <th className="px-3 py-2 font-medium text-right">Valor validado</th>
                    <th className="px-3 py-2 font-medium text-right">% da meta</th>
                    <th className="px-3 py-2 font-medium">Nível</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.tecnico_id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{r.tecnico}</td>
                      <td className="px-3 py-2 text-right text-foreground">{r.validados}</td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {formatCurrencyBRL(r.valor_validado)}
                      </td>
                      <td className="px-3 py-2 text-right text-foreground">
                        {r.percentual != null ? `${r.percentual.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.nivel ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${NIVEL_BADGE[r.nivel] ?? "bg-muted text-muted-foreground"}`}
                          >
                            {r.nivel}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem meta</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {podeConfigurarMetas && (
          <TabsContent value="metas" className="mt-4">
            <MetasTab />
          </TabsContent>
        )}
      </Tabs>

      <DetalheProducaoDialog
        registro={detalhe}
        onClose={() => setDetalhe(null)}
        onEditar={() => setDetalhe(null)}
      />
    </div>
  );
}
