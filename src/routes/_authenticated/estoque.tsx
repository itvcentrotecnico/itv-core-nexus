import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ClipboardList,
  History,
  Info,
  Package,
  Pencil,
  Plus,
  Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import {
  POLEGADAS,
  STATUS_ESTOQUE,
  TIPO_LABEL,
  labelGaveta,
  rpcEstoque,
  type EstoqueBusca,
  type EstoqueItem,
  type EstoqueLocalizacao,
  type EstoqueMarca,
  type EstoqueTipo,
  type GavetaDetalhe,
} from "@/lib/estoque";
import { ItemEstoqueDialog } from "@/components/estoque/item-form";
import { GavetasCard, MarcasCard } from "@/components/estoque/cadastros";
import {
  BaixaDialog,
  EntradaDialog,
  HistoricoDialog,
  ReservaDialog,
} from "@/components/estoque/movimentacao";
import {
  ReservasLista,
  SolicitacoesLista,
  SolicitarDialog,
} from "@/components/estoque/solicitacoes";

export const Route = createFileRoute("/_authenticated/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque Técnico — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content: "Consulta e cadastro de Kits de LED e Placas Main por marca, modelo e gaveta.",
      },
      { property: "og:title", content: "Estoque Técnico — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Consulta e cadastro de Kits de LED e Placas Main por marca, modelo e gaveta.",
      },
    ],
  }),
  component: EstoquePage,
});

function StatusBadge({ item }: { item: EstoqueItem }) {
  const s = STATUS_ESTOQUE[item.status];
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", s.classe)}>
      ● {s.label}
    </span>
  );
}

interface AcoesItem {
  podeEditar: boolean;
  podeMovimentar: boolean;
  podeReservar: boolean;
  podeSolicitar: boolean;
  onEditar: () => void;
  onBaixa: () => void;
  onEntrada: () => void;
  onReservar: () => void;
  onSolicitar: () => void;
  onHistorico: () => void;
}

function ItemCard({
  item,
  podeEditar,
  podeMovimentar,
  podeReservar,
  podeSolicitar,
  onEditar,
  onBaixa,
  onEntrada,
  onReservar,
  onSolicitar,
  onHistorico,
}: { item: EstoqueItem } & AcoesItem) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {TIPO_LABEL[item.tipo]}
            </p>
            <p className="text-base font-semibold text-foreground">
              {item.marca_nome}
              {item.polegada ? ` · ${item.polegada}"` : ""}
            </p>
            <p className="font-mono text-sm text-foreground">{item.modelo}</p>
            {item.codigo_placa ? (
              <p className="font-mono text-sm text-muted-foreground">
                Código da placa: {item.codigo_placa}
              </p>
            ) : null}
          </div>
          <StatusBadge item={item} />
        </div>

        {item.compatibilidades.length > 0 ? (
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Compatibilidade</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {item.compatibilidades.map((c) => (
                <span key={c} className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">
                  {c}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Localização</p>
            <p className="font-medium text-foreground">{item.gaveta_label}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Disponível</p>
            <p className="font-medium text-foreground">
              {item.quantidade_disponivel}
              {item.tipo === "kit_led"
                ? item.quantidade_disponivel === 1
                  ? " kit"
                  : " kits"
                : item.quantidade_disponivel === 1
                  ? " placa"
                  : " placas"}
            </p>
            <p className="text-xs text-muted-foreground">
              Físico: {item.quantidade} · Reservado: {item.quantidade_reservada}
            </p>
            {item.minha_reserva && item.minha_reserva > 0 ? (
              <p className="text-xs font-medium text-primary">
                Reservado para a sua OS{item.minha_reserva_os ? ` ${item.minha_reserva_os}` : ""}:{" "}
                {item.minha_reserva}
              </p>
            ) : null}
          </div>
        </div>

        {item.observacao ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Info className="mt-0.5 size-3.5 shrink-0" /> {item.observacao}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {podeMovimentar ? (
            <>
              <Button size="sm" onClick={onBaixa} disabled={item.quantidade_disponivel <= 0}>
                <ArrowDownCircle className="mr-1.5 size-3.5" /> Dar baixa
              </Button>
              <Button size="sm" variant="outline" onClick={onEntrada}>
                <ArrowUpCircle className="mr-1.5 size-3.5" /> Entrada
              </Button>
            </>
          ) : null}
          {podeSolicitar && !podeReservar ? (
            <Button size="sm" onClick={onSolicitar} disabled={item.quantidade_disponivel <= 0}>
              <ClipboardList className="mr-1.5 size-3.5" /> Solicitar para OS
            </Button>
          ) : null}
          {podeReservar ? (
            <Button
              size="sm"
              variant={podeMovimentar ? "outline" : "default"}
              onClick={onReservar}
              disabled={item.quantidade_disponivel <= 0}
            >
              Reservar
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onHistorico}>
            <History className="mr-1.5 size-3.5" /> Histórico
          </Button>
          {podeEditar ? (
            <Button size="sm" variant="ghost" onClick={onEditar}>
              <Pencil className="mr-1.5 size-3.5" /> Editar cadastro
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function EstoquePage() {
  const { can, isAdmin } = useAccess();
  const podeVer = isAdmin || can("estoque", "visualizar");
  const podeCriar = isAdmin || can("estoque", "criar");
  const podeEditar = isAdmin || can("estoque", "editar");
  const podeAdministrar = isAdmin || can("estoque", "administrar");
  const podeMovimentar = isAdmin || can("estoque", "movimentar");
  const podeEstornar = isAdmin || can("estoque", "estornar");
  const podeReservar = isAdmin || can("estoque", "reservar");
  const podeSolicitar = isAdmin || can("estoque", "solicitar");

  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"" | EstoqueTipo>("");
  const [marca, setMarca] = useState("");
  const [polegada, setPolegada] = useState("");
  const [gaveta, setGaveta] = useState("");
  const [disponibilidade, setDisponibilidade] = useState("");
  const [formTipo, setFormTipo] = useState<EstoqueTipo | null>(null);
  const [editando, setEditando] = useState<EstoqueItem | null>(null);
  const [gavetaAberta, setGavetaAberta] = useState<string | null>(null);
  const [baixaItem, setBaixaItem] = useState<EstoqueItem | null>(null);
  const [baixaReserva, setBaixaReserva] = useState<string | null>(null);
  const [entradaItem, setEntradaItem] = useState<EstoqueItem | null>(null);
  const [reservaItem, setReservaItem] = useState<EstoqueItem | null>(null);
  const [solicitarItem, setSolicitarItem] = useState<EstoqueItem | null>(null);
  const [historicoItem, setHistoricoItem] = useState<EstoqueItem | null>(null);

  const marcasQuery = useQuery({
    queryKey: ["estoque", "marcas"],
    enabled: podeVer,
    queryFn: async (): Promise<EstoqueMarca[]> => {
      const { data, error } = await supabase
        .from("estoque_marcas")
        .select("id, nome, ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as EstoqueMarca[];
    },
  });

  const locaisQuery = useQuery({
    queryKey: ["estoque", "localizacoes"],
    enabled: podeVer,
    queryFn: async (): Promise<EstoqueLocalizacao[]> => {
      const { data, error } = await supabase
        .from("estoque_localizacoes")
        .select("id, grupo, numero, codigo, descricao, ativo")
        .order("grupo")
        .order("numero");
      if (error) throw error;
      return (data ?? []) as EstoqueLocalizacao[];
    },
  });

  const buscaQuery = useQuery({
    queryKey: ["estoque", "busca", busca, tipo, marca, polegada, gaveta, disponibilidade],
    enabled: podeVer,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      rpcEstoque<EstoqueBusca>("estoque_buscar", {
        p_busca: busca.trim() || null,
        p_tipo: tipo || null,
        p_marca_id: marca || null,
        p_polegada: polegada || null,
        p_localizacao_id: gaveta || null,
        p_disponibilidade: disponibilidade || null,
        p_limit: 60,
      }),
  });

  const gavetaQuery = useQuery({
    queryKey: ["estoque", "gaveta", gavetaAberta],
    enabled: !!gavetaAberta,
    queryFn: async () => rpcEstoque<GavetaDetalhe>("estoque_gaveta_detalhe", { p_id: gavetaAberta }),
  });

  const marcas = marcasQuery.data ?? [];
  const locais = locaisQuery.data ?? [];
  const itens = buscaQuery.data?.itens ?? [];
  const filtrando = useMemo(
    () => !!(busca.trim() || tipo || marca || polegada || gaveta || disponibilidade),
    [busca, tipo, marca, polegada, gaveta, disponibilidade],
  );

  if (!podeVer) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acesso restrito</CardTitle>
          <CardDescription>
            Você não tem permissão para consultar o Estoque Técnico. Fale com o administrador.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const consulta = (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 -mx-1 bg-background/95 px-1 py-2 backdrop-blur">
        <label className="sr-only" htmlFor="estoque-busca">
          Buscar peça
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="estoque-busca"
            className={cn(inputClass, "h-12 pl-9 text-base")}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por modelo, marca, código da placa ou compatibilidade"
            autoComplete="off"
          />
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["", "Todos"],
              ["kit_led", "Kit LED"],
              ["placa_main", "Placa Main"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setTipo(v as "" | EstoqueTipo)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                tipo === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select
          className={inputClass}
          value={marca}
          onChange={(e) => setMarca(e.target.value)}
          aria-label="Marca"
        >
          <option value="">Todas as marcas</option>
          {marcas.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={polegada}
          onChange={(e) => setPolegada(e.target.value)}
          aria-label="Polegada"
          disabled={tipo === "placa_main"}
        >
          <option value="">Todas as polegadas</option>
          {POLEGADAS.map((p) => (
            <option key={p} value={p}>
              {p}&quot;
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={gaveta}
          onChange={(e) => setGaveta(e.target.value)}
          aria-label="Gaveta"
        >
          <option value="">Todas as gavetas</option>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {labelGaveta(l)}
            </option>
          ))}
        </select>
        <select
          className={inputClass}
          value={disponibilidade}
          onChange={(e) => setDisponibilidade(e.target.value)}
          aria-label="Disponibilidade"
        >
          <option value="">Toda a disponibilidade</option>
          <option value="com_estoque">Em estoque</option>
          <option value="baixo">Estoque baixo</option>
          <option value="sem_estoque">Sem estoque</option>
        </select>
      </div>

      {buscaQuery.isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : itens.length === 0 ? (
        <Card>
          <CardContent className="space-y-1 py-10 text-center">
            <Package className="mx-auto size-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">
              {filtrando
                ? "Nenhuma peça cadastrada corresponde à pesquisa."
                : "Nenhuma peça cadastrada ainda."}
            </p>
            {filtrando ? (
              <p className="text-xs text-muted-foreground">
                Peça não localizada no estoque — isso não significa que a peça não exista; ela ainda
                pode não ter sido cadastrada.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {buscaQuery.data?.total ?? itens.length} resultado(s)
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {itens.map((i) => (
              <ItemCard
                key={i.id}
                item={i}
                podeEditar={podeEditar}
                podeMovimentar={podeMovimentar}
                podeReservar={podeReservar}
                podeSolicitar={podeSolicitar}
                onEditar={() => {
                  setEditando(i);
                  setFormTipo(i.tipo);
                }}
                onBaixa={() => {
                  setBaixaReserva(null);
                  setBaixaItem(i);
                }}
                onEntrada={() => setEntradaItem(i)}
                onReservar={() => setReservaItem(i)}
                onSolicitar={() => setSolicitarItem(i)}
                onHistorico={() => setHistoricoItem(i)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Estoque Técnico</h1>
          <p className="text-sm text-muted-foreground">
            Consulta rápida de Kits de LED e Placas Main por modelo, compatibilidade ou gaveta.
          </p>
        </div>
        {podeCriar ? (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                setEditando(null);
                setFormTipo("kit_led");
              }}
            >
              <Plus className="mr-1.5 size-4" /> Novo Kit de LED
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditando(null);
                setFormTipo("placa_main");
              }}
            >
              <Plus className="mr-1.5 size-4" /> Nova Placa Main
            </Button>
          </div>
        ) : null}
      </div>

      <Tabs defaultValue="consulta">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="consulta">Consultar peça</TabsTrigger>
          {podeReservar ? (
            <TabsTrigger value="solicitacoes">Solicitações de peças</TabsTrigger>
          ) : podeSolicitar ? (
            <TabsTrigger value="minhas">Minhas solicitações</TabsTrigger>
          ) : null}
          {podeReservar ? <TabsTrigger value="reservas">Reservas ativas</TabsTrigger> : null}
          {podeAdministrar ? <TabsTrigger value="cadastros">Marcas e gavetas</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="consulta" className="mt-4">
          {consulta}
        </TabsContent>
        {podeReservar ? (
          <>
            <TabsContent value="solicitacoes" className="mt-4">
              <SolicitacoesLista escopo="todas" podeAnalisar />
            </TabsContent>
            <TabsContent value="reservas" className="mt-4">
              <ReservasLista podeGerenciar />
            </TabsContent>
          </>
        ) : podeSolicitar ? (
          <TabsContent value="minhas" className="mt-4">
            <SolicitacoesLista escopo="minhas" podeAnalisar={false} />
          </TabsContent>
        ) : null}
        {podeAdministrar ? (
          <TabsContent value="cadastros" className="mt-4 space-y-4">
            <MarcasCard marcas={marcas} podeAdministrar={podeAdministrar} />
            <GavetasCard
              localizacoes={locais}
              podeAdministrar={podeAdministrar}
              onAbrirGaveta={setGavetaAberta}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      <SolicitarDialog item={solicitarItem} onClose={() => setSolicitarItem(null)} />

      <BaixaDialog
        item={baixaItem}
        reservaId={baixaReserva}
        onClose={() => {
          setBaixaItem(null);
          setBaixaReserva(null);
        }}
      />
      <EntradaDialog item={entradaItem} onClose={() => setEntradaItem(null)} />
      <ReservaDialog item={reservaItem} onClose={() => setReservaItem(null)} />
      <HistoricoDialog
        item={historicoItem}
        podeMovimentar={podeMovimentar}
        podeEstornar={podeEstornar}
        onClose={() => setHistoricoItem(null)}
        onBaixarReserva={(reservaId) => {
          setBaixaReserva(reservaId);
          setBaixaItem(historicoItem);
          setHistoricoItem(null);
        }}
      />

      <ItemEstoqueDialog
        aberto={!!formTipo}
        tipo={formTipo ?? "kit_led"}
        item={editando}
        marcas={marcas}
        localizacoes={locais}
        onClose={() => {
          setFormTipo(null);
          setEditando(null);
        }}
      />

      <Dialog open={!!gavetaAberta} onOpenChange={(o) => !o && setGavetaAberta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{gavetaQuery.data?.gaveta.label ?? "Gaveta"}</DialogTitle>
            <DialogDescription>
              Itens armazenados: {gavetaQuery.data?.itens.length ?? 0}
            </DialogDescription>
          </DialogHeader>
          <ul className="divide-y divide-border">
            {(gavetaQuery.data?.itens ?? []).map((i) => (
              <li key={i.id} className="py-2 text-sm">
                <span className="font-medium text-foreground">{i.marca_nome}</span>{" "}
                <span className="font-mono">{i.modelo}</span>
                {i.codigo_placa ? (
                  <span className="font-mono text-muted-foreground"> · {i.codigo_placa}</span>
                ) : null}
                <span className="block text-xs text-muted-foreground">
                  {i.quantidade} {i.tipo === "kit_led" ? "kit(s)" : "placa(s)"}
                </span>
              </li>
            ))}
            {(gavetaQuery.data?.itens ?? []).length === 0 ? (
              <li className="py-4 text-center text-sm text-muted-foreground">Gaveta vazia.</li>
            ) : null}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
