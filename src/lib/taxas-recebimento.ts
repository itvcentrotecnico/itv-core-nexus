/**
 * Tabela central de taxas de recebimento (adquirentes).
 * O cálculo oficial é feito no banco; aqui apenas espelhamos a mesma regra
 * para pré-visualizar a taxa antes de salvar. Nunca inventar percentual.
 */
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { round2 } from "@/lib/caixa";

export type MeioTaxa = "pix" | "debito" | "credito" | "saldo" | "boleto" | "outros";

export interface TaxaRecebimento {
  id: string;
  adquirente: string;
  canal: string;
  meio_pagamento: string;
  modalidade: string;
  parcelas: number;
  taxa_percentual: number;
  taxa_cliente_percentual: number;
  responsavel_taxa: string;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  ativo: boolean;
  observacao: string | null;
}

export interface TaxaResolvida {
  ok: boolean;
  message?: string;
  regra?: TaxaRecebimento;
  /** Percentual suportado pela ITV (reduz a receita líquida). */
  percentualItv: number;
  /** Percentual de juros suportado pelo cliente (não é custo da ITV). */
  percentualCliente: number;
}

/** Todas as taxas cadastradas (ativas e históricas). */
export function useTaxasRecebimento(enabled = true) {
  return useQuery({
    queryKey: ["taxas-recebimento"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<TaxaRecebimento[]> => {
      const { data, error } = await supabase
        .from("taxas_recebimento")
        .select(
          "id, adquirente, canal, meio_pagamento, modalidade, parcelas, taxa_percentual, taxa_cliente_percentual, responsavel_taxa, vigencia_inicio, vigencia_fim, ativo, observacao",
        )
        .order("adquirente")
        .order("canal")
        .order("meio_pagamento")
        .order("parcelas");
      if (error) throw error;
      return (data ?? []).map((t) => ({
        ...t,
        taxa_percentual: Number(t.taxa_percentual),
        taxa_cliente_percentual: Number(t.taxa_cliente_percentual),
      })) as TaxaRecebimento[];
    },
  });
}

function vigente(t: TaxaRecebimento, data: string): boolean {
  return t.ativo && t.vigencia_inicio <= data && (!t.vigencia_fim || t.vigencia_fim >= data);
}

/** Espelho da função `taxa_recebimento_resolver` do banco (apenas pré-visualização). */
export function resolverTaxa(
  taxas: TaxaRecebimento[],
  args: { adquirente: string | null; canal: string | null; meio: string | null; parcelas: number; data: string },
): TaxaResolvida {
  const { adquirente, canal, meio, data } = args;
  const parcelas = Math.max(1, args.parcelas || 1);
  if (!meio) return { ok: true, percentualItv: 0, percentualCliente: 0 };
  if (!adquirente) return { ok: true, percentualItv: 0, percentualCliente: 0 };

  const candidatas = taxas
    .filter(
      (t) =>
        t.adquirente.toLowerCase() === adquirente.toLowerCase() &&
        t.canal.toLowerCase() === (canal ?? "").toLowerCase() &&
        t.meio_pagamento.toLowerCase() === meio.toLowerCase() &&
        t.parcelas === parcelas &&
        vigente(t, data),
    )
    .sort((a, b) => (a.vigencia_inicio < b.vigencia_inicio ? 1 : -1));

  const regra = candidatas[0];
  if (!regra) {
    return {
      ok: false,
      percentualItv: 0,
      percentualCliente: 0,
      message: `Taxa do ${adquirente} para ${canal ?? "este canal"} em ${parcelas}x ainda não está configurada. Solicite a atualização da tabela antes de concluir este lançamento.`,
    };
  }

  const cliente = regra.responsavel_taxa === "cliente";
  return {
    ok: true,
    regra,
    percentualItv: cliente ? 0 : regra.taxa_percentual,
    percentualCliente: cliente ? regra.taxa_percentual : regra.taxa_cliente_percentual,
  };
}

export function valorTaxa(valor: number, percentual: number): number {
  return round2((valor * percentual) / 100);
}

export const MEIOS_LABEL: Record<string, string> = {
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  saldo: "Saldo em conta",
  boleto: "Boleto",
  outros: "Outros",
};

export const MODALIDADES_LABEL: Record<string, string> = {
  a_vista: "À vista",
  parcelado_vendedor: "Parcelado — vendedor paga",
  parcelado_cliente: "Parcelado — cliente paga os juros",
};
