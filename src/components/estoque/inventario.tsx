/**
 * INVENTÁRIO — carga oficial (saldo de abertura), conferência por gaveta e relatórios.
 * A carga é idempotente: o lote só pode ser gravado uma vez.
 * A conferência NUNCA altera o saldo — apenas registra a diferença.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { labelGaveta, rpcEstoque, type EstoqueLocalizacao } from "@/lib/estoque";
import {
  ESPERADO_INVENTARIO_LED,
  INVENTARIO_LED,
  LOTE_INVENTARIO_LED,
} from "@/lib/estoque-inventario-led";

interface PreviaCarga {
  ok: true;
  lote: string;
  posicoes: number;
  total: number;
  gavetas: number;
  marcas: Record<string, number>;
  previa?: boolean;
}

const argsCarga = (confirmar: boolean) => ({
  p_lote: LOTE_INVENTARIO_LED,
  p_itens: INVENTARIO_LED,
  p_esperado: ESPERADO_INVENTARIO_LED,
  p_confirmar: confirmar,
});

export function CargaInicialCard() {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [autorizo, setAutorizo] = useState(false);
  const [previa, setPrevia] = useState<PreviaCarga | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const ledQuery = useQuery({
    queryKey: ["estoque", "relatorio", "marca"],
    queryFn: async () =>
      rpcEstoque<{ ok: true; total: number; linhas: { marca: string; total: number }[] }>(
        "estoque_relatorio",
        { p_tipo: "marca", p_familia: "kit_led" },
      ),
  });

  const abrir = async () => {
    setErro(null);
    setPrevia(null);
    setAutorizo(false);
    setAberto(true);
    try {
      setPrevia(await rpcEstoque<PreviaCarga>("estoque_inventario_inicial", argsCarga(false)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível montar a prévia.");
    }
  };

  const confirmar = useMutation({
    mutationFn: async () =>
      rpcEstoque<PreviaCarga>("estoque_inventario_inicial", argsCarga(true)),
    onSuccess: (r) => {
      setAberto(false);
      toast.success("Inventário inicial registrado", {
        description: `${r.posicoes} posições · ${r.total} Kits de LED · ${r.gavetas} gavetas ocupadas · Lote ${r.lote}`,
      });
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: (e: Error) => setErro(e.message),
  });

  const jaCarregado = (ledQuery.data?.total ?? 0) > 0;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inventário inicial — Kits de LED</CardTitle>
          <CardDescription>
            Registra o estoque físico real como saldo de abertura, gerando movimentação auditável
            para cada posição. O lote só pode ser gravado uma vez.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Posições", ESPERADO_INVENTARIO_LED.posicoes],
              ["Kits", ESPERADO_INVENTARIO_LED.total],
              ["Gavetas ocupadas", ESPERADO_INVENTARIO_LED.gavetas],
              ["Marcas", Object.keys(ESPERADO_INVENTARIO_LED.marcas).length],
            ].map(([label, v]) => (
              <div key={String(label)} className="rounded-lg border border-border p-3">
                <p className="text-xl font-semibold text-foreground">{v}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          {jaCarregado ? (
            <p className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-2 text-xs font-medium text-primary">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
              Já existem {ledQuery.data?.total} Kits de LED no estoque. A carga não será repetida.
            </p>
          ) : null}
          <Button onClick={abrir}>
            <Upload className="mr-1.5 size-4" /> Conferir e carregar inventário
          </Button>
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={(o) => !o && setAberto(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inventário inicial — Kits de LED</DialogTitle>
            <DialogDescription>Confira os totais antes de autorizar a gravação.</DialogDescription>
          </DialogHeader>

          {erro ? (
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm font-medium text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {erro}
            </p>
          ) : null}

          {previa ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Posições", previa.posicoes],
                  ["Kits", previa.total],
                  ["Gavetas", previa.gavetas],
                ].map(([l, v]) => (
                  <div key={String(l)} className="rounded-lg border border-border p-2 text-center">
                    <p className="text-lg font-semibold text-foreground">{v}</p>
                    <p className="text-xs text-muted-foreground">{l}</p>
                  </div>
                ))}
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {Object.entries(previa.marcas).map(([m, q]) => (
                  <li key={m} className="flex justify-between px-3 py-2">
                    <span className="font-medium text-foreground">{m}</span>
                    <span className="tabular-nums">{q} kits</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Nenhuma compatibilidade e nenhum custo serão criados. Lote: {previa.lote}
              </p>
              <label className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={autorizo}
                  onChange={(e) => setAutorizo(e.target.checked)}
                />
                <span>
                  Conferi os dados acima e autorizo a criação do saldo de abertura do Estoque
                  Técnico ITV.
                </span>
              </label>
            </div>
          ) : !erro ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Montando a prévia…</p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!previa || !autorizo || confirmar.isPending}
              onClick={() => confirmar.mutate()}
            >
              {confirmar.isPending ? "Gravando…" : "Confirmar inventário inicial"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface ItemGaveta {
  item_id: string;
  marca_nome: string;
  modelo: string;
  polegada: string | null;
  codigo_placa: string | null;
  observacao: string | null;
  quantidade_sistema: number;
  reservado: number;
}

export function ConferenciaGavetaCard({
  localizacoes,
}: {
  localizacoes: EstoqueLocalizacao[];
}) {
  const qc = useQueryClient();
  const [gaveta, setGaveta] = useState("");
  const [contagem, setContagem] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<
    { modelo: string; sistema: number; contado: number; diferenca: number }[] | null
  >(null);

  const gavetaQuery = useQuery({
    queryKey: ["estoque", "inventario", "gaveta", gaveta],
    enabled: !!gaveta,
    queryFn: async () =>
      rpcEstoque<{ ok: true; gaveta: string; itens: ItemGaveta[] }>("estoque_inventario_gaveta", {
        p_localizacao_id: gaveta,
      }),
  });

  const registrar = useMutation({
    mutationFn: async () => {
      const itens = (gavetaQuery.data?.itens ?? [])
        .filter((i) => contagem[i.item_id] !== undefined && contagem[i.item_id] !== "")
        .map((i) => ({
          item_id: i.item_id,
          quantidade_contada: Number(contagem[i.item_id]),
        }));
      if (itens.length === 0) throw new Error("Informe a quantidade contada de pelo menos uma peça.");
      return rpcEstoque<{
        ok: true;
        divergencias: number;
        itens: { modelo: string; sistema: number; contado: number; diferenca: number }[];
      }>("estoque_inventario_registrar", {
        p_localizacao_id: gaveta,
        p_contagens: itens,
      });
    },
    onSuccess: (r) => {
      setResultado(r.itens);
      if (r.divergencias === 0) {
        toast.success("Estoque conferido", { description: "Sem divergência nesta gaveta." });
      } else {
        toast.warning("Divergência de estoque", {
          description: `${r.divergencias} peça(s) com diferença. O saldo não foi alterado — use Ajustar estoque.`,
        });
      }
      void qc.invalidateQueries({ queryKey: ["estoque"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const itens = gavetaQuery.data?.itens ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conferência de gaveta (inventário físico)</CardTitle>
        <CardDescription>
          Compare o sistema com a contagem física. A conferência registra a diferença e nunca
          altera o saldo automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <select
          className={inputClass}
          value={gaveta}
          onChange={(e) => {
            setGaveta(e.target.value);
            setContagem({});
            setResultado(null);
          }}
          aria-label="Gaveta"
        >
          <option value="">Escolha a gaveta</option>
          {localizacoes.map((l) => (
            <option key={l.id} value={l.id}>
              {labelGaveta(l)}
            </option>
          ))}
        </select>

        {gaveta ? (
          gavetaQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma peça armazenada nesta gaveta.
            </p>
          ) : (
            <div className="space-y-3">
              {itens.map((i) => {
                const valor = contagem[i.item_id] ?? "";
                const dif = valor === "" ? null : Number(valor) - i.quantidade_sistema;
                return (
                  <div key={i.item_id} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">
                      {i.marca_nome}
                      {i.polegada ? ` · ${i.polegada}"` : ""}
                    </p>
                    <p className="font-mono text-sm">{i.modelo}</p>
                    {i.observacao ? (
                      <p className="text-xs font-medium text-amber-600">⚠️ {i.observacao}</p>
                    ) : null}
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs uppercase text-muted-foreground">Sistema</p>
                        <p className="font-medium">{i.quantidade_sistema}</p>
                      </div>
                      <div>
                        <label
                          className="text-xs uppercase text-muted-foreground"
                          htmlFor={`cont-${i.item_id}`}
                        >
                          Quantidade contada
                        </label>
                        <input
                          id={`cont-${i.item_id}`}
                          className={cn(inputClass, "h-10")}
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={valor}
                          onChange={(e) =>
                            setContagem((c) => ({ ...c, [i.item_id]: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    {dif !== null ? (
                      dif === 0 ? (
                        <p className="mt-2 text-xs font-medium text-primary">
                          ✅ Estoque conferido — sem divergência.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs font-medium text-amber-600">
                          ⚠️ Divergência: sistema {i.quantidade_sistema} · físico {valor} ·
                          diferença {dif > 0 ? `+${dif}` : dif}
                        </p>
                      )
                    ) : null}
                  </div>
                );
              })}
              <Button onClick={() => registrar.mutate()} disabled={registrar.isPending}>
                <ClipboardCheck className="mr-1.5 size-4" />
                {registrar.isPending ? "Registrando…" : "Registrar conferência"}
              </Button>
              {resultado ? (
                <p className="text-xs text-muted-foreground">
                  Conferência registrada com responsável, data e hora. Para corrigir o saldo, use
                  Ajuste de inventário na peça.
                </p>
              ) : null}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

export function RelatoriosEstoqueCard() {
  const [tipo, setTipo] = useState<"marca" | "gaveta">("marca");

  const relQuery = useQuery({
    queryKey: ["estoque", "relatorio", tipo],
    queryFn: async () =>
      rpcEstoque<{
        ok: true;
        total: number;
        linhas: {
          marca?: string;
          total: number;
          posicoes?: number;
          grupo_label?: string;
          itens?: { marca: string; modelo: string; quantidade: number }[];
        }[];
      }>("estoque_relatorio", { p_tipo: tipo, p_familia: "kit_led" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Relatório de Kits de LED</CardTitle>
        <CardDescription>Visão por marca ou por gaveta.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {(
            [
              ["marca", "Por marca"],
              ["gaveta", "Por gaveta"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTipo(v)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                tipo === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {relQuery.isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
        ) : (relQuery.data?.linhas ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum Kit de LED cadastrado.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(relQuery.data?.linhas ?? []).map((l, idx) => (
              <li key={l.marca ?? l.grupo_label ?? idx} className="px-3 py-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium text-foreground">{l.marca ?? l.grupo_label}</span>
                  <span className="tabular-nums">{l.total} kits</span>
                </div>
                {l.itens ? (
                  <ul className="mt-1 space-y-0.5">
                    {l.itens.map((i) => (
                      <li
                        key={`${i.marca}-${i.modelo}`}
                        className="flex justify-between text-xs text-muted-foreground"
                      >
                        <span className="font-mono">
                          {i.marca} {i.modelo}
                        </span>
                        <span className="tabular-nums">{i.quantidade}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm font-semibold text-foreground">
          Total: {relQuery.data?.total ?? 0} Kits de LED
        </p>
      </CardContent>
    </Card>
  );
}
