/**
 * ESTOQUE TÉCNICO — controle gerencial: movimentações, reposição e painel de gavetas.
 * Somente leitura: nenhuma quantidade muda por aqui.
 */
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, PackageSearch } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { inputClass } from "@/lib/caixa";
import { formatDateTimeITV } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  MOTIVO_LABEL,
  TIPO_LABEL,
  rpcEstoque,
  type EstoqueLocalizacao,
  type EstoqueMarca,
  type GavetaPainelLinha,
  type MovimentoLinha,
  type ReposicaoLinha,
} from "@/lib/estoque";

function Vazio({ texto }: { texto: string }) {
  return (
    <p className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
      <PackageSearch className="size-5" />
      {texto}
    </p>
  );
}

/** Histórico consolidado de entradas e saídas com filtros operacionais. */
export function MovimentacoesCard({
  marcas,
  localizacoes,
}: {
  marcas: EstoqueMarca[];
  localizacoes: EstoqueLocalizacao[];
}) {
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [tipo, setTipo] = useState("");
  const [familia, setFamilia] = useState("");
  const [marca, setMarca] = useState("");
  const [gaveta, setGaveta] = useState("");
  const [busca, setBusca] = useState("");
  const [os, setOs] = useState("");

  const query = useQuery({
    queryKey: ["estoque", "movimentos", inicio, fim, tipo, familia, marca, gaveta, busca, os],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      rpcEstoque<{ ok: true; total: number; linhas: MovimentoLinha[] }>("estoque_movimentos_listar", {
        p_inicio: inicio || null,
        p_fim: fim || null,
        p_tipo: tipo || null,
        p_familia: familia || null,
        p_marca_id: marca || null,
        p_localizacao_id: gaveta || null,
        p_busca: busca.trim() || null,
        p_os: os.trim() || null,
        p_limit: 100,
      }),
  });

  const linhas = query.data?.linhas ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Movimentações</CardTitle>
        <CardDescription>
          Todas as entradas e saídas registradas, com responsável, técnico e OS.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            type="date"
            className={inputClass}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            aria-label="Data inicial"
          />
          <input
            type="date"
            className={inputClass}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            aria-label="Data final"
          />
          <select
            className={inputClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            aria-label="Entrada ou saída"
          >
            <option value="">Entradas e saídas</option>
            <option value="entrada">Somente entradas</option>
            <option value="saida">Somente saídas</option>
          </select>
          <select
            className={inputClass}
            value={familia}
            onChange={(e) => setFamilia(e.target.value)}
            aria-label="Família"
          >
            <option value="">Kits e placas</option>
            <option value="kit_led">Kits de LED</option>
            <option value="placa_main">Placas Main</option>
          </select>
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
            value={gaveta}
            onChange={(e) => setGaveta(e.target.value)}
            aria-label="Gaveta"
          >
            <option value="">Todas as gavetas</option>
            {localizacoes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.grupo} — Gaveta {String(l.numero).padStart(2, "0")}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            value={os}
            onChange={(e) => setOs(e.target.value)}
            placeholder="OS"
            aria-label="OS"
          />
          <input
            className={inputClass}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Modelo, marca ou código"
            aria-label="Buscar peça"
          />
        </div>

        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : linhas.length === 0 ? (
          <Vazio texto="Nenhuma movimentação no período ou filtro escolhido." />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {query.data?.total ?? linhas.length} movimentação(ões) · exibindo {linhas.length}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {linhas.map((m) => (
                <li key={m.id} className="space-y-1 px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {m.marca_nome} <span className="font-mono">{m.modelo}</span>
                      {m.codigo_placa ? (
                        <span className="font-mono text-muted-foreground"> · {m.codigo_placa}</span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs font-semibold",
                        m.tipo === "entrada"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                          : "border-destructive/30 bg-destructive/10 text-destructive",
                      )}
                    >
                      {m.tipo === "entrada" ? "+" : "−"}
                      {m.quantidade}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {MOTIVO_LABEL[m.motivo] ?? m.motivo} · {TIPO_LABEL[m.familia]} ·{" "}
                    {m.gaveta_label}
                    {m.os ? ` · OS ${m.os}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Saldo {m.saldo_anterior} → {m.saldo_posterior} · {formatDateTimeITV(m.data)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Responsável: {m.responsavel ?? "—"}
                    {m.tecnico_nome ? ` · Técnico: ${m.tecnico_nome}` : ""}
                  </p>
                  {m.estornado_em ? (
                    <p className="text-xs font-medium text-amber-600">
                      Estornada em {formatDateTimeITV(m.estornado_em)}
                    </p>
                  ) : null}
                  {m.observacao ? (
                    <p className="text-xs text-muted-foreground">{m.observacao}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Peças no limite ou abaixo do estoque mínimo configurado. */
export function ReposicaoCard() {
  const [familia, setFamilia] = useState("");
  const query = useQuery({
    queryKey: ["estoque", "reposicao", familia],
    queryFn: async () =>
      rpcEstoque<{ ok: true; linhas: ReposicaoLinha[] }>("estoque_reposicao", {
        p_familia: familia || null,
      }),
  });
  const linhas = query.data?.linhas ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Necessidade de reposição</CardTitle>
        <CardDescription>
          Peças com disponibilidade igual ou abaixo do alerta configurado no cadastro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          className={cn(inputClass, "sm:max-w-xs")}
          value={familia}
          onChange={(e) => setFamilia(e.target.value)}
          aria-label="Família"
        >
          <option value="">Kits e placas</option>
          <option value="kit_led">Kits de LED</option>
          <option value="placa_main">Placas Main</option>
        </select>

        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : linhas.length === 0 ? (
          <Vazio texto="Nenhuma peça abaixo do alerta de estoque baixo." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {linhas.map((l) => (
              <li key={l.id} className="space-y-1 px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">
                    {l.marca_nome}
                    {l.polegada ? ` ${l.polegada}"` : ""}{" "}
                    <span className="font-mono">{l.modelo}</span>
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-semibold",
                      l.status === "sem_estoque"
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-amber-500/30 bg-amber-500/10 text-amber-600",
                    )}
                  >
                    {l.status === "sem_estoque" ? "SEM DISPONIBILIDADE" : "ESTOQUE BAIXO"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {l.gaveta_label} · Físico {l.fisico} · Reservado {l.reservado} · Disponível{" "}
                  {l.disponivel} · Alerta {l.minimo}
                </p>
                {l.falta > 0 ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <AlertTriangle className="size-3.5" /> Faltam {l.falta} para voltar ao alerta
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Visão gaveta a gaveta: quantas peças e quantas unidades cada uma guarda. */
export function PainelGavetasCard({ onAbrir }: { onAbrir: (id: string) => void }) {
  const [grupo, setGrupo] = useState<"LED" | "MAIN">("LED");
  const query = useQuery({
    queryKey: ["estoque", "gavetas-painel"],
    queryFn: async () =>
      rpcEstoque<{ ok: true; linhas: GavetaPainelLinha[] }>("estoque_gavetas_painel"),
  });
  const linhas = (query.data?.linhas ?? []).filter((l) => l.grupo === grupo);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Painel de gavetas</CardTitle>
        <CardDescription>Onde cada peça está guardada e quanto há em cada gaveta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {(["LED", "MAIN"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGrupo(g)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                grupo === g
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {g === "LED" ? "Gavetas de LED" : "Gavetas de Placas Main"}
            </button>
          ))}
        </div>

        {query.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : linhas.length === 0 ? (
          <Vazio texto="Nenhuma gaveta cadastrada neste grupo." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {linhas.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => onAbrir(l.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition hover:border-primary/50",
                  l.total > 0 ? "border-border bg-card" : "border-dashed border-border bg-muted/40",
                )}
              >
                <p className="text-xs font-semibold text-foreground">{l.label}</p>
                <p className="text-lg font-semibold tabular-nums text-foreground">{l.total}</p>
                <p className="text-xs text-muted-foreground">
                  {l.itens === 0 ? "Gaveta vazia" : `${l.itens} peça(s)`}
                  {l.reservado > 0 ? ` · ${l.reservado} reservada(s)` : ""}
                </p>
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
