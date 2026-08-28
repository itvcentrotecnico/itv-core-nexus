import { useQuery } from "@tanstack/react-query";
import { Bike } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL } from "@/lib/format";
import {
  CONFIG_PADRAO,
  type ComissaoEntregaConfig,
  type ComissaoEntregaTipo,
  type Entregador,
} from "@/lib/comissao-entrega";
import { cn } from "@/lib/utils";

export interface ComissaoEntregaEstado {
  ativa: boolean;
  entregadorId: string;
  tipo: ComissaoEntregaTipo;
  avaliacaoConfirmada: boolean;
  observacao: string;
}

export const COMISSAO_ENTREGA_VAZIA: ComissaoEntregaEstado = {
  ativa: false,
  entregadorId: "",
  tipo: "entrega",
  avaliacaoConfirmada: false,
  observacao: "",
};

/** Configuração vigente da comissão de entrega (valores definidos pelo ADM). */
export function useComissaoEntregaConfig(enabled: boolean) {
  return useQuery({
    queryKey: ["comissao-entrega", "config"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ComissaoEntregaConfig> => {
      const { data, error } = await supabase.rpc("comissao_entrega_config");
      if (error) throw error;
      return { ...CONFIG_PADRAO, ...((data ?? {}) as Partial<ComissaoEntregaConfig>) };
    },
  });
}

export function useEntregadores(enabled: boolean) {
  return useQuery({
    queryKey: ["comissao-entrega", "entregadores"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Entregador[]> => {
      const { data, error } = await supabase.rpc("comissao_entrega_entregadores");
      if (error) throw error;
      return (data ?? []) as unknown as Entregador[];
    },
  });
}

interface Props {
  valor: ComissaoEntregaEstado;
  onChange: (patch: Partial<ComissaoEntregaEstado>) => void;
  config: ComissaoEntregaConfig | undefined;
  entregadores: Entregador[];
  bloqueado?: boolean;
}

/** Seção "Comissão de Entrega" do lançamento do caixa (incentivo operacional). */
export function ComissaoEntregaSection({ valor, onChange, config, entregadores, bloqueado = false }: Props) {
  const cfg = config ?? CONFIG_PADRAO;
  if (!cfg.ativo) return null;

  const valorPrevisto =
    valor.tipo === "entrega" ? cfg.valor_taxa_fixa : cfg.valor_taxa_com_avaliacao;

  const faltaEntregador = valor.ativa && !valor.entregadorId;

  return (
    <div
      className={cn(
        "mt-6 rounded-xl border-2 p-4 transition-colors",
        valor.ativa ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Bike className="mt-0.5 size-5 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              O aparelho foi entregue por um motorista?
            </p>
            <p className="text-xs text-muted-foreground">
              Ative para registrar quem entregou e gerar a comissão de entrega. Não altera o
              faturamento nem a comissão técnica.
            </p>
          </div>
        </div>
        <Switch
          checked={valor.ativa}
          disabled={bloqueado}
          aria-label="O aparelho foi entregue por um motorista"
          onCheckedChange={(v) => onChange({ ativa: v })}
        />
      </div>

      {valor.ativa ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ce-entregador">
              Quem entregou? <span className="text-destructive">*</span>
            </label>
            <Select
              value={valor.entregadorId}
              onValueChange={(v) => onChange({ entregadorId: v })}
              disabled={bloqueado}
            >
              <SelectTrigger
                id="ce-entregador"
                className={cn("w-full", faltaEntregador && "border-destructive")}
              >
                <SelectValue placeholder="Selecione o motorista/entregador" />
              </SelectTrigger>
              <SelectContent>
                {entregadores.length === 0 ? (
                  <SelectItem value="__vazio__" disabled>
                    Nenhum colaborador habilitado
                  </SelectItem>
                ) : (
                  entregadores.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {faltaEntregador ? (
              <p className="mt-1 text-xs text-destructive">
                Escolha o motorista para salvar o lançamento.
              </p>
            ) : entregadores.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Peça ao administrador para habilitar o colaborador em Administração › Colaboradores.
              </p>
            ) : null}
          </div>


          <div>
            <label className={labelClass} htmlFor="ce-tipo">
              Comissão do motorista
            </label>
            <Select
              value={valor.tipo}
              onValueChange={(v) =>
                onChange({ tipo: v as ComissaoEntregaTipo, avaliacaoConfirmada: false })
              }
              disabled={bloqueado}
            >
              <SelectTrigger id="ce-tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrega">
                  Taxa fixa de entrega ({formatCurrencyBRL(cfg.valor_taxa_fixa)})
                </SelectItem>
                <SelectItem value="entrega_avaliacao">
                  Taxa fixa + avaliação
                  {cfg.valor_taxa_com_avaliacao != null
                    ? ` (${formatCurrencyBRL(cfg.valor_taxa_com_avaliacao)})`
                    : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {valor.tipo === "entrega_avaliacao" ? (
            <>
              <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-1">
                <span className="text-foreground">Avaliação confirmada</span>
                <Switch
                  checked={valor.avaliacaoConfirmada}
                  disabled={bloqueado}
                  aria-label="Avaliação confirmada pelo cliente"
                  onCheckedChange={(v) => onChange({ avaliacaoConfirmada: v })}
                />
              </label>
              <div className="sm:col-span-1">
                <label className={labelClass} htmlFor="ce-obs">
                  Comprovação da avaliação{" "}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="ce-obs"
                  value={valor.observacao}
                  disabled={bloqueado}
                  onChange={(e) => onChange({ observacao: e.target.value })}
                  className={inputClass}
                  placeholder="Ex.: print enviado no grupo"
                />
              </div>
            </>
          ) : null}

          <div
            className={cn(
              "rounded-md px-3 py-2 text-sm sm:col-span-2",
              valorPrevisto != null ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
            )}
          >
            {valorPrevisto != null ? (
              <>
                Valor da comissão: <strong>{formatCurrencyBRL(valorPrevisto)}</strong> — será registrada
                como {cfg.exige_validacao || valor.tipo === "entrega_avaliacao" ? "pendente de validação" : "gerada"}.
                O pagamento nunca é automático.
              </>
            ) : (
              <>O valor de “entrega + avaliação” ainda não foi definido em Administração › Parâmetros.</>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
