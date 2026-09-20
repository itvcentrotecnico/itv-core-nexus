/**
 * Movimentação do Estoque Técnico: baixa, entrada, reserva, estorno e histórico.
 * Regra de ouro: reserva não reduz saldo físico; toda mudança de saldo gera movimentação.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, History, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  MOTIVOS_ENTRADA,
  MOTIVOS_SAIDA,
  MOTIVO_LABEL,
  TIPO_LABEL,
  rpcEstoque,
  type BaixaResultado,
  type EstoqueItem,
  type HistoricoEstoque,
} from "@/lib/estoque";

interface Usuario {
  id: string;
  full_name: string;
  roles: string[];
}

function useUsuarios(ativo: boolean) {
  return useQuery({
    queryKey: ["estoque", "usuarios"],
    enabled: ativo,
    staleTime: 300_000,
    queryFn: async (): Promise<Usuario[]> => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      return ((data ?? []) as Usuario[]).filter((u) => u.full_name);
    },
  });
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Manaus",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const unidade = (item: EstoqueItem, n: number) =>
  item.tipo === "kit_led" ? (n === 1 ? "kit" : "kits") : n === 1 ? "placa" : "placas";

/* ----------------------------- BAIXA ----------------------------- */

export function BaixaDialog({
  item,
  reservaId,
  onClose,
}: {
  item: EstoqueItem | null;
  reservaId?: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const usuarios = useUsuarios(!!item);
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState<string>("uso_os");
  const [os, setOs] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!item) return;
    setQuantidade("1");
    setMotivo("uso_os");
    setOs("");
    setTecnicoId("");
    setObservacao("");
  }, [item]);

  if (!item) return null;
  // Ao atender uma reserva, a quantidade reservada volta a ficar disponível para a baixa.
  const disponivel = reservaId ? item.quantidade : item.quantidade_disponivel;

  async function registrar() {
    if (!item) return;
    const qtd = Number(quantidade || 0);
    if (qtd <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    if (qtd > disponivel) {
      toast.error("Quantidade maior que o disponível.", {
        description: `Disponível agora: ${disponivel} ${unidade(item, disponivel)}.`,
      });
      return;
    }
    if (motivo === "uso_os" && !os.trim()) {
      toast.error("Para uso em OS, informe o número da OS.");
      return;
    }

    setSalvando(true);
    try {
      const res = await rpcEstoque<BaixaResultado>("estoque_baixar", {
        p_item_id: item.id,
        p_quantidade: qtd,
        p_motivo: motivo,
        p_os: os.trim() || null,
        p_tecnico_id: tecnicoId || null,
        p_observacao: observacao.trim() || null,
        p_reserva_id: reservaId ?? null,
      });
      const linhas = [
        `${res.peca} · ${res.gaveta}`,
        `${res.quantidade} ${unidade(item, res.quantidade)} · ${MOTIVO_LABEL[motivo] ?? motivo}`,
        res.os ? `OS ${res.os}` : null,
        res.tecnico ? `Recebido por: ${res.tecnico}` : null,
        `Saldo anterior: ${res.saldo_anterior} → saldo atual: ${res.saldo_posterior}`,
        res.custo_os_id ? "Custo direto lançado na OS." : null,
      ].filter((l): l is string => !!l);
      toast.success("Baixa registrada", {
        duration: 9000,
        description: (
          <span className="block space-y-0.5">
            {linhas.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </span>
        ),
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      void queryClient.invalidateQueries({ queryKey: ["custos"] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível registrar a baixa", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dar baixa</DialogTitle>
          <DialogDescription>
            {TIPO_LABEL[item.tipo]} {item.marca_nome} {item.modelo} · {item.gaveta_label} ·
            disponível: {disponivel} {unidade(item, disponivel)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="baixa-qtd">
                Quantidade *
              </label>
              <input
                id="baixa-qtd"
                type="number"
                min={1}
                max={disponivel}
                className={inputClass}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="baixa-motivo">
                Motivo *
              </label>
              <select
                id="baixa-motivo"
                className={inputClass}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                {MOTIVOS_SAIDA.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="baixa-os">
                OS {motivo === "uso_os" ? "*" : "(quando aplicável)"}
              </label>
              <input
                id="baixa-os"
                className={inputClass}
                value={os}
                onChange={(e) => setOs(e.target.value)}
                placeholder="3421"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="baixa-tecnico">
                Técnico / destinatário
              </label>
              <select
                id="baixa-tecnico"
                className={inputClass}
                value={tecnicoId}
                onChange={(e) => setTecnicoId(e.target.value)}
              >
                <option value="">Selecione</option>
                {(usuarios.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="baixa-obs">
              Observação
            </label>
            <input
              id="baixa-obs"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>

          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Responsável, data, hora, saldo anterior e saldo posterior são preenchidos
            automaticamente. Quando houver custo cadastrado e o motivo for &quot;Uso em OS&quot;, o
            custo direto é lançado na OS.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void registrar()} disabled={salvando}>
            <ArrowDownCircle className="mr-1.5 size-4" /> Registrar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- ENTRADA ----------------------------- */

export function EntradaDialog({
  item,
  onClose,
}: {
  item: EstoqueItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState<string>("entrada_compra");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!item) return;
    setQuantidade("1");
    setMotivo("entrada_compra");
    setObservacao("");
  }, [item]);

  if (!item) return null;

  async function registrar() {
    if (!item) return;
    const qtd = Number(quantidade || 0);
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
        saldo_anterior: number;
        saldo_posterior: number;
      }>("estoque_entrada", {
        p_item_id: item.id,
        p_quantidade: qtd,
        p_motivo: motivo,
        p_observacao: observacao.trim() || null,
      });
      toast.success("✅ Entrada registrada", {
        duration: 8000,
        description: `${res.peca} · ${res.gaveta}\n${qtd} ${unidade(item, qtd)} · ${
          MOTIVO_LABEL[motivo] ?? motivo
        }\nSaldo anterior: ${res.saldo_anterior} → Saldo atual: ${res.saldo_posterior}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível registrar a entrada", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrada</DialogTitle>
          <DialogDescription>
            {item.marca_nome} {item.modelo} · {item.gaveta_label} · saldo atual: {item.quantidade}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="entrada-qtd">
                Quantidade *
              </label>
              <input
                id="entrada-qtd"
                type="number"
                min={1}
                className={inputClass}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="entrada-motivo">
                Motivo *
              </label>
              <select
                id="entrada-motivo"
                className={inputClass}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                {MOTIVOS_ENTRADA.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="entrada-obs">
              Observação
            </label>
            <input
              id="entrada-obs"
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
          <Button onClick={() => void registrar()} disabled={salvando}>
            <ArrowUpCircle className="mr-1.5 size-4" /> Registrar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- RESERVA ----------------------------- */

export function ReservaDialog({
  item,
  onClose,
}: {
  item: EstoqueItem | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [quantidade, setQuantidade] = useState("1");
  const [os, setOs] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!item) return;
    setQuantidade("1");
    setOs("");
    setObservacao("");
  }, [item]);

  if (!item) return null;
  const disponivel = item.quantidade_disponivel;

  async function reservar() {
    if (!item) return;
    const qtd = Number(quantidade || 0);
    if (qtd <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setSalvando(true);
    try {
      const res = await rpcEstoque<{ ok: true; disponivel: number }>("estoque_reservar", {
        p_item_id: item.id,
        p_quantidade: qtd,
        p_os: os.trim() || null,
        p_observacao: observacao.trim() || null,
      });
      toast.success("✅ Peça reservada", {
        duration: 8000,
        description: `${item.marca_nome} ${item.modelo} · ${item.gaveta_label}\n${qtd} ${unidade(
          item,
          qtd,
        )} reservado(s)${os.trim() ? ` para a OS ${os.trim()}` : ""}\nA reserva não retira a peça da gaveta. Disponível agora: ${res.disponivel}.\nPróxima etapa: o Gerente Operacional entrega a peça e registra a baixa.`,
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
          <DialogTitle>Reservar peça</DialogTitle>
          <DialogDescription>
            {item.marca_nome} {item.modelo} · {item.gaveta_label} · disponível: {disponivel}{" "}
            {unidade(item, disponivel)}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="reserva-qtd">
                Quantidade *
              </label>
              <input
                id="reserva-qtd"
                type="number"
                min={1}
                max={disponivel}
                className={inputClass}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="reserva-os">
                OS
              </label>
              <input
                id="reserva-os"
                className={inputClass}
                value={os}
                onChange={(e) => setOs(e.target.value)}
                placeholder="3421"
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="reserva-obs">
              Observação
            </label>
            <input
              id="reserva-obs"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Reservar não dá baixa: o saldo físico continua o mesmo até a peça sair da gaveta.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void reservar()} disabled={salvando}>
            Reservar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- HISTÓRICO ----------------------------- */

export function HistoricoDialog({
  item,
  podeMovimentar,
  podeEstornar,
  onClose,
  onBaixarReserva,
}: {
  item: EstoqueItem | null;
  podeMovimentar: boolean;
  podeEstornar: boolean;
  onClose: () => void;
  onBaixarReserva: (reservaId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [estornando, setEstornando] = useState<string | null>(null);

  const historico = useQuery({
    queryKey: ["estoque", "historico", item?.id],
    enabled: !!item,
    queryFn: async () =>
      rpcEstoque<HistoricoEstoque>("estoque_item_historico", { p_item_id: item!.id }),
  });

  if (!item) return null;

  async function estornar(id: string) {
    const motivo = window.prompt("Motivo do estorno (obrigatório):")?.trim();
    if (!motivo) return;
    setEstornando(id);
    try {
      const res = await rpcEstoque<{ ok: true; saldo_anterior: number; saldo_posterior: number }>(
        "estoque_movimento_estornar",
        { p_id: id, p_motivo: motivo },
      );
      toast.success("✅ Movimentação estornada", {
        description: `Saldo anterior: ${res.saldo_anterior} → Saldo atual: ${res.saldo_posterior}. O histórico original foi mantido.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      void queryClient.invalidateQueries({ queryKey: ["custos"] });
    } catch (e) {
      toast.error("Não foi possível estornar", { description: (e as Error).message });
    } finally {
      setEstornando(null);
    }
  }

  async function cancelarReserva(id: string) {
    try {
      await rpcEstoque("estoque_reserva_cancelar", { p_id: id, p_motivo: "Cancelada pelo usuário" });
      toast.success("Reserva cancelada.", { description: "O saldo disponível voltou ao normal." });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
    } catch (e) {
      toast.error("Não foi possível cancelar", { description: (e as Error).message });
    }
  }

  const movs = historico.data?.movimentos ?? [];
  const reservas = historico.data?.reservas ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Histórico — {item.marca_nome} {item.modelo}
          </DialogTitle>
          <DialogDescription>
            Físico: {item.quantidade} · Reservado: {item.quantidade_reservada} · Disponível:{" "}
            {item.quantidade_disponivel}
          </DialogDescription>
        </DialogHeader>

        {reservas.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Reservas ativas
            </p>
            <ul className="space-y-2">
              {reservas.map((r) => (
                <li key={r.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">
                    {r.quantidade} {unidade(item, r.quantidade)}
                    {r.os ? ` · OS ${r.os}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.tecnico_nome ?? "—"} · {dataHora(r.created_at)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {podeMovimentar ? (
                      <Button size="sm" onClick={() => onBaixarReserva(r.id)}>
                        Entregar e dar baixa
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void cancelarReserva(r.id)}
                    >
                      Cancelar reserva
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Movimentações
          </p>
          {historico.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p>
          ) : movs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma movimentação registrada.
            </p>
          ) : (
            <ul className="space-y-2">
              {movs.map((m) => (
                <li key={m.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-foreground">
                      {m.tipo === "saida" ? "− " : "+ "}
                      {m.quantidade} {unidade(item, m.quantidade)} ·{" "}
                      {MOTIVO_LABEL[m.motivo] ?? m.motivo}
                      {m.os ? ` · OS ${m.os}` : ""}
                    </p>
                    <span className="text-xs text-muted-foreground">{dataHora(m.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Saldo {m.saldo_anterior} → {m.saldo_posterior}
                    {m.tecnico_nome ? ` · Recebido por: ${m.tecnico_nome}` : ""}
                    {m.responsavel ? ` · Responsável: ${m.responsavel}` : ""}
                  </p>
                  {m.observacao ? (
                    <p className="mt-1 text-xs text-muted-foreground">{m.observacao}</p>
                  ) : null}
                  {m.estornado_em ? (
                    <p className="mt-1 text-xs font-medium text-amber-600">
                      Estornada em {dataHora(m.estornado_em)}
                    </p>
                  ) : podeEstornar && !m.estorno_de ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={estornando === m.id}
                      onClick={() => void estornar(m.id)}
                    >
                      <Undo2 className="mr-1.5 size-3.5" /> Estornar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <History className="mr-1.5 size-4" /> Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
