import { Fragment, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Copy, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Carregando,
  ConfirmarAcao,
  PillStatus,
  SecaoAdmin,
  SemDados,
  TabelaAdmin,
} from "@/components/admin/shared";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  STATUS_ENTREGA,
  TIPO_ENTREGA,
  type ComissaoEntrega,
  type ComissaoEntregaResumo,
  type ComissaoEntregaStatus,
  type Entregador,
} from "@/lib/comissao-entrega";

export const Route = createFileRoute("/_authenticated/comissao-entrega")({
  head: () => ({
    meta: [
      { title: "Comissão de Entrega — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content:
          "Validação, pagamento e relatório do incentivo de entrega vinculado ao Caixa Diário.",
      },
      { property: "og:title", content: "Comissão de Entrega — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Acompanhe as comissões de entrega geradas nos lançamentos do caixa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ComissaoEntregaPage,
});

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

/** Semana operacional: segunda a domingo (America/Manaus, datas ISO). */
function parseDataISO(v: string): Date {
  const [y = 1970, m = 1, d = 1] = v.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function somarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function segundaFeira(d: Date): Date {
  return somarDias(d, -((d.getUTCDay() + 6) % 7));
}

interface BalcaoRelatorio {
  key: string;
  label: string;
  entregas: number;
  comAvaliacao: number;
  gerado: number;
  validado: number;
  pago: number;
}

interface LinhaRelatorio {
  id: string;
  nome: string;
  periodos: BalcaoRelatorio[];
  total: BalcaoRelatorio;
}

function balcaoVazio(key: string, label: string): BalcaoRelatorio {
  return { key, label, entregas: 0, comAvaliacao: 0, gerado: 0, validado: 0, pago: 0 };
}

function somarBalcao(b: BalcaoRelatorio, item: ComissaoEntrega) {
  b.entregas += 1;
  if (item.avaliacao_confirmada) b.comAvaliacao += 1;
  const v = Number(item.valor);
  if (item.status === "validada" || item.status === "paga") b.validado += v;
  if (item.status === "paga") b.pago += v;
  b.gerado += v;
}

type Acao = "validar" | "rejeitar" | "pagar" | "cancelar";

function ComissaoEntregaPage() {
  const { can, isAdmin, isLoading } = useAccess();
  const queryClient = useQueryClient();
  const hoje = todayManausISO();

  const [inicio, setInicio] = useState(monthStart(hoje));
  const [fim, setFim] = useState(hoje);
  const [entregadorId, setEntregadorId] = useState("");
  const [status, setStatus] = useState<"" | ComissaoEntregaStatus>("");
  const [os, setOs] = useState("");
  const [acao, setAcao] = useState<{ item: ComissaoEntrega; tipo: Acao } | null>(null);
  const [divisao, setDivisao] = useState<"semana" | "dia">("semana");

  const podeValidar = isAdmin || can("comissao_entrega", "validar");
  const podePagar = isAdmin || can("comissao_entrega", "pagar");
  const podeCancelar = isAdmin || can("comissao_entrega", "cancelar");

  const filtros = useMemo(
    () => ({
      ...(inicio ? { p_inicio: inicio } : {}),
      ...(fim ? { p_fim: fim } : {}),
      ...(entregadorId ? { p_entregador_id: entregadorId } : {}),
      ...(status ? { p_status: status } : {}),
      ...(os.trim() ? { p_os: os.trim() } : {}),
    }),
    [inicio, fim, entregadorId, status, os],
  );

  const listaQuery = useQuery({
    queryKey: ["comissao-entrega", "lista", filtros],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comissao_entrega_listar", filtros);
      if (error) throw error;
      const res = data as unknown as {
        ok: boolean;
        itens?: ComissaoEntrega[];
        pode_gerir?: boolean;
      };
      return { itens: res?.itens ?? [], podeGerir: !!res?.pode_gerir };
    },
  });

  const relatorioQuery = useQuery({
    queryKey: ["comissao-entrega", "relatorio", filtros],
    queryFn: async () => {
      const { p_os: _os, ...args } = filtros;
      const { data, error } = await supabase.rpc("comissao_entrega_relatorio", args);
      if (error) throw error;
      const res = data as unknown as { ok: boolean; itens?: ComissaoEntregaResumo[] };
      return res?.itens ?? [];
    },
  });

  const entregadoresQuery = useQuery({
    queryKey: ["comissao-entrega", "entregadores"],
    staleTime: 60_000,
    queryFn: async (): Promise<Entregador[]> => {
      const { data, error } = await supabase.rpc("comissao_entrega_entregadores");
      if (error) throw error;
      return (data ?? []) as unknown as Entregador[];
    },
  });

  async function executar(item: ComissaoEntrega, tipo: Acao, motivo: string) {
    const { data, error } = await supabase.rpc("comissao_entrega_status_alterar", {
      p_id: item.id,
      p_acao: tipo,
      ...(motivo ? { p_motivo: motivo } : {}),
    });
    const res = data as unknown as { ok: boolean; message?: string };
    if (error || !res?.ok) {
      toast.error(res?.message ?? "Não foi possível concluir a operação.");
      return;
    }
    toast.success("Comissão de entrega atualizada.");
    setAcao(null);
    void queryClient.invalidateQueries({ queryKey: ["comissao-entrega"] });
  }

  const periodoSpan = (parseDataISO(fim).getTime() - parseDataISO(inicio).getTime()) / 86_400_000;
  const divisaoEfetiva = divisao === "dia" || periodoSpan <= 7 ? "dia" : "semana";

  const relatorioPeriodo = useMemo<LinhaRelatorio[]>(() => {
    const lancamentos = listaQuery.data?.itens ?? [];
    const ativos = lancamentos.filter((i) => i.status !== "cancelada");
    if (!inicio || !fim || ativos.length === 0) return [];
    const porDia = divisaoEfetiva === "dia";
    const porMotorista = new Map<string, Map<string, BalcaoRelatorio>>();
    const nomes = new Map<string, string>();
    for (const item of ativos) {
      nomes.set(item.entregador_id, item.entregador);
      const periodos =
        porMotorista.get(item.entregador_id) ?? new Map<string, BalcaoRelatorio>();
      let key: string;
      let label: string;
      if (porDia) {
        key = item.data;
        label = formatDateOnlyISO(item.data);
      } else {
        const iniSemana = dataISO(segundaFeira(parseDataISO(item.data)));
        const fimSemana = dataISO(somarDias(parseDataISO(iniSemana), 6));
        key = iniSemana;
        label = `Semana ${formatDateOnlyISO(iniSemana)} – ${formatDateOnlyISO(fimSemana)}`;
      }
      let b = periodos.get(key);
      if (!b) {
        b = balcaoVazio(key, label);
        periodos.set(key, b);
      }
      somarBalcao(b, item);
      porMotorista.set(item.entregador_id, periodos);
    }
    return [...porMotorista.entries()]
      .map(([id, periodos]) => {
        const ordenados = [...periodos.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
        const total = ordenados.reduce(
          (acc, p) => {
            acc.entregas += p.entregas;
            acc.comAvaliacao += p.comAvaliacao;
            acc.gerado += p.gerado;
            acc.validado += p.validado;
            acc.pago += p.pago;
            return acc;
          },
          balcaoVazio("total", "Total"),
        );
        return { id, nome: nomes.get(id) ?? "—", periodos: ordenados, total };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [listaQuery.data, inicio, fim, divisao]);

  if (isLoading) return <Carregando />;

  const itens = listaQuery.data?.itens ?? [];
  const totalGerado = itens
    .filter((i) => i.status !== "cancelada")
    .reduce((acc, i) => acc + Number(i.valor), 0);
  const totalPago = itens
    .filter((i) => i.status === "paga")
    .reduce((acc, i) => acc + Number(i.valor), 0);

  const totalGeral = relatorioPeriodo.reduce(
    (acc, m) => {
      acc.entregas += m.total.entregas;
      acc.comAvaliacao += m.total.comAvaliacao;
      acc.gerado += m.total.gerado;
      acc.validado += m.total.validado;
      acc.pago += m.total.pago;
      return acc;
    },
    balcaoVazio("total-geral", "Total geral"),
  );

  function textoRelatorioPeriodo(): string {
    const linhas: string[] = [
      `*Relatório de entregas — ${formatDateOnlyISO(inicio)} a ${formatDateOnlyISO(fim)}*`,
    ];
    for (const m of relatorioPeriodo) {
      linhas.push("", `*${m.nome}*`);
      for (const p of m.periodos) {
        linhas.push(
          `• ${p.label}: ${p.entregas} ${p.entregas === 1 ? "entrega" : "entregas"} · ${formatCurrencyBRL(p.gerado)}` +
            (p.comAvaliacao > 0 ? ` · ${p.comAvaliacao} com avaliação` : ""),
        );
      }
      linhas.push(
        `*Total: ${m.total.entregas} ${m.total.entregas === 1 ? "entrega" : "entregas"} · ${formatCurrencyBRL(m.total.gerado)}*`,
      );
    }
    linhas.push(
      "",
      `*Total geral: ${totalGeral.entregas} ${totalGeral.entregas === 1 ? "entrega" : "entregas"} · ${formatCurrencyBRL(totalGeral.gerado)}*`,
    );
    return linhas.join("\n");
  }

  async function copiarRelatorio() {
    try {
      await navigator.clipboard.writeText(textoRelatorioPeriodo());
      toast.success("Relatório copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar o relatório.");
    }
  }

  function enviarWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(textoRelatorioPeriodo())}`, "_blank");
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Comissão de Entrega</h1>
          <p className="text-sm text-muted-foreground">
            Incentivo operacional gerado nos lançamentos do Caixa. Não integra faturamento nem
            comissão técnica.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void listaQuery.refetch()}>
          <RefreshCw className="mr-2 size-4" /> Atualizar
        </Button>
      </header>

      <SecaoAdmin titulo="Filtros">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className={labelClass} htmlFor="ce-mes">
            Mês do relatório
          </label>
          <input
            id="ce-mes"
            type="month"
            className={inputClass + " w-auto"}
            value={inicio.slice(0, 7)}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              const [y = 0, m = 1] = v.split("-").map(Number);
              const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
              setInicio(`${v}-01`);
              setFim(`${v}-${String(ultimo).padStart(2, "0")}`);
            }}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className={labelClass} htmlFor="ce-inicio">
              Início
            </label>
            <input
              id="ce-inicio"
              type="date"
              className={inputClass}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ce-fim">
              Fim
            </label>
            <input
              id="ce-fim"
              type="date"
              className={inputClass}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ce-entregador-filtro">
              Entregador
            </label>
            <select
              id="ce-entregador-filtro"
              className={inputClass}
              value={entregadorId}
              onChange={(e) => setEntregadorId(e.target.value)}
            >
              <option value="">Todos</option>
              {(entregadoresQuery.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="ce-status-filtro">
              Status
            </label>
            <select
              id="ce-status-filtro"
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as "" | ComissaoEntregaStatus)}
            >
              <option value="">Todos</option>
              {Object.entries(STATUS_ENTREGA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="ce-os-filtro">
              OS
            </label>
            <input
              id="ce-os-filtro"
              className={inputClass}
              value={os}
              onChange={(e) => setOs(e.target.value)}
              placeholder="Nº da OS"
            />
          </div>
        </div>
      </SecaoAdmin>

      <Tabs defaultValue="lista">
        <TabsList>
          <TabsTrigger value="lista">Comissões</TabsTrigger>
          <TabsTrigger value="relatorio">Por entregador</TabsTrigger>
          <TabsTrigger value="periodos">Por período</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="mt-4">
          <SecaoAdmin
            titulo="Comissões geradas"
            descricao={`Total no período: ${formatCurrencyBRL(totalGerado)} · Pago: ${formatCurrencyBRL(totalPago)}`}
          >
            {listaQuery.isLoading ? (
              <Carregando />
            ) : itens.length === 0 ? (
              <SemDados label="Nenhuma comissão de entrega no período" />
            ) : (
              <TabelaAdmin
                cabecalho={["Data", "OS", "Entregador", "Tipo", "Valor", "Status", "Ações"]}
              >
                {itens.map((i) => (
                  <tr key={i.id}>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateOnlyISO(i.data)}</td>
                    <td className="px-3 py-2">{i.os ?? "—"}</td>
                    <td className="px-3 py-2 font-medium text-foreground">{i.entregador}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {TIPO_ENTREGA[i.tipo]}
                      {i.tipo === "entrega_avaliacao" ? (
                        <span className="ml-2 text-xs">
                          {i.avaliacao_confirmada
                            ? "· avaliação confirmada"
                            : "· avaliação pendente"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatCurrencyBRL(Number(i.valor))}
                    </td>
                    <td className="px-3 py-2">
                      <PillStatus tom={STATUS_ENTREGA[i.status].tom}>
                        {STATUS_ENTREGA[i.status].label}
                      </PillStatus>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {podeValidar &&
                        (i.status === "gerada" || i.status === "pendente_validacao") ? (
                          <>
                            <Button size="sm" onClick={() => void executar(i, "validar", "")}>
                              Validar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAcao({ item: i, tipo: "rejeitar" })}
                            >
                              Rejeitar
                            </Button>
                          </>
                        ) : null}
                        {podePagar && i.status === "validada" ? (
                          <Button size="sm" onClick={() => void executar(i, "pagar", "")}>
                            Marcar como paga
                          </Button>
                        ) : null}
                        {podeCancelar && i.status !== "cancelada" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setAcao({ item: i, tipo: "cancelar" })}
                          >
                            Cancelar
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </TabelaAdmin>
            )}
          </SecaoAdmin>
        </TabsContent>

        <TabsContent value="relatorio" className="mt-4">
          <SecaoAdmin
            titulo="Desempenho por entregador"
            descricao="Quantidade de entregas, avaliações e valores do período."
          >
            {relatorioQuery.isLoading ? (
              <Carregando />
            ) : (relatorioQuery.data ?? []).length === 0 ? (
              <SemDados label="Sem dados no período" />
            ) : (
              <TabelaAdmin
                cabecalho={[
                  "Entregador",
                  "Entregas",
                  "Com avaliação",
                  "Gerado",
                  "Validado",
                  "Pago",
                  "Pendente",
                ]}
              >
                {(relatorioQuery.data ?? []).map((r) => (
                  <tr key={r.entregador_id}>
                    <td className="px-3 py-2 font-medium text-foreground">{r.entregador}</td>
                    <td className="px-3 py-2">{r.entregas}</td>
                    <td className="px-3 py-2">
                      {r.com_avaliacao} ({r.avaliacoes_confirmadas} confirmadas)
                    </td>
                    <td className="px-3 py-2">{formatCurrencyBRL(Number(r.valor_gerado))}</td>
                    <td className="px-3 py-2">{formatCurrencyBRL(Number(r.valor_validado))}</td>
                    <td className="px-3 py-2">{formatCurrencyBRL(Number(r.valor_pago))}</td>
                    <td className="px-3 py-2">{formatCurrencyBRL(Number(r.valor_pendente))}</td>
                  </tr>
                ))}
              </TabelaAdmin>
            )}
          </SecaoAdmin>
        </TabsContent>

        <TabsContent value="periodos" className="mt-4">
          <SecaoAdmin
            titulo="Relatório por período"
            descricao={`Dividido por ${divisaoEfetiva === "semana" ? "semana" : "dia"} dentro do período filtrado — ${formatDateOnlyISO(inicio)} a ${formatDateOnlyISO(fim)}. Lançamentos cancelados não entram.`}
            acoes={
              <>
                <Button
                  size="sm"
                  variant={divisao === "semana" ? "secondary" : "ghost"}
                  onClick={() => setDivisao("semana")}
                >
                  Por semana
                </Button>
                <Button
                  size="sm"
                  variant={divisao === "dia" ? "secondary" : "ghost"}
                  onClick={() => setDivisao("dia")}
                >
                  Por dia
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={relatorioPeriodo.length === 0}
                  onClick={() => void copiarRelatorio()}
                >
                  <Copy className="mr-2 size-4" /> Copiar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={relatorioPeriodo.length === 0}
                  onClick={enviarWhatsApp}
                >
                  <MessageCircle className="mr-2 size-4" /> WhatsApp
                </Button>
              </>
            }
          >
            {relatorioPeriodo.length === 0 ? (
              <SemDados label="Sem entregas no período" />
            ) : (
              <TabelaAdmin
                cabecalho={[
                  "Período",
                  "Entregas",
                  "Com avaliação",
                  "Gerado",
                  "Validado",
                  "Pago",
                ]}
              >
                {relatorioPeriodo.map((m) => (
                  <Fragment key={m.id}>
                    <tr className="bg-muted/50">
                      <td colSpan={6} className="px-3 py-2 font-semibold text-foreground">
                        {m.nome}
                      </td>
                    </tr>
                    {m.periodos.map((p) => (
                      <tr key={`${m.id}-${p.key}`}>
                        <td className="px-3 py-2 whitespace-nowrap">{p.label}</td>
                        <td className="px-3 py-2">{p.entregas}</td>
                        <td className="px-3 py-2">{p.comAvaliacao}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatCurrencyBRL(p.gerado)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatCurrencyBRL(p.validado)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatCurrencyBRL(p.pago)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-border font-medium">
                      <td className="px-3 py-2">Total — {m.nome}</td>
                      <td className="px-3 py-2">{m.total.entregas}</td>
                      <td className="px-3 py-2">{m.total.comAvaliacao}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatCurrencyBRL(m.total.gerado)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatCurrencyBRL(m.total.validado)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatCurrencyBRL(m.total.pago)}
                      </td>
                    </tr>
                  </Fragment>
                ))}
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2">Total geral</td>
                  <td className="px-3 py-2">{totalGeral.entregas}</td>
                  <td className="px-3 py-2">{totalGeral.comAvaliacao}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatCurrencyBRL(totalGeral.gerado)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatCurrencyBRL(totalGeral.validado)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatCurrencyBRL(totalGeral.pago)}
                  </td>
                </tr>
              </TabelaAdmin>
            )}
          </SecaoAdmin>
        </TabsContent>
      </Tabs>

      <ConfirmarAcao
        aberto={!!acao}
        titulo={
          acao?.tipo === "cancelar"
            ? "Cancelar comissão de entrega"
            : "Rejeitar comissão de entrega"
        }
        descricao="A ação fica registrada na auditoria com o motivo informado."
        pedirMotivo
        confirmarLabel="Confirmar"
        onCancel={() => setAcao(null)}
        onConfirm={async (motivo) => {
          if (acao) await executar(acao.item, acao.tipo, motivo);
        }}
      />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Bike className="size-3.5" aria-hidden="true" /> A comissão de entrega nunca é paga
        automaticamente.
      </div>
    </div>
  );
}
