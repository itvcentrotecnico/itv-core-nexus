import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2 } from "lucide-react";
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
import { labelClass } from "@/lib/caixa";
import { rpcColetas, storagePathColeta, type ColetaSolicitacao } from "@/lib/coletas";

/** Conclusão da movimentação: observação opcional e foto direto da câmera. */
export function ConcluirDialog({
  item,
  onClose,
}: {
  item: ColetaSolicitacao | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [observacao, setObservacao] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);

  async function concluir() {
    if (!item) return;
    setSalvando(true);
    try {
      // Falha de foto não pode derrubar a conclusão: avisamos e seguimos.
      let falhas = 0;
      for (const file of arquivos) {
        try {
          const path = storagePathColeta(item.id, file.name);
          const { error } = await supabase.storage.from("coletas").upload(path, file, { upsert: false });
          if (error) throw new Error(error.message);
          await rpcColetas("coletas_foto_registrar", { p_id: item.id, p_path: path });
        } catch {
          falhas += 1;
        }
      }
      await rpcColetas("coletas_concluir", { p_id: item.id, p_observacao: observacao.trim() || null });
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success(item.tipo === "coleta" ? "Coleta concluída." : "Entrega concluída.");
      if (falhas > 0) toast.warning(`Não foi possível enviar ${falhas} foto(s). Você pode tentar novamente pelo detalhe.`);
      setObservacao("");
      setArquivos([]);
      onClose();
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível concluir agora. Tente novamente."));
    } finally {
      setSalvando(false);
    }
  }


  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item?.tipo === "entrega" ? "Confirmar entrega" : "Confirmar coleta"}</DialogTitle>
          <DialogDescription>{item?.cliente_nome} · {item?.bairro ?? "sem bairro"}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <span className={labelClass}>Foto da TV (opcional)</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => setArquivos(Array.from(e.target.files ?? []))}
            />
            <Button variant="outline" className="h-12 w-full" onClick={() => inputRef.current?.click()}>
              <Camera className="mr-2 size-4" /> Adicionar foto
            </Button>
            {arquivos.length > 0 && (
              <p className="mt-1.5 text-xs text-muted-foreground">{arquivos.length} foto(s) selecionada(s).</p>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="obs-conclusao">Observação (opcional)</label>
            <Textarea id="obs-conclusao" rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button className="h-11" onClick={concluir} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" />}
            {item?.tipo === "entrega" ? "ENTREGA CONCLUÍDA" : "TV COLETADA"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
