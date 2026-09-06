import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Copy, ExternalLink, MessageSquareText, QrCode as QrIcon, Send } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTimeITV } from "@/lib/format";
import {
  MENSAGEM_PADRAO,
  linkCadastro,
  maskTelefone,
  mensagemErro,
  montarMensagem,
  rpcColetas,
  whatsappUrl,
} from "@/lib/coletas";
import { labelClass } from "@/lib/caixa";
import { ERRO_URL_PUBLICA } from "@/lib/app-url";

export interface LinkGerado {
  id?: string;
  token: string;
  expira_em: string;
  whatsapp: string;
  cliente_nome: string;
}

/** Template configurável em Administração (settings.coletas_mensagem). */
function useTemplateMensagem() {
  return useQuery({
    queryKey: ["settings", "coletas_mensagem"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "coletas_mensagem")
        .maybeSingle();
      if (error) throw error;
      const v = (data?.value ?? {}) as { template?: string };
      return v.template?.trim() ? v.template : MENSAGEM_PADRAO;
    },
  });
}

/**
 * Ações do link: o sistema apenas ABRE a conversa com a mensagem pronta.
 * O envio continua sendo manual, feito pelo próprio vendedor no WhatsApp.
 */
export function LinkDialog({ dados, onClose }: { dados: LinkGerado | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const template = useTemplateMensagem();
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);
  const [qr, setQr] = useState<string | null>(null);
  const [mostrarQr, setMostrarQr] = useState(false);
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const [aberturas, setAberturas] = useState(0);
  const [falhou, setFalhou] = useState(false);

  const url = dados ? linkCadastro(dados.token) : "";
  const textoFinal = dados ? montarMensagem(mensagem, dados.cliente_nome, url) : "";

  useEffect(() => {
    setMostrarQr(false);
    setQr(null);
    setAbertoEm(null);
    setAberturas(0);
    setFalhou(false);
  }, [dados?.token]);

  useEffect(() => {
    if (template.data) setMensagem(template.data);
  }, [template.data, dados?.token]);

  useEffect(() => {
    if (!mostrarQr || !url) return;
    void QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [mostrarQr, url]);

  async function copiar(texto: string, ok: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success(ok);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  function abrirWhatsapp() {
    if (!dados) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setFalhou(true);
      toast.error(
        "Sem conexão. Tente abrir o WhatsApp novamente quando a internet estiver disponível.",
      );
      return;
    }
    const janela = window.open(whatsappUrl(dados.whatsapp, textoFinal), "_blank", "noopener");
    if (!janela) {
      setFalhou(true);
      toast.error("Não foi possível abrir o WhatsApp automaticamente.");
      return;
    }
    setFalhou(false);
    if (!dados.id) return;
    // Registra apenas "WhatsApp aberto" — nunca "mensagem enviada".
    void rpcColetas<{ whatsapp_aberto_em: string; whatsapp_aberturas: number }>(
      "coletas_whatsapp_aberto",
      {
        p_id: dados.id,
      },
    )
      .then((r) => {
        setAbertoEm(r.whatsapp_aberto_em);
        setAberturas(r.whatsapp_aberturas);
        void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      })
      .catch((e) =>
        toast.error(mensagemErro(e, "Não foi possível registrar a abertura do WhatsApp.")),
      );
  }

  return (
    <Dialog open={!!dados} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastro criado com sucesso</DialogTitle>
          <DialogDescription>
            O sistema prepara a mensagem. O envio no WhatsApp continua sendo feito por você.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {dados && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="font-semibold">{dados.cliente_nome}</p>
              <p className="text-muted-foreground">{maskTelefone(dados.whatsapp)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Status: <span className="font-semibold text-foreground">Aguardando cliente</span> ·
                válido até {formatDateTimeITV(dados.expira_em)}
              </p>
            </div>
          )}

          {!url && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {ERRO_URL_PUBLICA}
            </div>
          )}

          <Button
            className="h-14 w-full text-base font-semibold"
            onClick={abrirWhatsapp}
            disabled={!url}
          >
            <Send className="mr-2 size-5" />
            {aberturas > 0 ? "Reenviar pelo WhatsApp" : "Enviar pelo WhatsApp"}
          </Button>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="outline"
              className="h-11"
              disabled={!url}
              onClick={() => void copiar(url, "Link copiado.")}
            >
              <Copy className="mr-2 size-4" /> Copiar
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={!url}
              onClick={() => setMostrarQr((v) => !v)}
            >
              <QrIcon className="mr-2 size-4" /> QR Code
            </Button>
            <Button
              variant="outline"
              className="h-11"
              disabled={!url}
              onClick={() => window.open(url, "_blank", "noopener")}
            >
              <ExternalLink className="mr-2 size-4" /> Testar
            </Button>
          </div>

          {falhou && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p>Não foi possível abrir o WhatsApp automaticamente. O link continua salvo.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => void copiar(url, "Link copiado.")}
                >
                  Copiar link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9"
                  onClick={() => void copiar(textoFinal, "Mensagem copiada.")}
                >
                  Copiar mensagem
                </Button>
              </div>
            </div>
          )}

          {mostrarQr && (
            <div className="flex justify-center rounded-lg border border-border bg-card p-3">
              {qr ? (
                <img src={qr} alt="QR Code do link de cadastro" className="size-52" />
              ) : (
                <span className="text-sm text-muted-foreground">Gerando QR Code…</span>
              )}
            </div>
          )}

          <div>
            <label className={labelClass} htmlFor="msg-coleta">
              <span className="inline-flex items-center gap-1.5">
                <MessageSquareText className="size-3.5" /> Mensagem (revise antes de enviar)
              </span>
            </label>
            <Textarea
              id="msg-coleta"
              rows={6}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Texto padrão definido pela Administração. Placeholders: {"{primeiro_nome}"} e{" "}
              {"{link}"}.
            </p>
          </div>

          <p className="break-all rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            {url}
          </p>

          <p className="text-[11px] text-muted-foreground">
            Link gerado: agora · WhatsApp aberto: {abertoEm ? formatDateTimeITV(abertoEm) : "—"}
            {aberturas > 1 ? ` · aberturas: ${aberturas}` : ""}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
