import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  maskTelefone,
  mensagemErro,
  rpcColetas,
  somenteDigitos,
  TIPO_LABEL,
  type ColetaTipo,
} from "@/lib/coletas";
import { CANAIS_CONTATO } from "@/lib/origens";
import type { LinkGerado } from "./link-dialog";

interface Duplicado {
  id: string;
  cliente_nome: string;
  tipo: ColetaTipo;
  status: string;
  bairro: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  condominio: string | null;
  torre_bloco: string | null;
  apartamento: string | null;
  cidade: string | null;
  cep: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  marca_tv: string | null;
  polegadas: number | null;
  created_at: string;
}

/** Passo 1 do fluxo: o atendimento informa o mínimo e o sistema já devolve o link. */
export function NovaSolicitacaoDialog({
  aberto,
  onClose,
  onLink,
}: {
  aberto: boolean;
  onClose: () => void;
  onLink: (link: LinkGerado) => void;
}) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<ColetaTipo>("coleta");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [observacao, setObservacao] = useState("");
  const [horas, setHoras] = useState(72);
  const [canal, setCanal] = useState<string>("WhatsApp");
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [reutilizar, setReutilizar] = useState<Duplicado | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setTipo("coleta");
    setNome("");
    setWhatsapp("");
    setObservacao("");
    setHoras(72);
    setDuplicados([]);
    setReutilizar(null);
    setCanal("WhatsApp");
  }, [aberto]);

  // Alerta de duplicidade assim que o telefone estiver completo (sem bloquear).
  useEffect(() => {
    const d = somenteDigitos(whatsapp);
    if (d.length < 10) {
      setDuplicados([]);
      setReutilizar(null);
      return;
    }
    let cancelado = false;
    const t = setTimeout(() => {
      void rpcColetas<Duplicado[]>("coletas_duplicados", { p_whatsapp: d })
        .then((r) => !cancelado && setDuplicados(r ?? []))
        .catch(() => undefined);
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [whatsapp]);

  async function salvar() {
    if (!nome.trim()) {
      toast.error("Informe o nome do cliente.");
      return;
    }
    if (somenteDigitos(whatsapp).length < 10) {
      toast.error("Informe um WhatsApp válido.");
      return;
    }
    setSalvando(true);
    try {
      const res = await rpcColetas<{ id: string; token: string; expira_em: string }>("coletas_criar", {
        p_tipo: tipo,
        p_nome: nome.trim(),
        p_whatsapp: somenteDigitos(whatsapp),
        p_observacao: observacao.trim() || null,
        p_horas: horas,
        p_origem_id: null,
        p_origem_detalhe: null,
        p_indicado_nome: null,
        p_indicado_telefone: null,
        p_canal_contato: canal || null,
      });

      if (reutilizar) {
        await rpcColetas("coletas_atualizar", {
          p_id: res.id,
          p_dados: {
            cep: reutilizar.cep,
            rua: reutilizar.rua,
            numero: reutilizar.numero,
            complemento: reutilizar.complemento,
            condominio: reutilizar.condominio,
            torre_bloco: reutilizar.torre_bloco,
            apartamento: reutilizar.apartamento,
            bairro: reutilizar.bairro,
            cidade: reutilizar.cidade,
            referencia: reutilizar.referencia,
            latitude: reutilizar.latitude,
            longitude: reutilizar.longitude,
            maps_url: reutilizar.maps_url,
            marca_tv: reutilizar.marca_tv,
            polegadas: reutilizar.polegadas,
          },
        });
        toast.info("Dados anteriores reaproveitados. O cliente ainda confirma o endereço no link.");
      }

      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      onClose();
      onLink({ token: res.token, expira_em: res.expira_em, whatsapp: somenteDigitos(whatsapp), cliente_nome: nome.trim() });
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível criar a solicitação."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Solicitar cadastro para coleta</DialogTitle>
          <DialogDescription>Preencha só o mínimo. O cliente completa o restante pelo link.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <span className={labelClass}>Tipo de movimentação</span>
            <div className="grid grid-cols-2 gap-2">
              {(["coleta", "entrega"] as ColetaTipo[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={`h-11 rounded-md border text-sm font-semibold transition-colors ${
                    tipo === t ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground"
                  }`}
                >
                  {TIPO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="coleta-nome">Nome do cliente</label>
            <input id="coleta-nome" className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
          </div>

          <div>
            <label className={labelClass} htmlFor="coleta-zap">WhatsApp</label>
            <input
              id="coleta-zap"
              className={inputClass}
              inputMode="numeric"
              placeholder="(92) 99999-9999"
              value={whatsapp}
              onChange={(e) => setWhatsapp(maskTelefone(e.target.value))}
            />
          </div>

          {duplicados.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-3.5" /> Já existe cadastro recente para este telefone.
              </p>
              <ul className="mt-1.5 space-y-1.5">
                {duplicados.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {d.cliente_nome} · {TIPO_LABEL[d.tipo]} · {d.bairro ?? "sem bairro"} · {formatDateTimeITV(d.created_at)}
                    </span>
                    {d.rua && (
                      <Button
                        size="sm"
                        variant={reutilizar?.id === d.id ? "default" : "outline"}
                        className="h-7 text-[11px]"
                        onClick={() => setReutilizar(reutilizar?.id === d.id ? null : d)}
                      >
                        {reutilizar?.id === d.id ? "Dados selecionados" : "Reutilizar dados"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">Você pode gerar uma nova solicitação normalmente.</p>
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="coleta-canal">Entrou em contato por</label>
            <select id="coleta-canal" className={inputClass} value={canal} onChange={(e) => setCanal(e.target.value)}>
              {CANAIS_CONTATO.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-muted-foreground">
              "Como conheceu a ITV?" é respondido pelo próprio cliente no link.
            </p>
          </div>

          <div>
            <label className={labelClass} htmlFor="coleta-obs">Observação (opcional)</label>
            <Textarea id="coleta-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          <div>
            <label className={labelClass} htmlFor="coleta-val">Validade do link</label>
            <select id="coleta-val" className={inputClass} value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
              <option value={24}>24 horas</option>
              <option value={48}>48 horas</option>
              <option value={72}>72 horas</option>
              <option value={168}>7 dias</option>
            </select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Gerar link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
