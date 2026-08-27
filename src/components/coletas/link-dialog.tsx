import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, QrCode as QrIcon, Send } from "lucide-react";
import { toast } from "sonner";

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
import { MENSAGEM_PADRAO, linkCadastro, whatsappUrl } from "@/lib/coletas";
import { labelClass } from "@/lib/caixa";

export interface LinkGerado {
  token: string;
  expira_em: string;
  whatsapp: string;
  cliente_nome: string;
}

/** Ações do link: WhatsApp em primeiro lugar, depois copiar e QR Code. */
export function LinkDialog({ dados, onClose }: { dados: LinkGerado | null; onClose: () => void }) {
  const [mensagem, setMensagem] = useState(MENSAGEM_PADRAO);
  const [qr, setQr] = useState<string | null>(null);
  const [mostrarQr, setMostrarQr] = useState(false);

  const url = dados ? linkCadastro(dados.token) : "";

  useEffect(() => {
    setMensagem(MENSAGEM_PADRAO);
    setMostrarQr(false);
    setQr(null);
  }, [dados?.token]);

  useEffect(() => {
    if (!mostrarQr || !url) return;
    void QRCode.toDataURL(url, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [mostrarQr, url]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  return (
    <Dialog open={!!dados} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link de cadastro gerado</DialogTitle>
          <DialogDescription>
            {dados ? `${dados.cliente_nome} · válido até ${formatDateTimeITV(dados.expira_em)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="msg-coleta">Mensagem para o cliente</label>
            <Textarea id="msg-coleta" rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
          </div>

          <p className="break-all rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">{url}</p>

          <Button
            className="h-12 w-full text-base"
            onClick={() => {
              if (!dados) return;
              window.open(whatsappUrl(dados.whatsapp, `${mensagem}\n\n${url}`), "_blank", "noopener");
            }}
          >
            <Send className="mr-2 size-4" /> Enviar pelo WhatsApp
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="h-11" onClick={copiar}>
              <Copy className="mr-2 size-4" /> Copiar link
            </Button>
            <Button variant="outline" className="h-11" onClick={() => setMostrarQr((v) => !v)}>
              <QrIcon className="mr-2 size-4" /> QR Code
            </Button>
          </div>

          {mostrarQr && (
            <div className="flex justify-center rounded-lg border border-border bg-card p-3">
              {qr ? (
                <img src={qr} alt="QR Code do link de cadastro" className="size-52" />
              ) : (
                <span className="text-sm text-muted-foreground">Gerando QR Code…</span>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
