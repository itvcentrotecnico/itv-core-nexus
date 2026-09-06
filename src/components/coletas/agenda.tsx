import { ErroNegocio } from "@/lib/erros";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, MessageCircle, Navigation, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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
  MOTIVOS_NAO_REALIZADA,
  STATUS_COLETA,
  STATUS_MOTORISTA,
  TIPO_LABEL,
  complementoResumido,
  enderecoResumido,
  labelStatus,
  mapsUrl,
  mensagemErro,
  rpcColetas,
  whatsappUrl,
  type AgendaItem,
} from "@/lib/coletas";

interface Resposta {
  ok: boolean;
  message?: string;
  data?: string;
  itens?: AgendaItem[];
}

/** Data de hoje em America/Manaus no formato ISO (yyyy-mm-dd). */
function hojeManaus(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus" }).format(new Date());
}

/**
 * AGENDA DO MOTORISTA — lista do dia com sugestão simples de rota por bairro.
 * A sugestão nunca bloqueia a escolha manual e funciona sem GPS.
 */
export function AgendaMotorista() {
  const queryClient = useQueryClient();
  const [data, setData] = useState(hojeManaus());
  const [naoRealizada, setNaoRealizada] = useState<AgendaItem | null>(null);
  const [motivo, setMotivo] = useState(MOTIVOS_NAO_REALIZADA[0] ?? "Outro");
  const [detalheMotivo, setDetalheMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const agendaQuery = useQuery({
    queryKey: ["coletas", "agenda", data],
    queryFn: async () => {
      const res = await rpcColetas<Resposta>("coletas_agenda", { p_data: data });
      if (!res?.ok) throw new ErroNegocio(res?.message ?? "Não foi possível carregar a agenda.");
      return res.itens ?? [];
    },
  });

  const itens = useMemo(() => agendaQuery.data ?? [], [agendaQuery.data]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    for (const item of itens) {
      const chave = item.bairro?.trim() || "Sem bairro informado";
      const lista = mapa.get(chave) ?? [];
      lista.push(item);
      mapa.set(chave, lista);
    }
    return [...mapa.entries()];
  }, [itens]);

  async function alterarStatus(item: AgendaItem, status: string, motivoTexto?: string) {
    try {
      const res = await rpcColetas<{ ok: boolean; message?: string }>("coletas_status", {
        p_id: item.id,
        p_status: status,
        ...(motivoTexto ? { p_motivo: motivoTexto } : {}),
      });
      if (!res?.ok) {
        toast.error(res?.message ?? "Não foi possível atualizar a situação.");
        return false;
      }
      toast.success("Situação atualizada.");
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      return true;
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível atualizar a situação."));
      return false;
    }
  }

  async function confirmarNaoRealizada() {
    if (!naoRealizada) return;
    const texto = motivo === "Outro" ? detalheMotivo.trim() : motivo;
    if (!texto) {
      toast.error("Descreva o motivo da não realização.");
      return;
    }
    setSalvando(true);
    const ok = await alterarStatus(naoRealizada, "nao_realizada", texto);
    setSalvando(false);
    if (ok) {
      setNaoRealizada(null);
      setDetalheMotivo("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelClass} htmlFor="agenda-data">
            Dia da agenda
          </label>
          <input
            id="agenda-data"
            type="date"
            className={`${inputClass} h-11`}
            value={data}
            onChange={(e) => setData(e.target.value || hojeManaus())}
          />
        </div>
        <Button variant="outline" className="h-11" onClick={() => void agendaQuery.refetch()}>
          <RefreshCw className="mr-1.5 size-4" aria-hidden="true" /> Atualizar
        </Button>
      </div>

      <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <Navigation className="size-3.5 shrink-0" aria-hidden="true" />
        Sugestão de rota: paradas agrupadas por bairro, do bairro com mais paradas para o menor. Você
        pode seguir em qualquer ordem.
      </p>

      {agendaQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando agenda…</p>}

      {agendaQuery.isError && (
        <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
          {mensagemErro(agendaQuery.error, "Não foi possível carregar a agenda.")}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => void agendaQuery.refetch()}>
              Tentar novamente
            </Button>
          </div>
        </div>
      )}

      {!agendaQuery.isLoading && !agendaQuery.isError && itens.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma movimentação agendada para este dia.
        </p>
      )}

      {grupos.map(([bairro, lista]) => (
        <section key={bairro} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            {bairro}
            <span className="text-xs font-normal text-muted-foreground">
              ({lista.length} {lista.length === 1 ? "parada" : "paradas"})
            </span>
          </h3>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lista.map((item) => (
              <article key={item.id} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{item.cliente_nome}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {TIPO_LABEL[item.tipo]} · {enderecoResumido(item)}
                    </p>
                    {complementoResumido(item) && (
                      <p className="truncate text-xs text-muted-foreground">{complementoResumido(item)}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      STATUS_COLETA[item.status].className
                    }`}
                  >
                    {labelStatus(item.tipo, item.status)}
                  </span>
                </div>

                {item.motorista && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Motorista: {item.motorista}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <a href={mapsUrl(item)} target="_blank" rel="noreferrer">
                      <MapPin className="mr-1 size-3.5" aria-hidden="true" /> Mapa
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-9">
                    <a href={whatsappUrl(item.whatsapp)} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-1 size-3.5" aria-hidden="true" /> WhatsApp
                    </a>
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {STATUS_MOTORISTA.map((s) => (
                    <Button
                      key={s.valor}
                      size="sm"
                      variant={item.status === s.valor ? "default" : "secondary"}
                      className="h-9"
                      disabled={item.status === s.valor}
                      onClick={() => {
                        if (s.valor === "nao_realizada") {
                          setNaoRealizada(item);
                          setMotivo(MOTIVOS_NAO_REALIZADA[0] ?? "Outro");
                          setDetalheMotivo("");
                          return;
                        }
                        void alterarStatus(item, s.valor);
                      }}
                    >
                      {s.label}
                    </Button>
                  ))}
                </div>

                <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <CalendarDays className="size-3" aria-hidden="true" />
                  Conclusão (coletada/entregue) é registrada na aba Movimentações, com fotos.
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}

      <Dialog open={!!naoRealizada} onOpenChange={(v) => !v && setNaoRealizada(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar não realização</DialogTitle>
            <DialogDescription>
              {naoRealizada?.cliente_nome} — informe o motivo. O registro fica no histórico da
              movimentação.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="motivo-nr">
                Motivo
              </label>
              <select
                id="motivo-nr"
                className={`${inputClass} h-11`}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              >
                {MOTIVOS_NAO_REALIZADA.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {motivo === "Outro" && (
              <div>
                <label className={labelClass} htmlFor="motivo-detalhe">
                  Descreva o motivo
                </label>
                <input
                  id="motivo-detalhe"
                  className={`${inputClass} h-11`}
                  value={detalheMotivo}
                  onChange={(e) => setDetalheMotivo(e.target.value)}
                  placeholder="Ex.: cliente pediu para voltar amanhã"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNaoRealizada(null)} disabled={salvando}>
              Voltar
            </Button>
            <Button onClick={() => void confirmarNaoRealizada()} disabled={salvando}>
              {salvando ? "Registrando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
