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
import { MOTIVOS_EXCLUSAO, mensagemErro, rpcColetas, TIPO_LABEL, type ColetaSolicitacao } from "@/lib/coletas";

/** Exclusão lógica com motivo obrigatório — o registro segue auditável. */
export function ExcluirDialog({
  item,
  temEntregaVinculada,
  onClose,
}: {
  item: ColetaSolicitacao | null;
  temEntregaVinculada?: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [motivo, setMotivo] = useState(MOTIVOS_EXCLUSAO[0] ?? "Cadastro duplicado");
  const [detalhe, setDetalhe] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setMotivo(MOTIVOS_EXCLUSAO[0] ?? "Cadastro duplicado");
    setDetalhe("");
    setErro(null);
    setSalvando(false);
  }, [item?.id]);

  async function excluir() {
    if (!item) return;
    if (motivo === "Outro" && !detalhe.trim()) {
      setErro("Descreva o motivo da exclusão.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await rpcColetas("coletas_excluir", {
        p_id: item.id,
        p_motivo: detalhe.trim() ? `${motivo} — ${detalhe.trim()}` : motivo,
      });
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success("Registro excluído.");
      onClose();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível excluir este registro."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir registro</DialogTitle>
          <DialogDescription>
            {item ? `${TIPO_LABEL[item.tipo]} · ${item.cliente_nome}` : ""}
          </DialogDescription>
        </DialogHeader>

        {temEntregaVinculada && (
          <p className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Esta coleta possui entrega vinculada. O histórico da entrega será preservado.
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="motivo-exclusao">Motivo *</label>
            <select
              id="motivo-exclusao"
              className={`${inputClass} h-11`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {MOTIVOS_EXCLUSAO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="detalhe-exclusao">
              Detalhe {motivo === "Outro" ? "*" : "(opcional)"}
            </label>
            <Textarea id="detalhe-exclusao" rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            O registro sai das listas operacionais, mas continua guardado para auditoria e pode ser restaurado pela
            administração.
          </p>
          {erro && <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button variant="destructive" className="h-11" onClick={excluir} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />} Excluir registro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
