import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, List, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTimeITV } from "@/lib/format";
import {
  COLETA_COLUNAS,
  maskTelefone,
  rpcColetas,
  TIPO_LABEL,
  type ColetaSolicitacao,
  type ColetaStatus,
} from "@/lib/coletas";
import { ColetaCard } from "@/components/coletas/card";
import { ConcluirDialog } from "@/components/coletas/concluir-dialog";
import { DetalheColetaDialog } from "@/components/coletas/detalhe-dialog";
import { LinkDialog, type LinkGerado } from "@/components/coletas/link-dialog";
import { NovaSolicitacaoDialog } from "@/components/coletas/nova-solicitacao";
import { RelatorioColetas } from "@/components/coletas/relatorio";
import { StatusBadgeColeta, useUsuariosMap } from "@/components/coletas/shared";

export const Route = createFileRoute("/_authenticated/coletas")({
  head: () => ({
    meta: [
      { title: "Coletas — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Fila de coletas e entregas de TVs: cadastro do cliente, motorista e relatório diário." },
      { property: "og:title", content: "Coletas — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Fila de coletas e entregas de TVs: cadastro do cliente, motorista e relatório diário." },
    ],
  }),
  component: ColetasPage,
});

const FILTROS: { chave: string; label: string; status: ColetaStatus[] }[] = [
  { chave: "aguardando", label: "Aguardando cadastro", status: ["aguardando_cadastro"] },
  { chave: "pronto", label: "Pronto para coleta", status: ["pronto_coleta"] },
  { chave: "andamento", label: "Em andamento", status: ["assumida"] },
  { chave: "concluidas", label: "Concluídas", status: ["concluida"] },
  { chave: "canceladas", label: "Canceladas", status: ["cancelada"] },
];

function ColetasPage() {
  const { can, isAdmin, profile } = useAccess();
  const queryClient = useQueryClient();

  const podeCriar = isAdmin || can("coletas", "criar");
  const podeTudo = isAdmin || can("coletas", "visualizar_todos");
  const podeAssumir = isAdmin || can("coletas", "assumir");
  const podeConcluir = isAdmin || can("coletas", "concluir");
  const podeRelatorios = isAdmin || can("coletas", "relatorios");
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
  const [filtro, setFiltro] = useState(podeTudo ? "pronto" : "pronto");
  const [modo, setModo] = useState<"blocos" | "lista">("blocos");

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

  const filtrados = useMemo(() => {
    const conf = FILTROS.find((f) => f.chave === filtro);
    return todos.filter((c) => conf?.status.includes(c.status));
  }, [todos, filtro]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of FILTROS) c[f.chave] = todos.filter((t) => f.status.includes(t.status)).length;
    return c;
  }, [todos]);

  const resumoMotorista = useMemo(() => {
    const meuId = profile?.id;
    return {
      disponiveis: todos.filter((t) => t.status === "pronto_coleta" && !t.motorista_id).length,
      assumidas: todos.filter((t) => t.status === "assumida" && t.motorista_id === meuId).length,
      concluidas: todos.filter((t) => t.status === "concluida" && t.motorista_id === meuId).length,
    };
  }, [todos, profile?.id]);

  async function assumir(item: ColetaSolicitacao) {
    try {
      await rpcColetas("coletas_assumir", { p_id: item.id });
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success("Movimentação assumida.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível assumir.");
    }
  }

  const filtrosVisiveis = podeTudo ? FILTROS : FILTROS.filter((f) => ["pronto", "andamento", "concluidas"].includes(f.chave));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">Coletas</h1>
          <p className="text-sm text-muted-foreground">
            {podeTudo
              ? "Solicite o cadastro, acompanhe a fila e gere o relatório diário."
              : "Suas coletas e entregas de hoje. Assuma, execute e conclua."}
          </p>
        </div>
        {podeCriar && (
          <Button className="h-11" onClick={() => setNovoOpen(true)}>
            <Plus className="mr-1.5 size-4" /> Solicitar cadastro para coleta
          </Button>
        )}
      </header>

      {!podeTudo && (
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Disponíveis", resumoMotorista.disponiveis],
            ["Assumidas", resumoMotorista.assumidas],
            ["Concluídas", resumoMotorista.concluidas],
          ].map(([label, valor]) => (
            <div key={String(label)} className="rounded-xl border border-border bg-card p-3 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="font-display text-2xl font-bold text-foreground">{Number(valor)}</p>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="fila">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          {podeRelatorios && <TabsTrigger value="relatorio">Relatório Diário</TabsTrigger>}
        </TabsList>

        <TabsContent value="fila" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {filtrosVisiveis.map((f) => (
                <button
                  key={f.chave}
                  type="button"
                  onClick={() => setFiltro(f.chave)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filtro === f.chave ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {f.label} ({contagem[f.chave] ?? 0})
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant={modo === "blocos" ? "default" : "outline"} onClick={() => setModo("blocos")}>
                <LayoutGrid className="size-4" />
              </Button>
              <Button size="sm" variant={modo === "lista" ? "default" : "outline"} onClick={() => setModo("lista")}>
                <List className="size-4" />
              </Button>
            </div>
          </div>

          {listaQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {!listaQuery.isLoading && filtrados.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Sem dados
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
                  onAssumir={assumir}
                  onConcluir={setConcluindo}
                  onAbrir={setDetalhe}
                />
              ))}
            </div>
          ) : (
            filtrados.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">WhatsApp</th>
                      <th className="px-3 py-2 text-left">Bairro</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Cadastro</th>
                      <th className="px-3 py-2 text-left">Motorista</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Horário</th>
                      <th className="px-3 py-2 text-left">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((item) => (
                      <tr key={item.id} className="border-t border-border/60">
                        <td className="px-3 py-2 font-medium">{item.cliente_nome}</td>
                        <td className="px-3 py-2">{maskTelefone(item.whatsapp)}</td>
                        <td className="px-3 py-2">{item.bairro ?? "—"}</td>
                        <td className="px-3 py-2">{TIPO_LABEL[item.tipo]}</td>
                        <td className="px-3 py-2">{item.preenchido_em ? "Preenchido" : "Pendente"}</td>
                        <td className="px-3 py-2">{item.motorista_id ? (usuarios[item.motorista_id] ?? "—") : "—"}</td>
                        <td className="px-3 py-2"><StatusBadgeColeta status={item.status} /></td>
                        <td className="px-3 py-2">{formatDateTimeITV(item.created_at)}</td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="outline" onClick={() => setDetalhe(item)}>Abrir</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </TabsContent>

        {podeRelatorios && (
          <TabsContent value="relatorio" className="pt-4">
            <RelatorioColetas />
          </TabsContent>
        )}
      </Tabs>

      <NovaSolicitacaoDialog aberto={novoOpen} onClose={() => setNovoOpen(false)} onLink={setLink} />
      <LinkDialog dados={link} onClose={() => setLink(null)} />
      <ConcluirDialog item={concluindo} onClose={() => setConcluindo(null)} />
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
