/**
 * ESTOQUE TÉCNICO — Parte 3.
 * SOLICITAÇÃO (técnico pediu) → RESERVA (gerência separou) → BAIXA (peça saiu).
 * São três eventos distintos: a solicitação e a reserva nunca reduzem o saldo físico.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Boxes, ClipboardList, PackageCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import {
  MOTIVOS_LIBERACAO,
  STATUS_SOLICITACAO,
  TIPO_LABEL,
  rpcEstoque,
  type EstoqueItem,
  type ReservaAtiva,
  type SolicitacaoEstoque,
} from "@/lib/estoque";

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Manaus",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const unidade = (tipo: string, n: number) =>
  tipo === "kit_led" ? (n === 1 ? "kit" : "kits") : n === 1 ? "placa" : "placas";

function StatusSolicitacaoBadge({ status }: { status: SolicitacaoEstoque["status"] }) {
  const s = STATUS_SOLICITACAO[status];
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-xs font-semibold", s.classe)}>
      {s.label}
    </span>
  );
}

/* --------------------- TÉCNICO: SOLICITAR PARA OS --------------------- */

export function SolicitarDialog({
  item,
  onClose,
}: {
  item: EstoqueItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [os, setOs] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!item) return;
    setOs("");
    setQuantidade("1");
    setObservacao("");
  }, [item]);

  if (!item) return null;

  async function enviar() {
    if (!item || enviando) return;
    const qtd = Number(quantidade || 0);
    if (!os.trim()) {
      toast.error("Informe o número da OS.");
      return;
    }
    if (qtd <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setEnviando(true);
    try {
      const res = await rpcEstoque<{ ok: true; peca: string; os: string; quantidade: number }>(
        "estoque_solicitar",
        {
          p_item_id: item.id,
          p_quantidade: qtd,
          p_os: os.trim(),
          p_observacao: observacao.trim() || null,
        },
      );
      toast.success("Solicitação enviada", {
        duration: 9000,
        description: (
          <span className="block space-y-0.5">
            <span className="block">{res.peca}</span>
            <span className="block">
              OS {res.os} · {res.quantidade} {unidade(item!.tipo, res.quantidade)}
            </span>
            <span className="block">Situação: aguardando a Gerência Operacional.</span>
            <span className="block">Próximo responsável: Gerente Operacional.</span>
          </span>
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível enviar a solicitação", {
        description: (e as Error).message,
      });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitar para OS</DialogTitle>
          <DialogDescription>
            {TIPO_LABEL[item.tipo]} {item.marca_nome} {item.modelo} · {item.gaveta_label} ·
            disponível: {item.quantidade_disponivel}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="solic-os">
                OS *
              </label>
              <input
                id="solic-os"
                className={inputClass}
                value={os}
                inputMode="numeric"
                onChange={(e) => setOs(e.target.value)}
                placeholder="3421"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="solic-qtd">
                Quantidade *
              </label>
              <input
                id="solic-qtd"
                type="number"
                min={1}
                className={inputClass}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="solic-obs">
              Observação
            </label>
            <input
              id="solic-obs"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            A solicitação não retira a peça da gaveta nem altera o saldo. A Gerência analisa e
            separa a peça para a sua OS.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={enviando}>
            <ClipboardList className="mr-1.5 size-4" /> Enviar solicitação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------- GERÊNCIA: ANALISAR SOLICITAÇÃO --------------------- */

function ReservarSolicitacaoDialog({
  solicitacao,
  onClose,
}: {
  solicitacao: SolicitacaoEstoque | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!solicitacao) return;
    setQuantidade(String(solicitacao.quantidade));
    setObservacao("");
  }, [solicitacao]);

  if (!solicitacao) return null;
  const qtd = Number(quantidade || 0);

  async function reservar() {
    if (!solicitacao || salvando) return;
    if (qtd <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      const res = await rpcEstoque<{
        ok: true;
        peca: string;
        gaveta: string;
        quantidade: number;
        os: string | null;
        tecnico: string | null;
        fisico: number;
        reservado: number;
        disponivel_antes: number;
        disponivel: number;
        solicitacao_status: string;
      }>("estoque_reservar", {
        p_item_id: solicitacao.item_id,
        p_quantidade: qtd,
        p_solicitacao_id: solicitacao.id,
        p_observacao: observacao.trim() || null,
      });
      toast.success("Peça reservada", {
        duration: 9000,
        description: (
          <span className="block space-y-0.5">
            <span className="block">
              {res.peca} · {res.gaveta}
            </span>
            <span className="block">
              {res.quantidade} {unidade(solicitacao!.tipo, res.quantidade)}
              {res.os ? ` · OS ${res.os}` : ""}
              {res.tecnico ? ` · Técnico: ${res.tecnico}` : ""}
            </span>
            <span className="block">
              Físico: {res.fisico} · Reservado: {res.reservado} · Disponível: {res.disponivel_antes}{" "}
              → {res.disponivel}
            </span>
            <span className="block">
              {res.solicitacao_status === "parcialmente_atendida"
                ? "Situação: parcialmente atendida."
                : "Situação: reservada."}{" "}
              Próximo responsável: Gerente Operacional (entrega da peça).
            </span>
          </span>
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível reservar", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reservar peça para a OS {solicitacao.os}</DialogTitle>
          <DialogDescription>
            {solicitacao.marca_nome} {solicitacao.modelo} · {solicitacao.gaveta_label}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Antes</p>
            <p>
              Físico: {solicitacao.fisico} · Reservado: {solicitacao.reservado} · Disponível:{" "}
              {solicitacao.disponivel}
            </p>
            <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">Depois</p>
            <p>
              Físico: {solicitacao.fisico} · Reservado: {solicitacao.reservado + qtd} · Disponível:{" "}
              {Math.max(solicitacao.disponivel - qtd, 0)}
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="res-qtd">
              Quantidade a reservar * (solicitado: {solicitacao.quantidade})
            </label>
            <input
              id="res-qtd"
              type="number"
              min={1}
              max={solicitacao.quantidade}
              className={inputClass}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
            {qtd > 0 && qtd < solicitacao.quantidade ? (
              <p className="mt-1 text-xs font-medium text-amber-600">
                Atendimento parcial: {solicitacao.quantidade - qtd}{" "}
                {unidade(solicitacao.tipo, solicitacao.quantidade - qtd)} ficarão pendentes.
              </p>
            ) : null}
          </div>
          <div>
            <label className={labelClass} htmlFor="res-obs">
              Observação
            </label>
            <input
              id="res-obs"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Reservar não dá baixa: a peça continua na gaveta até ser entregue ao técnico.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void reservar()} disabled={salvando}>
            Confirmar reserva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MotivoDialog({
  aberto,
  titulo,
  descricao,
  sugestoes,
  rotulo,
  onConfirmar,
  onClose,
}: {
  aberto: boolean;
  titulo: string;
  descricao?: string;
  sugestoes?: string[];
  rotulo: string;
  onConfirmar: (motivo: string) => Promise<void>;
  onClose: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) setMotivo("");
  }, [aberto]);

  if (!aberto) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao ? <DialogDescription>{descricao}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-3">
          {sugestoes?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {sugestoes.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setMotivo(s === "Outro" ? "" : s)}
                  className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <div>
            <label className={labelClass} htmlFor="motivo-campo">
              Motivo *
            </label>
            <input
              id="motivo-campo"
              className={inputClass}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={salvando || motivo.trim().length < 3}
            onClick={() => {
              setSalvando(true);
              void onConfirmar(motivo.trim()).finally(() => setSalvando(false));
            }}
          >
            {rotulo}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------- LISTA DE SOLICITAÇÕES --------------------- */

export function SolicitacoesLista({
  escopo,
  podeAnalisar,
}: {
  escopo: "minhas" | "todas";
  podeAnalisar: boolean;
}) {
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<string>(escopo === "todas" ? "aguardando" : "");
  const [reservando, setReservando] = useState<SolicitacaoEstoque | null>(null);
  const [rejeitando, setRejeitando] = useState<SolicitacaoEstoque | null>(null);
  const [cancelando, setCancelando] = useState<SolicitacaoEstoque | null>(null);

  const query = useQuery({
    queryKey: ["estoque", "solicitacoes", escopo, filtro],
    queryFn: async () =>
      rpcEstoque<{ ok: true; solicitacoes: SolicitacaoEstoque[] }>("estoque_solicitacoes_listar", {
        p_status: filtro || null,
        p_escopo: escopo,
      }),
  });

  const lista = query.data?.solicitacoes ?? [];

  async function rejeitar(motivo: string) {
    if (!rejeitando) return;
    try {
      await rpcEstoque("estoque_solicitacao_rejeitar", { p_id: rejeitando.id, p_motivo: motivo });
      toast.success("Solicitação rejeitada", {
        description: `Motivo: ${motivo}. O técnico foi informado na lista dele.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      setRejeitando(null);
    } catch (e) {
      toast.error("Não foi possível rejeitar", { description: (e as Error).message });
    }
  }

  async function cancelar(motivo: string) {
    if (!cancelando) return;
    try {
      await rpcEstoque("estoque_solicitacao_cancelar", { p_id: cancelando.id, p_motivo: motivo });
      toast.success("Solicitação cancelada", { description: "Nenhum saldo foi alterado." });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      setCancelando(null);
    } catch (e) {
      toast.error("Não foi possível cancelar", { description: (e as Error).message });
    }
  }

  const filtros: [string, string][] = [
    ["", "Todas"],
    ["aguardando", "Aguardando"],
    ["reservada", "Reservadas"],
    ["parcialmente_atendida", "Parciais"],
    ["entregue", "Entregues"],
    ["rejeitada", "Rejeitadas"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {filtros.map(([v, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setFiltro(v)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
              filtro === v
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {escopo === "todas"
              ? "Nenhuma solicitação de peça no momento."
              : "Você ainda não solicitou nenhuma peça."}
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {lista.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {TIPO_LABEL[s.tipo]} · OS {s.os}
                      </p>
                      <p className="text-base font-semibold text-foreground">
                        {s.marca_nome} <span className="font-mono">{s.modelo}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.quantidade} {unidade(s.tipo, s.quantidade)} · {s.gaveta_label} ·{" "}
                        {dataHora(s.created_at)}
                      </p>
                      {escopo === "todas" ? (
                        <p className="text-xs text-muted-foreground">
                          Técnico: {s.tecnico_nome ?? "—"}
                        </p>
                      ) : null}
                    </div>
                    <StatusSolicitacaoBadge status={s.status} />
                  </div>

                  {s.observacao ? (
                    <p className="text-xs text-muted-foreground">Observação: {s.observacao}</p>
                  ) : null}

                  {podeAnalisar ? (
                    <p className="text-xs text-muted-foreground">
                      Físico: {s.fisico} · Reservado: {s.reservado} · Disponível: {s.disponivel}
                    </p>
                  ) : null}

                  {s.motivo_rejeicao && (s.status === "rejeitada" || s.status === "cancelada") ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs font-medium text-destructive">
                      Motivo: {s.motivo_rejeicao}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2 pt-1">
                    {podeAnalisar && s.status === "aguardando" ? (
                      <>
                        <Button size="sm" onClick={() => setReservando(s)}>
                          Reservar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejeitando(s)}>
                          Rejeitar
                        </Button>
                      </>
                    ) : null}
                    {!podeAnalisar && s.status === "aguardando" ? (
                      <Button size="sm" variant="outline" onClick={() => setCancelando(s)}>
                        Cancelar solicitação
                      </Button>
                    ) : null}
                    {!podeAnalisar && s.status === "reservada" ? (
                      <p className="text-xs text-muted-foreground">
                        Peça separada para a sua OS. Retire com o Gerente Operacional.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ReservarSolicitacaoDialog solicitacao={reservando} onClose={() => setReservando(null)} />
      <MotivoDialog
        aberto={!!rejeitando}
        titulo="Rejeitar solicitação"
        descricao={
          rejeitando
            ? `${rejeitando.marca_nome} ${rejeitando.modelo} · OS ${rejeitando.os}`
            : undefined
        }
        rotulo="Rejeitar"
        onConfirmar={rejeitar}
        onClose={() => setRejeitando(null)}
      />
      <MotivoDialog
        aberto={!!cancelando}
        titulo="Cancelar solicitação"
        descricao="Informe o motivo do cancelamento."
        rotulo="Cancelar solicitação"
        onConfirmar={cancelar}
        onClose={() => setCancelando(null)}
      />
    </div>
  );
}

/* --------------------- RESERVAS ATIVAS --------------------- */

function EntregarDialog({
  reserva,
  onClose,
}: {
  reserva: ReservaAtiva | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [quantidade, setQuantidade] = useState("1");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!reserva) return;
    setQuantidade(String(reserva.quantidade));
    setObservacao("");
  }, [reserva]);

  if (!reserva) return null;

  async function entregar() {
    if (!reserva || salvando) return;
    const qtd = Number(quantidade || 0);
    if (qtd <= 0 || qtd > reserva.quantidade) {
      toast.error("Quantidade inválida.", {
        description: `Reservado: ${reserva.quantidade} ${unidade(reserva.tipo, reserva.quantidade)}.`,
      });
      return;
    }
    setSalvando(true);
    try {
      const res = await rpcEstoque<{
        ok: true;
        peca: string;
        gaveta: string;
        quantidade: number;
        os: string | null;
        tecnico: string | null;
        saldo_anterior: number;
        saldo_posterior: number;
        custo_os_id: string | null;
        reserva_restante: number;
      }>("estoque_reserva_entregar", {
        p_id: reserva.id,
        p_quantidade: qtd,
        p_observacao: observacao.trim() || null,
      });
      toast.success("Peça entregue e baixa registrada", {
        duration: 9000,
        description: (
          <span className="block space-y-0.5">
            <span className="block">
              {res.peca} · {res.gaveta}
            </span>
            <span className="block">
              {res.quantidade} {unidade(reserva!.tipo, res.quantidade)}
              {res.os ? ` · OS ${res.os}` : ""}
            </span>
            {res.tecnico ? <span className="block">Recebido por: {res.tecnico}</span> : null}
            <span className="block">
              Saldo anterior: {res.saldo_anterior} → saldo atual: {res.saldo_posterior}
            </span>
            <span className="block">
              {res.reserva_restante > 0
                ? `Reserva restante: ${res.reserva_restante} (parcialmente utilizada).`
                : "Reserva encerrada."}
            </span>
            {res.custo_os_id ? <span className="block">Custo direto lançado na OS.</span> : null}
          </span>
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      void queryClient.invalidateQueries({ queryKey: ["custos"] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível registrar a entrega", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entregar peça / dar baixa</DialogTitle>
          <DialogDescription>
            {reserva.marca_nome} {reserva.modelo} · {reserva.gaveta_label}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border border-border p-3 text-sm">
            <p>OS: {reserva.os ?? "—"}</p>
            <p>Técnico: {reserva.tecnico_nome ?? "—"}</p>
            <p>
              Reservado: {reserva.quantidade} {unidade(reserva.tipo, reserva.quantidade)}
            </p>
            <p className="text-xs text-muted-foreground">
              Físico: {reserva.fisico} · Reservado no item: {reserva.reservado_item} · Disponível:{" "}
              {reserva.disponivel}
            </p>
          </div>
          <div>
            <label className={labelClass} htmlFor="entregar-qtd">
              Quantidade a entregar *
            </label>
            <input
              id="entregar-qtd"
              type="number"
              min={1}
              max={reserva.quantidade}
              className={inputClass}
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="entregar-obs">
              Observação
            </label>
            <input
              id="entregar-obs"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void entregar()} disabled={salvando}>
            <PackageCheck className="mr-1.5 size-4" /> Confirmar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReservasLista({ podeGerenciar }: { podeGerenciar: boolean }) {
  const queryClient = useQueryClient();
  const [entregando, setEntregando] = useState<ReservaAtiva | null>(null);
  const [liberando, setLiberando] = useState<ReservaAtiva | null>(null);

  const query = useQuery({
    queryKey: ["estoque", "reservas"],
    queryFn: async () =>
      rpcEstoque<{ ok: true; reservas: ReservaAtiva[] }>("estoque_reservas_listar", {
        p_status: "ativa",
      }),
  });

  const reservas = query.data?.reservas ?? [];

  async function liberar(motivo: string) {
    if (!liberando) return;
    try {
      const res = await rpcEstoque<{
        ok: true;
        fisico: number;
        reservado: number;
        disponivel: number;
      }>("estoque_reserva_liberar", { p_id: liberando.id, p_motivo: motivo });
      toast.success("Reserva liberada", {
        duration: 9000,
        description: (
          <span className="block space-y-0.5">
            <span className="block">Motivo: {motivo}</span>
            <span className="block">
              Físico: {res.fisico} · Reservado: {res.reservado} · Disponível: {res.disponivel}
            </span>
            <span className="block">A peça não saiu da gaveta — nenhuma entrada foi criada.</span>
          </span>
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      setLiberando(null);
    } catch (e) {
      toast.error("Não foi possível liberar", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-3">
      {query.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>
      ) : reservas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <Boxes className="mx-auto mb-2 size-6" />
            Nenhuma reserva ativa no momento.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {reservas.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {TIPO_LABEL[r.tipo]} · OS {r.os ?? "—"}
                      </p>
                      <p className="text-base font-semibold text-foreground">
                        {r.marca_nome} <span className="font-mono">{r.modelo}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {r.quantidade} {unidade(r.tipo, r.quantidade)} · {r.gaveta_label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Técnico: {r.tecnico_nome ?? "—"} · Reservada por: {r.reservado_por ?? "—"}
                      </p>
                    </div>
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {r.status === "parcialmente_utilizada"
                        ? "PARCIALMENTE UTILIZADA"
                        : "RESERVADA"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Reservada há {r.dias} dia(s) · {dataHora(r.created_at)}
                  </p>
                  {podeGerenciar ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" onClick={() => setEntregando(r)}>
                        Entregar peça / dar baixa
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setLiberando(r)}>
                        Liberar reserva
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <EntregarDialog reserva={entregando} onClose={() => setEntregando(null)} />
      <MotivoDialog
        aberto={!!liberando}
        titulo="Liberar reserva"
        descricao="A peça volta a ficar disponível. Nenhuma entrada física é criada."
        sugestoes={MOTIVOS_LIBERACAO}
        rotulo="Liberar reserva"
        onConfirmar={liberar}
        onClose={() => setLiberando(null)}
      />
    </div>
  );
}
