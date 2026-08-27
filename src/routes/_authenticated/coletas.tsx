import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inputClass } from "@/lib/caixa";
import { formatDateTimeITV } from "@/lib/format";
import {
  COLETA_COLUNAS,
  labelStatus,
  mensagemErro,
  maskTelefone,
  rpcColetas,
  somenteDigitos,
  tempoEntre,
  TIPO_LABEL,
  type ColetaSolicitacao,
} from "@/lib/coletas";
import { ColetaCard } from "@/components/coletas/card";
import { ConcluirDialog } from "@/components/coletas/concluir-dialog";
import { CriarEntregaDialog } from "@/components/coletas/criar-entrega-dialog";
import { DetalheColetaDialog } from "@/components/coletas/detalhe-dialog";
import { EquipeExternaPainel } from "@/components/coletas/equipe-externa";
import { ExcluirDialog } from "@/components/coletas/excluir-dialog";
import { ModoExpediente } from "@/components/coletas/expediente";
import { LinkDialog, type LinkGerado } from "@/components/coletas/link-dialog";
import { LixeiraColetas } from "@/components/coletas/lixeira";
import { NovaSolicitacaoDialog } from "@/components/coletas/nova-solicitacao";
import { RelatorioColetas } from "@/components/coletas/relatorio";
import { RelatorioPeriodoColetas } from "@/components/coletas/relatorio-periodo";
import { StatusBadgeColeta, useUsuariosMap } from "@/components/coletas/shared";

export const Route = createFileRoute("/_authenticated/coletas")({
  head: () => ({
    meta: [
      { title: "Coletas e Entregas — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Fila de coletas e entregas de TVs: cadastro do cliente, motorista, equipe externa e relatório diário." },
      { property: "og:title", content: "Coletas e Entregas — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Fila de coletas e entregas de TVs: cadastro do cliente, motorista, equipe externa e relatório diário." },
    ],
  }),
  component: ColetasPage,
  errorComponent: () => (
    <div role="alert" className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
      Não foi possível abrir Coletas e Entregas agora. Atualize a página e tente novamente.
    </div>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-center text-sm text-muted-foreground">Página não encontrada.</p>
  ),
});

type Aba = "hoje" | "aguardando" | "coletas" | "entregas" | "concluidas";

function inicioDoDiaManaus(): number {
  const agora = new Date();
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(agora);
  return new Date(`${dia}T00:00:00-04:00`).getTime();
}

function ColetasPage() {
  const { can, isAdmin, profile } = useAccess();
  const queryClient = useQueryClient();

  const podeCriar = isAdmin || can("coletas", "criar");
  const podeTudo = isAdmin || can("coletas", "visualizar_todos");
  const podeAssumir = isAdmin || can("coletas", "assumir");
  const podeConcluir = isAdmin || can("coletas", "concluir");
  const podeRelatorios = isAdmin || can("coletas", "relatorios");
  const podeCriarEntrega = isAdmin || can("entregas", "criar");
  const podeExcluirColeta = isAdmin || can("coletas", "excluir");
  const podeExcluirEntrega = isAdmin || can("entregas", "excluir");
  const podeVerEquipe = isAdmin || can("motoristas", "localizacao_visualizar");
  const podeExpediente = isAdmin || can("motoristas", "localizacao_ativar");

  const permissoes = {
    editar: isAdmin || can("coletas", "editar"),
    atribuir: isAdmin || can("coletas", "atribuir"),
    cancelar: isAdmin || can("coletas", "cancelar"),
    criar: podeCriar,
    verSensiveis: isAdmin || can("coletas", "ver_dados_sensiveis"),
  };

  const [novoOpen, setNovoOpen] = useState(false);
  const [link, setLink] = useState<LinkGerado | null>(null);
  const [detalhe, setDetalhe] = useState<ColetaSolicitacao | null>(null);
  const [concluindo, setConcluindo] = useState<ColetaSolicitacao | null>(null);
  const [excluindo, setExcluindo] = useState<ColetaSolicitacao | null>(null);
  const [novaEntrega, setNovaEntrega] = useState<ColetaSolicitacao | null>(null);
  const [aba, setAba] = useState<Aba>("hoje");
  const [modo, setModo] = useState<"blocos" | "lista">("blocos");
  const [busca, setBusca] = useState("");

  const usuarios = useUsuariosMap(podeTudo);

  const listaQuery = useQuery({
    queryKey: ["coletas", "lista"],
    // Atualização leve: sem polling agressivo, apenas refresh periódico e ao focar.
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coletas_solicitacoes")
        .select(COLETA_COLUNAS)
        .order("created_at", { ascending: false })
        .limit(400);
      if (error) throw error;
      return data as unknown as ColetaSolicitacao[];
    },
  });

  const todos = useMemo(() => listaQuery.data ?? [], [listaQuery.data]);
  const inicioHoje = inicioDoDiaManaus();

  const grupos = useMemo(() => {
    const ativo = (c: ColetaSolicitacao) => ["pronto_coleta", "assumida"].includes(c.status);
    const concluidoHoje = (c: ColetaSolicitacao) =>
      !!c.concluido_em && new Date(c.concluido_em).getTime() >= inicioHoje;
    return {
      hoje: todos.filter((c) => ativo(c) || c.status === "aguardando_cadastro" || concluidoHoje(c)),
      aguardando: todos.filter((c) => c.status === "aguardando_cadastro"),
      coletas: todos.filter((c) => c.tipo === "coleta" && ativo(c)),
      entregas: todos.filter((c) => c.tipo === "entrega" && ativo(c)),
      concluidas: todos.filter((c) => c.status === "concluida" || c.status === "cancelada"),
    } satisfies Record<Aba, ColetaSolicitacao[]>;
  }, [todos, inicioHoje]);

  const termo = busca.trim().toLowerCase();
  const digitos = somenteDigitos(busca);
  const filtrados = useMemo(() => {
    const base = grupos[aba];
    if (!termo) return base;
    return base.filter(
      (c) =>
        c.cliente_nome.toLowerCase().includes(termo) ||
        (digitos.length >= 3 && c.whatsapp.includes(digitos)) ||
        (c.bairro ?? "").toLowerCase().includes(termo),
    );
  }, [grupos, aba, termo, digitos]);

  const entregasPorOrigem = useMemo(() => {
    const set = new Set<string>();
    for (const c of todos) if (c.coleta_origem_id) set.add(c.coleta_origem_id);
    return set;
  }, [todos]);

  const resumoMotorista = useMemo(() => {
    const meuId = profile?.id;
    return {
      pendentes: todos.filter((t) => t.status === "pronto_coleta" && !t.motorista_id).length,
      assumidas: todos.filter((t) => t.status === "assumida" && t.motorista_id === meuId).length,
      concluidas: todos.filter(
        (t) => t.status === "concluida" && t.motorista_id === meuId && !!t.concluido_em && new Date(t.concluido_em).getTime() >= inicioHoje,
      ).length,
    };
  }, [todos, profile?.id, inicioHoje]);

  /** Bairro da movimentação em andamento — usado como região aproximada no acompanhamento. */
  const bairroAtual = useMemo(() => {
    const emRota = todos.find((t) => t.status === "assumida" && t.motorista_id === profile?.id);
    return emRota?.bairro ?? null;
  }, [todos, profile?.id]);

  async function assumir(item: ColetaSolicitacao) {
    try {
      await rpcColetas("coletas_assumir", { p_id: item.id });
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success("Movimentação assumida.");
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível assumir esta movimentação."));
    }
  }

  const podeExcluirItem = (c: ColetaSolicitacao) =>
    c.tipo === "entrega" ? podeExcluirEntrega : podeExcluirColeta;

  const abas: { chave: Aba; label: string }[] = podeTudo
    ? [
        { chave: "hoje", label: "Hoje" },
        { chave: "aguardando", label: "Aguardando cadastro" },
        { chave: "coletas", label: "Coletas" },
        { chave: "entregas", label: "Entregas" },
        { chave: "concluidas", label: "Concluídas" },
      ]
    : [
        { chave: "hoje", label: "Hoje" },
        { chave: "coletas", label: "Coletas" },
        { chave: "entregas", label: "Entregas" },
        { chave: "concluidas", label: "Concluídas" },
      ];

  const vazio = {
    hoje: "Nenhuma movimentação para hoje.",
    aguardando: "Nenhum cliente aguardando cadastro.",
    coletas: "Nenhuma coleta pendente no momento.",
    entregas: "Nenhuma entrega pendente no momento.",
    concluidas: "Nenhuma movimentação concluída ainda.",
  }[aba];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Coletas e Entregas</h1>
          <p className="text-sm text-muted-foreground">
            {podeTudo
              ? "Solicite o cadastro, acompanhe a fila, gere entregas e o relatório diário."
              : "Suas coletas e entregas de hoje. Assuma, execute e conclua."}
          </p>
        </div>
        {podeCriar && (
          <Button className="h-11" onClick={() => setNovoOpen(true)}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" /> Nova Coleta
          </Button>
        )}
      </header>

      {podeExpediente && <ModoExpediente bairroAtual={bairroAtual} />}

      {!podeTudo && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Pendentes", resumoMotorista.pendentes],
            ["Assumidas", resumoMotorista.assumidas],
            ["Concluídas hoje", resumoMotorista.concluidas],
          ].map(([label, valor]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-display text-2xl font-bold text-foreground">{Number(valor)}</p>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="fila">
        <TabsList className="flex-wrap">
          <TabsTrigger value="fila">Movimentações</TabsTrigger>
          {podeRelatorios && <TabsTrigger value="relatorio">Relatório Diário</TabsTrigger>}
          {podeRelatorios && <TabsTrigger value="periodo">Por Período</TabsTrigger>}
          {podeVerEquipe && <TabsTrigger value="equipe">Equipe Externa</TabsTrigger>}
          {isAdmin && <TabsTrigger value="lixeira">Excluídos</TabsTrigger>}
        </TabsList>

        <TabsContent value="fila" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {abas.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setAba(f.chave)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    aba === f.chave ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {f.label} ({grupos[f.chave].length})
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant={modo === "blocos" ? "default" : "outline"} onClick={() => setModo("blocos")} aria-label="Ver em blocos">
                <LayoutGrid className="size-4" aria-hidden="true" />
              </Button>
              <Button size="sm" variant={modo === "lista" ? "default" : "outline"} onClick={() => setModo("lista")} aria-label="Ver em lista">
                <List className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              className={`${inputClass} h-11 pl-9`}
              placeholder="Buscar por cliente, telefone ou bairro"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label="Buscar movimentações"
            />
          </div>

          {listaQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {listaQuery.isError && (
            <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
              {mensagemErro(listaQuery.error, "Não foi possível carregar as movimentações.")}
              <div className="mt-3">
                <Button size="sm" variant="outline" onClick={() => void listaQuery.refetch()}>Tentar novamente</Button>
              </div>
            </div>
          )}

          {!listaQuery.isLoading && !listaQuery.isError && filtrados.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {termo ? "Nenhum registro encontrado para esta busca." : vazio}
            </p>
          )}

          {modo === "blocos" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtrados.map((item) => (
                <ColetaCard
                  key={item.id}
                  item={item}
                  motoristaNome={item.motorista_id ? usuarios[item.motorista_id] : undefined}
                  podeAssumir={podeAssumir}
                  podeConcluir={podeConcluir}
                  podeCriarEntrega={podeCriarEntrega && !entregasPorOrigem.has(item.id)}
                  podeExcluir={podeExcluirItem(item)}
                  onAssumir={assumir}
                  onConcluir={setConcluindo}
                  onAbrir={setDetalhe}
                  onCriarEntrega={setNovaEntrega}
                  onExcluir={setExcluindo}
                />
              ))}
            </div>
          ) : (
            filtrados.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">WhatsApp</th>
                      <th className="px-3 py-2 text-left">Bairro</th>
                      <th className="px-3 py-2 text-left">Motorista</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Atualizado</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((c) => (
                      <tr key={c.id} className="border-t border-border/60">
                        <td className="px-3 py-2">{TIPO_LABEL[c.tipo]}</td>
                        <td className="px-3 py-2">
                          <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setDetalhe(c)}>
                            {c.cliente_nome}
                          </button>
                        </td>
                        <td className="px-3 py-2">{maskTelefone(c.whatsapp)}</td>
                        <td className="px-3 py-2">{c.bairro ?? "—"}</td>
                        <td className="px-3 py-2">{c.motorista_id ? usuarios[c.motorista_id] ?? "—" : "—"}</td>
                        <td className="px-3 py-2"><StatusBadgeColeta status={c.status} tipo={c.tipo} /></td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatDateTimeITV(c.concluido_em ?? c.assumido_em ?? c.preenchido_em ?? c.created_at)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            {podeCriarEntrega && c.tipo === "coleta" && c.status === "concluida" && !entregasPorOrigem.has(c.id) && (
                              <Button size="sm" variant="outline" onClick={() => setNovaEntrega(c)}>Criar entrega</Button>
                            )}
                            {podeExcluirItem(c) && (
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setExcluindo(c)}>
                                Excluir
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {aba === "concluidas" && filtrados.some((c) => c.coleta_origem_id) && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-display text-sm font-bold text-foreground">Tempo entre coleta e entrega</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {filtrados
                  .filter((c) => c.coleta_origem_id && c.concluido_em)
                  .slice(0, 10)
                  .map((c) => {
                    const origem = todos.find((o) => o.id === c.coleta_origem_id);
                    const tempo = tempoEntre(origem?.concluido_em, c.concluido_em);
                    return (
                      <li key={c.id} className="flex justify-between gap-3">
                        <span>{c.cliente_nome}</span>
                        <span className="font-medium text-foreground">{tempo ?? "—"}</span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          )}
        </TabsContent>

        {podeRelatorios && (
          <TabsContent value="relatorio" className="pt-4">
            <RelatorioColetas />
          </TabsContent>
        )}
        {podeRelatorios && (
          <TabsContent value="periodo" className="pt-4">
            <RelatorioPeriodoColetas />
          </TabsContent>
        )}
        {podeVerEquipe && (
          <TabsContent value="equipe" className="pt-4">
            <EquipeExternaPainel />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="lixeira" className="pt-4">
            <LixeiraColetas />
          </TabsContent>
        )}
      </Tabs>

      <NovaSolicitacaoDialog aberto={novoOpen} onClose={() => setNovoOpen(false)} onLink={setLink} />
      <LinkDialog dados={link} onClose={() => setLink(null)} />
      <ConcluirDialog item={concluindo} onClose={() => setConcluindo(null)} />
      <CriarEntregaDialog coleta={novaEntrega} onClose={() => setNovaEntrega(null)} />
      <ExcluirDialog
        item={excluindo}
        temEntregaVinculada={!!excluindo && entregasPorOrigem.has(excluindo.id)}
        onClose={() => setExcluindo(null)}
      />
      <DetalheColetaDialog
        item={detalhe}
        onClose={() => setDetalhe(null)}
        usuarios={usuarios}
        permissoes={permissoes}
        onLink={setLink}
      />
    </div>
  );
}
