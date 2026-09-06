import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin } from "lucide-react";
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
import {
  complementoResumido,
  enderecoCompleto,
  maskCEP,
  mensagemErro,
  rpcColetas,
  somenteDigitos,
  type ColetaSolicitacao,
} from "@/lib/coletas";

/**
 * Passo de reaproveitamento: a entrega nasce da coleta concluída,
 * com opção de endereço próprio sem alterar o registro original.
 */
export function CriarEntregaDialog({
  coleta,
  onClose,
}: {
  coleta: ColetaSolicitacao | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [modo, setModo] = useState<"mesmo" | "novo">("mesmo");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");

  const [cep, setCep] = useState("");
  const [rua, setRua] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [condominio, setCondominio] = useState("");
  const [torre, setTorre] = useState("");
  const [apartamento, setApartamento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("Manaus");
  const [referencia, setReferencia] = useState("");

  useEffect(() => {
    if (!coleta) return;
    setModo("mesmo");
    setErro(null);
    setSalvando(false);
    setObservacao("");
    setCep(coleta.cep ?? "");
    setRua(coleta.rua ?? "");
    setNumero(coleta.numero ?? "");
    setComplemento(coleta.complemento ?? "");
    setCondominio(coleta.condominio ?? "");
    setTorre(coleta.torre_bloco ?? "");
    setApartamento(coleta.apartamento ?? "");
    setBairro(coleta.bairro ?? "");
    setCidade(coleta.cidade ?? "Manaus");
    setReferencia(coleta.referencia ?? "");
  }, [coleta?.id]);

  // Busca de CEP apenas no modo endereço novo, sem travar o cadastro em caso de falha.
  useEffect(() => {
    if (modo !== "novo") return;
    const d = somenteDigitos(cep);
    if (d.length !== 8) return;
    let cancelado = false;
    void fetch(`https://viacep.com.br/ws/${d}/json/`)
      .then((r) => r.json())
      .then((j: { logradouro?: string; bairro?: string; localidade?: string; erro?: boolean }) => {
        if (cancelado || j.erro) return;
        if (j.logradouro) setRua((v) => v || j.logradouro!);
        if (j.bairro) setBairro((v) => v || j.bairro!);
        if (j.localidade) setCidade(j.localidade);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [cep, modo]);

  async function criar() {
    if (!coleta) return;
    if (modo === "novo" && (!rua.trim() || !numero.trim() || !bairro.trim())) {
      setErro("Informe rua, número e bairro do novo endereço.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      await rpcColetas("coletas_criar_entrega", {
        p_coleta_id: coleta.id,
        p_dados: {
          endereco_proprio: modo === "novo",
          cep,
          rua,
          numero,
          complemento,
          condominio,
          torre_bloco: torre,
          apartamento,
          bairro,
          cidade,
          referencia,
          observacao,
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success("Entrega criada com os dados da coleta.");
      onClose();
    } catch (e) {
      setErro(mensagemErro(e, "Não foi possível criar a entrega."));
    } finally {
      setSalvando(false);
    }
  }

  if (!coleta) return null;
  const complementoTexto = complementoResumido(coleta);

  return (
    <Dialog open={!!coleta} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar entrega</DialogTitle>
          <DialogDescription>
            Reaproveitando os dados de {coleta.cliente_nome}. A coleta original não será alterada.
          </DialogDescription>
        </DialogHeader>

        <section className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <p className="flex items-start gap-2 font-medium text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            {enderecoCompleto(coleta)}
          </p>
          {complementoTexto && (
            <p className="mt-1 text-xs text-muted-foreground">{complementoTexto}</p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={modo === "mesmo" ? "default" : "outline"}
            className="h-11"
            onClick={() => setModo("mesmo")}
          >
            Usar endereço da coleta
          </Button>
          <Button
            type="button"
            variant={modo === "novo" ? "default" : "outline"}
            className="h-11"
            onClick={() => setModo("novo")}
          >
            Alterar endereço
          </Button>
        </div>

        {modo === "novo" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="e-cep">
                  CEP
                </label>
                <input
                  id="e-cep"
                  className={`${inputClass} h-11`}
                  inputMode="numeric"
                  value={cep}
                  onChange={(e) => setCep(maskCEP(e.target.value))}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="e-num">
                  Número *
                </label>
                <input
                  id="e-num"
                  className={`${inputClass} h-11`}
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="e-rua">
                Rua *
              </label>
              <input
                id="e-rua"
                className={`${inputClass} h-11`}
                value={rua}
                onChange={(e) => setRua(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="e-bairro">
                  Bairro *
                </label>
                <input
                  id="e-bairro"
                  className={`${inputClass} h-11`}
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="e-cidade">
                  Cidade
                </label>
                <input
                  id="e-cidade"
                  className={`${inputClass} h-11`}
                  value={cidade}
                  onChange={(e) => setCidade(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass} htmlFor="e-cond">
                  Condomínio
                </label>
                <input
                  id="e-cond"
                  className={`${inputClass} h-11`}
                  value={condominio}
                  onChange={(e) => setCondominio(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="e-torre">
                  Torre / Bloco
                </label>
                <input
                  id="e-torre"
                  className={`${inputClass} h-11`}
                  value={torre}
                  onChange={(e) => setTorre(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="e-ap">
                  Apartamento
                </label>
                <input
                  id="e-ap"
                  className={`${inputClass} h-11`}
                  value={apartamento}
                  onChange={(e) => setApartamento(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="e-compl">
                Complemento
              </label>
              <input
                id="e-compl"
                className={`${inputClass} h-11`}
                value={complemento}
                onChange={(e) => setComplemento(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="e-ref">
                Ponto de referência
              </label>
              <input
                id="e-ref"
                className={`${inputClass} h-11`}
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="e-obs">
            Observação da entrega (opcional)
          </label>
          <Textarea
            id="e-obs"
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>

        {erro && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="h-11" onClick={criar} disabled={salvando}>
            {salvando && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />}{" "}
            Confirmar entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
