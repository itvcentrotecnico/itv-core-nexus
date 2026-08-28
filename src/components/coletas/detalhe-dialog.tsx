import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Link2, MapPin, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatDateTimeITV } from "@/lib/format";
import {
  complementoResumido,
  enderecoCompleto,
  mapsUrl,
  maskCEP,
  maskCPF,
  maskTelefone,
  mensagemErro,
  rpcColetas,
  STATUS_COLETA,
  telUrl,
  TIPO_LABEL,
  whatsappUrl,
  type ColetaSolicitacao,
  type HistoricoItem,
} from "@/lib/coletas";
import { OrigemBloco } from "./origem-bloco";
import { StatusBadgeColeta, useMotoristas } from "./shared";
import type { LinkGerado } from "./link-dialog";

interface Foto {
  id: string;
  storage_path: string;
  created_at: string;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium text-foreground">{valor}</span>
    </div>
  );
}

/** Detalhe completo com histórico, dados sensíveis sob permissão e ações de gestão. */
export function DetalheColetaDialog({
  item,
  onClose,
  usuarios,
  permissoes,
  onLink,
}: {
  item: ColetaSolicitacao | null;
  onClose: () => void;
  usuarios: Record<string, string>;
  permissoes: {
    editar: boolean;
    atribuir: boolean;
    cancelar: boolean;
    criar: boolean;
    verSensiveis: boolean;
  };
  onLink: (link: LinkGerado) => void;
}) {
  const queryClient = useQueryClient();
  const [cpf, setCpf] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cancelando, setCancelando] = useState(false);
  const motoristas = useMotoristas(permissoes.atribuir);

  useEffect(() => {
    setCpf(null);
    setMotivo("");
    setCancelando(false);
  }, [item?.id]);

  const fotosQuery = useQuery({
    queryKey: ["coletas", "fotos", item?.id],
    enabled: !!item,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coletas_fotos")
        .select("id, storage_path, created_at")
        .eq("solicitacao_id", item!.id)
        .order("created_at");
      if (error) throw error;
      const fotos = (data ?? []) as Foto[];
      const urls = await Promise.all(
        fotos.map(async (f) => {
          const { data: signed } = await supabase.storage.from("coletas").createSignedUrl(f.storage_path, 3600);
          return { ...f, url: signed?.signedUrl ?? null };
        }),
      );
      return urls;
    },
  });

  const historicoQuery = useQuery({
    queryKey: ["coletas", "historico", item?.id],
    enabled: !!item,
    queryFn: () => rpcColetas<HistoricoItem[]>("coletas_historico_listar", { p_id: item!.id }),
  });

  async function acao(fn: () => Promise<unknown>, sucesso: string) {
    try {
      await fn();
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success(sucesso);
    } catch (e) {
      toast.error(mensagemErro(e, "Ação não permitida."));
    }
  }

  if (!item) return null;
  const complemento = complementoResumido(item);

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {item.cliente_nome} <StatusBadgeColeta status={item.status} />
          </DialogTitle>
          <DialogDescription>
            {TIPO_LABEL[item.tipo]} · criada em {formatDateTimeITV(item.created_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <Button asChild variant="outline" className="h-11 flex-col gap-0.5 text-[11px]">
            <a href={mapsUrl(item)} target="_blank" rel="noopener noreferrer"><MapPin className="size-4" /> MAPA</a>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-col gap-0.5 text-[11px]">
            <a href={whatsappUrl(item.whatsapp)} target="_blank" rel="noopener noreferrer"><MessageCircle className="size-4" /> WHATSAPP</a>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-col gap-0.5 text-[11px]">
            <a href={telUrl(item.whatsapp)}><Phone className="size-4" /> LIGAR</a>
          </Button>
        </div>

        <section>
          <h3 className="font-display text-sm font-bold text-foreground">Cliente</h3>
          <Linha rotulo="WhatsApp" valor={maskTelefone(item.whatsapp)} />
          <Linha rotulo="Telefone alternativo" valor={item.telefone_alternativo ? maskTelefone(item.telefone_alternativo) : null} />
          {permissoes.verSensiveis && (
            <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="text-muted-foreground">CPF</span>
              {cpf ? (
                <span className="font-medium text-foreground">{maskCPF(cpf)}</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    void rpcColetas<string | null>("coletas_cpf", { p_id: item.id })
                      .then((v) => setCpf(v ?? "não informado"))
                      .catch((e: Error) => toast.error(e.message))
                  }
                >
                  <Eye className="mr-1 size-3.5" /> Revelar CPF
                </Button>
              )}
            </div>
          )}
        </section>

        <OrigemBloco item={item} podeEditar={permissoes.editar} />

        <section>
          <h3 className="font-display text-sm font-bold text-foreground">Endereço</h3>
          <Linha rotulo="Endereço" valor={enderecoCompleto(item)} />
          <Linha rotulo="CEP" valor={item.cep ? maskCEP(item.cep) : null} />
          <Linha rotulo="Complemento" valor={complemento || null} />
          <Linha rotulo="Referência" valor={item.referencia} />
          <Linha
            rotulo="Localização"
            valor={item.latitude != null ? `${item.latitude}, ${item.longitude}` : item.maps_url ? "Link do Maps" : null}
          />
        </section>

        <section>
          <h3 className="font-display text-sm font-bold text-foreground">TV</h3>
          <Linha rotulo="Marca" valor={item.marca_tv} />
          <Linha rotulo="Polegadas" valor={item.polegadas ? `${item.polegadas}"` : null} />
          <Linha rotulo="Observação" valor={item.observacao} />
          <Linha rotulo="Observação da conclusão" valor={item.observacao_conclusao} />
        </section>

        <section>
          <h3 className="font-display text-sm font-bold text-foreground">Histórico</h3>
          <Linha rotulo="Atendimento" valor={item.created_by ? usuarios[item.created_by] : null} />
          <Linha rotulo="Link gerado em" valor={item.link_gerado_em ? formatDateTimeITV(item.link_gerado_em) : null} />
          <Linha rotulo="Link válido até" valor={item.link_expira_em ? formatDateTimeITV(item.link_expira_em) : null} />
          <Linha rotulo="Cliente respondeu em" valor={item.preenchido_em ? formatDateTimeITV(item.preenchido_em) : null} />
          <Linha rotulo="Motorista" valor={item.motorista_id ? usuarios[item.motorista_id] : null} />
          <Linha rotulo="Assumida em" valor={item.assumido_em ? formatDateTimeITV(item.assumido_em) : null} />
          <Linha rotulo="Concluída em" valor={item.concluido_em ? formatDateTimeITV(item.concluido_em) : null} />
          <Linha rotulo="Concluída por" valor={item.concluido_por ? usuarios[item.concluido_por] : null} />
          <Linha rotulo="Cancelada em" valor={item.cancelado_em ? formatDateTimeITV(item.cancelado_em) : null} />
          <Linha rotulo="Cancelada por" valor={item.cancelado_por ? usuarios[item.cancelado_por] : null} />
          <Linha rotulo="Motivo do cancelamento" valor={item.motivo_cancelamento} />
        </section>

        <section>
          <h3 className="font-display text-sm font-bold text-foreground">Linha do tempo</h3>
          {historicoQuery.isLoading && <p className="py-2 text-sm text-muted-foreground">Carregando…</p>}
          {historicoQuery.isError && (
            <p className="py-2 text-sm text-muted-foreground">Não foi possível carregar a linha do tempo.</p>
          )}
          {!historicoQuery.isLoading && !historicoQuery.isError && (historicoQuery.data ?? []).length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">Nenhuma movimentação registrada ainda.</p>
          )}
          <ol className="mt-2 space-y-2">
            {(historicoQuery.data ?? []).map((h) => (
              <li key={h.id} className="border-l-2 border-primary/40 pl-3 text-sm">
                <p className="font-medium text-foreground">
                  {STATUS_COLETA[h.status as keyof typeof STATUS_COLETA]?.label ?? h.status}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTimeITV(h.created_at)}
                  {h.autor ? ` · ${h.autor}` : ""}
                </p>
                {h.motivo && <p className="text-xs text-muted-foreground">Motivo: {h.motivo}</p>}
              </li>
            ))}
          </ol>
        </section>


        {(fotosQuery.data ?? []).length > 0 && (
          <section>
            <h3 className="font-display text-sm font-bold text-foreground">Fotos</h3>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(fotosQuery.data ?? []).map((f) =>
                f.url ? (
                  <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer">
                    <img src={f.url} alt="Foto da movimentação" className="h-24 w-full rounded-md object-cover" loading="lazy" />
                  </a>
                ) : null,
              )}
            </div>
          </section>
        )}

        {permissoes.atribuir && item.status !== "concluida" && item.status !== "cancelada" && (
          <div>
            <label className={labelClass} htmlFor="atribuir-motorista">Motorista responsável</label>
            <select
              id="atribuir-motorista"
              className={inputClass}
              value={item.motorista_id ?? ""}
              onChange={(e) =>
                void acao(
                  () => rpcColetas("coletas_atribuir", { p_id: item.id, p_motorista: e.target.value || null }),
                  "Motorista atualizado.",
                )
              }
            >
              <option value="">Sem atribuição (qualquer motorista pode assumir)</option>
              {(motoristas.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>{m.full_name}</option>
              ))}
            </select>
          </div>
        )}

        {permissoes.criar && item.status === "aguardando_cadastro" && (
          <Button
            variant="outline"
            className="h-11 w-full"
            onClick={() =>
              void rpcColetas<{ token: string; expira_em: string }>("coletas_gerar_link", { p_id: item.id })
                .then((r) => {
                  void queryClient.invalidateQueries({ queryKey: ["coletas"] });
                  onLink({ ...r, whatsapp: item.whatsapp, cliente_nome: item.cliente_nome });
                })
                .catch((e: Error) => toast.error(e.message))
            }
          >
            <Link2 className="mr-2 size-4" /> Gerar / reenviar link
          </Button>
        )}

        {permissoes.cancelar && item.status !== "concluida" && item.status !== "cancelada" && (
          <div className="rounded-md border border-destructive/40 p-3">
            {cancelando ? (
              <div className="space-y-2">
                <label className={labelClass} htmlFor="motivo-cancel">Motivo do cancelamento</label>
                <Textarea id="motivo-cancel" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                <div className="flex gap-2">
                  <Button variant="ghost" className="flex-1" onClick={() => setCancelando(false)}>Voltar</Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() =>
                      void acao(() => rpcColetas("coletas_cancelar", { p_id: item.id, p_motivo: motivo }), "Solicitação cancelada.").then(
                        () => onClose(),
                      )
                    }
                  >
                    Confirmar cancelamento
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" className="w-full text-destructive" onClick={() => setCancelando(true)}>
                Cancelar solicitação
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
