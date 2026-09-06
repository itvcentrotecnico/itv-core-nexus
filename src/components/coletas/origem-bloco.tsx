import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatDateTimeITV } from "@/lib/format";
import { mensagemErro, somenteDigitos, type ColetaSolicitacao } from "@/lib/coletas";
import {
  ORIGEM_NAO_INFORMADA,
  ORIGEM_VAZIA,
  rpcOrigens,
  useOrigens,
  validarOrigem,
  type OrigemValor,
} from "@/lib/origens";
import { OrigemPicker } from "./origem-picker";

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium text-foreground">{valor}</span>
    </div>
  );
}

/**
 * Mostra a origem já registrada (sem perguntar de novo) e permite correção
 * por usuário autorizado, com motivo e auditoria no banco.
 */
export function OrigemBloco({
  item,
  podeEditar,
}: {
  item: ColetaSolicitacao;
  podeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const { data: origens } = useOrigens();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<OrigemValor>(ORIGEM_VAZIA);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  const nomeAtual = origens?.find((o) => o.id === item.origem_id)?.nome ?? null;
  const nomeOriginal = origens?.find((o) => o.id === item.origem_original_id)?.nome ?? null;

  function abrir() {
    setValor({
      ...ORIGEM_VAZIA,
      origem_id: item.origem_id,
      origem_nome: nomeAtual,
      detalhe: item.origem_detalhe ?? "",
      indicado_nome: item.indicado_por_nome ?? "",
      canal: item.canal_contato ?? "WhatsApp",
    });
    setMotivo("");
    setEditando(true);
  }

  async function salvar() {
    const erro = validarOrigem(valor, origens);
    if (erro) {
      toast.error(erro);
      return;
    }
    setSalvando(true);
    try {
      await rpcOrigens("coletas_origem_definir", {
        p_id: item.id,
        p_origem_id: valor.origem_id,
        p_detalhe: valor.detalhe.trim() || null,
        p_indicado_nome: valor.indicado_nome.trim() || null,
        p_indicado_telefone: somenteDigitos(valor.indicado_telefone) || null,
        p_canal: valor.canal || null,
        p_motivo: motivo.trim() || null,
      });
      toast.success("Origem atualizada.");
      setEditando(false);
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível salvar a origem."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold text-foreground">Origem do cliente</h3>
        {podeEditar && !editando && (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={abrir}>
            <PencilLine className="mr-1 size-3.5" /> {nomeAtual ? "Corrigir" : "Informar"}
          </Button>
        )}
      </div>

      {!editando && (
        <>
          <Linha rotulo="Como conheceu a ITV" valor={nomeAtual ?? ORIGEM_NAO_INFORMADA} />
          <Linha rotulo="Detalhe" valor={item.origem_detalhe} />
          <Linha
            rotulo="Origem original"
            valor={nomeOriginal && nomeOriginal !== nomeAtual ? nomeOriginal : null}
          />
          <Linha rotulo="Quem indicou" valor={item.indicado_por_nome} />
          <Linha rotulo="Canal de contato" valor={item.canal_contato} />
          <Linha
            rotulo="Origem registrada em"
            valor={item.origem_preenchida_em ? formatDateTimeITV(item.origem_preenchida_em) : null}
          />
        </>
      )}

      {editando && (
        <div className="mt-2 space-y-3">
          <OrigemPicker valor={valor} onChange={setValor} mostrarCanal compacto />
          <div>
            <label className={labelClass} htmlFor="origem-motivo">
              Motivo da correção (opcional)
            </label>
            <input
              id="origem-motivo"
              className={inputClass}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="mr-2 size-4 animate-spin" />} Salvar origem
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
