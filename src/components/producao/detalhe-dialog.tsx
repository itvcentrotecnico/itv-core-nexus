import { mensagemErro } from "@/lib/erros";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
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
import { labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import {
  ACAO_VALIDACAO,
  type ProducaoFoto,
  type ProducaoRegistro,
  type ProducaoValidacao,
} from "@/lib/producao";
import { invalidateProducao, rpcProd, StatusBadgeProducao, useProducaoRefs } from "./shared";

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value?.trim() ? value : "—"}</p>
    </div>
  );
}

function FotosGrid({ producaoId }: { producaoId: string }) {
  const fotosQuery = useQuery({
    queryKey: ["producao", "fotos", producaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_fotos")
        .select("id, producao_id, storage_path, tipo, descricao, uploaded_by, created_at")
        .eq("producao_id", producaoId)
        .order("created_at");
      if (error) throw error;
      return data as ProducaoFoto[];
    },
  });

  const urlsQuery = useQuery({
    queryKey: ["producao", "fotos-urls", producaoId, (fotosQuery.data ?? []).map((f) => f.storage_path).join(",")],
    enabled: (fotosQuery.data ?? []).length > 0,
    queryFn: async () => {
      const out: Record<string, string> = {};
      for (const f of fotosQuery.data ?? []) {
        const { data } = await supabase.storage.from("producao").createSignedUrl(f.storage_path, 3600);
        if (data?.signedUrl) out[f.id] = data.signedUrl;
      }
      return out;
    },
  });

  const fotos = fotosQuery.data ?? [];
  if (fotos.length === 0) return <p className="text-xs text-muted-foreground">Nenhuma foto anexada.</p>;
  return (
    <div className="grid grid-cols-3 gap-2">
      {fotos.map((f) => (
        <a key={f.id} href={urlsQuery.data?.[f.id]} target="_blank" rel="noreferrer"
          className="block overflow-hidden rounded-lg border border-border">
          {urlsQuery.data?.[f.id] ? (
            <img src={urlsQuery.data[f.id]} alt={f.descricao ?? "Evidência do serviço"} className="aspect-square w-full object-cover" loading="lazy" />
          ) : (
            <div className="aspect-square w-full animate-pulse bg-muted" />
          )}
        </a>
      ))}
    </div>
  );
}

export function DetalheProducaoDialog({
  registro,
  onClose,
  onEditar,
}: {
  registro: ProducaoRegistro | null;
  onClose: () => void;
  onEditar: (r: ProducaoRegistro) => void;
}) {
  const queryClient = useQueryClient();
  const { isAdmin, can, profile } = useAccess();
  const { ehGerencia } = useProducaoRefs();
  const [saving, setSaving] = useState(false);
  const [correcao, setCorrecao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState<"none" | "correcao" | "rejeicao" | "cancelamento">("none");

  const historicoQuery = useQuery({
    queryKey: ["producao", "historico", registro?.id],
    enabled: !!registro,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_validacoes")
        .select("id, producao_id, acao, comentario, usuario_id, created_at, usuario:profiles(full_name)")
        .eq("producao_id", registro!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ProducaoValidacao[];
    },
  });

  if (!registro) return null;

  const ehDono = registro.tecnico_id === profile?.id;
  const podeEditar = ehDono && (registro.status === "rascunho" || registro.status === "correcao_solicitada");
  const podeEnviar = ehDono && (registro.status === "rascunho" || registro.status === "correcao_solicitada");
  const podeCancelar = (ehDono && ["rascunho", "enviado_validacao", "correcao_solicitada"].includes(registro.status)) || isAdmin;
  const podeModerar = ehGerencia && registro.status === "enviado_validacao";

  async function acao(fn: () => Promise<unknown>, msg: string) {
    setSaving(true);
    try {
      await fn();
      toast.success(msg);
      invalidateProducao(queryClient);
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha na operação."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!registro} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            OS {registro.os} <StatusBadgeProducao status={registro.status} />
          </DialogTitle>
          <DialogDescription>
            Registrado por {registro.tecnico?.full_name ?? "técnico"} em {formatDateOnlyISO(registro.data_execucao)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Info label="Cliente" value={registro.cliente} />
            <Info label="Equipamento" value={[registro.marca_tv, registro.modelo_tv, registro.polegadas ? `${registro.polegadas}"` : null].filter(Boolean).join(" ") || null} />
            <Info label="Tipo de Serviço" value={registro.tipo_servico?.nome} />
            <Info label="Valor do Serviço" value={registro.valor_servico != null ? formatCurrencyBRL(registro.valor_servico) : null} />
            <Info label="Mão de Obra" value={registro.valor_mao_obra != null ? formatCurrencyBRL(registro.valor_mao_obra) : null} />
            <Info label="Validado por" value={registro.validado_em ? new Date(registro.validado_em).toLocaleDateString("pt-BR") : null} />
          </div>
          <Info label="Defeito Relatado" value={registro.defeito_relatado} />
          <Info label="Diagnóstico" value={registro.diagnostico} />
          <Info label="Serviço Executado" value={registro.servico_executado} />
          <Info label="Peças / Materiais" value={registro.pecas_descricao} />
          <Info label="Observações" value={registro.observacao} />
          {registro.motivo_rejeicao && <Info label="Motivo da Rejeição" value={registro.motivo_rejeicao} />}

          <div>
            <p className={labelClass}>Fotos</p>
            <FotosGrid producaoId={registro.id} />
          </div>

          <div>
            <p className={labelClass}>Histórico</p>
            {(historicoQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma movimentação ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {(historicoQuery.data ?? []).map((h) => (
                  <li key={h.id} className="rounded-lg border border-border px-3 py-2 text-xs">
                    <span className="font-semibold text-foreground">{ACAO_VALIDACAO[h.acao] ?? h.acao}</span>
                    <span className="text-muted-foreground">
                      {" "}por {h.usuario?.full_name ?? "—"} em{" "}
                      {format(new Date(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                    {h.comentario && <p className="mt-0.5 text-muted-foreground">{h.comentario}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {modo === "correcao" && (
            <div className="space-y-2 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3">
              <label htmlFor="dt-correcao" className={labelClass}>Comentário da correção *</label>
              <Textarea id="dt-correcao" value={correcao} onChange={(e) => setCorrecao(e.target.value)} rows={2} />
              <Button size="sm" disabled={saving || !correcao.trim()}
                onClick={() => void acao(() => rpcProd("producao_solicitar_correcao", { p_id: registro.id, p_comentario: correcao }), "Correção solicitada ao técnico.")}>
                Confirmar solicitação
              </Button>
            </div>
          )}
          {modo === "rejeicao" && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <label htmlFor="dt-rejeicao" className={labelClass}>Motivo da rejeição *</label>
              <Textarea id="dt-rejeicao" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
              <Button size="sm" variant="destructive" disabled={saving || !motivo.trim()}
                onClick={() => void acao(() => rpcProd("producao_rejeitar", { p_id: registro.id, p_motivo: motivo }), "Registro rejeitado.")}>
                Confirmar rejeição
              </Button>
            </div>
          )}
          {modo === "cancelamento" && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <label htmlFor="dt-cancel" className={labelClass}>Motivo do cancelamento *</label>
              <Textarea id="dt-cancel" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} />
              <Button size="sm" variant="destructive" disabled={saving || !motivo.trim()}
                onClick={() => void acao(() => rpcProd("producao_cancelar", { p_id: registro.id, p_motivo: motivo }), "Registro cancelado.")}>
                Confirmar cancelamento
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {podeEditar && (
            <Button variant="outline" disabled={saving} onClick={() => onEditar(registro)}>Editar</Button>
          )}
          {podeEnviar && (
            <Button variant="outline" disabled={saving}
              onClick={() => void acao(() => rpcProd("producao_enviar", { p_id: registro.id }), "Enviado para validação.")}>
              Enviar p/ validação
            </Button>
          )}
          {podeModerar && (
            <>
              <Button disabled={saving}
                onClick={() => void acao(() => rpcProd("producao_validar", { p_id: registro.id }), "Produção validada.")}>
                Validar
              </Button>
              <Button variant="outline" disabled={saving} onClick={() => setModo(modo === "correcao" ? "none" : "correcao")}>
                Solicitar correção
              </Button>
              <Button variant="destructive" disabled={saving} onClick={() => setModo(modo === "rejeicao" ? "none" : "rejeicao")}>
                Rejeitar
              </Button>
            </>
          )}
          {podeCancelar && registro.status !== "cancelado" && (
            <Button variant="ghost" className="text-destructive" disabled={saving}
              onClick={() => setModo(modo === "cancelamento" ? "none" : "cancelamento")}>
              Cancelar registro
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
