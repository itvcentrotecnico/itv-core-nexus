/**
 * COMISSÃO DE ENTREGA — incentivo operacional vinculado ao lançamento do Caixa.
 * Nunca altera faturamento, receita líquida ou comissão técnica.
 */

export type ComissaoEntregaTipo = "entrega" | "entrega_avaliacao";

export type ComissaoEntregaStatus =
  "gerada" | "pendente_validacao" | "validada" | "paga" | "cancelada";

export interface ComissaoEntregaConfig {
  valor_taxa_fixa: number;
  /** Bonificação por avaliação Google — só paga após conferência da Gerência. */
  valor_bonificacao_avaliacao: number;
  /** Calculado: taxa fixa + bonificação (somente leitura). */
  valor_taxa_com_avaliacao: number | null;
  exige_validacao: boolean;
  ativo: boolean;
}

export const CONFIG_PADRAO: ComissaoEntregaConfig = {
  valor_taxa_fixa: 5,
  valor_bonificacao_avaliacao: 2.5,
  valor_taxa_com_avaliacao: 7.5,
  exige_validacao: true,
  ativo: true,
};

export type AvaliacaoStatus = "sem_avaliacao" | "aguardando" | "validada" | "nao_validada";

export const AVALIACAO_STATUS: Record<
  AvaliacaoStatus,
  { label: string; tom: "ok" | "alerta" | "erro" | "neutro" }
> = {
  sem_avaliacao: { label: "Sem avaliação", tom: "neutro" },
  aguardando: { label: "Aguardando conferência", tom: "alerta" },
  validada: { label: "Validado", tom: "ok" },
  nao_validada: { label: "Avaliação não validada", tom: "erro" },
};

export const FORMAS_CONFERENCIA = [
  "Conferência direta no Google",
  "Print/comprovante",
  "Confirmação do cliente",
  "Outro meio de comprovação",
] as const;

/** Taxa de conversão = avaliações validadas ÷ entregas × 100. */
export function taxaConversao(validadas: number, entregas: number): number {
  return entregas > 0 ? (validadas / entregas) * 100 : 0;
}

export interface Entregador {
  id: string;
  nome: string;
  cargo?: string | null;
  habilitado?: boolean;
}

export interface ComissaoEntrega {
  id: string;
  data: string;
  os: string | null;
  cliente?: string | null;
  caixa_lancamento_id: string;
  entregador_id: string;
  entregador: string;
  tipo: ComissaoEntregaTipo;
  valor: number;
  valor_base: number;
  bonificacao_solicitada: number;
  bonificacao_validada: number;
  avaliacao_status: AvaliacaoStatus;
  conferencia_forma: string | null;
  conferencia_obs: string | null;
  conferencia_anexo_path: string | null;
  conferido_por: string | null;
  conferido_em: string | null;
  avaliacao_confirmada: boolean;
  avaliacao_observacao: string | null;
  status: ComissaoEntregaStatus;
  motivo_status: string | null;
  lancamento_status: string;
  responsavel: string | null;
  validado_por: string | null;
  validado_em: string | null;
  pago_em: string | null;
  created_at: string;
}

export interface ComissaoEntregaResumo {
  entregador_id: string;
  entregador: string;
  entregas: number;
  com_taxa_fixa: number;
  com_avaliacao: number;
  avaliacoes_confirmadas: number;
  avaliacoes_nao_validadas: number;
  avaliacoes_aguardando: number;
  comissao_base: number;
  bonificacao_validada: number;
  bonificacao_aguardando: number;
  valor_gerado: number;
  valor_validado: number;
  valor_pago: number;
  valor_pendente: number;
  valor_cancelado: number;
}

export const TIPO_ENTREGA: Record<ComissaoEntregaTipo, string> = {
  entrega: "Taxa fixa de entrega",
  entrega_avaliacao: "Taxa fixa + avaliação",
};

export const STATUS_ENTREGA: Record<
  ComissaoEntregaStatus,
  { label: string; tom: "ok" | "alerta" | "erro" | "neutro" }
> = {
  gerada: { label: "Gerada", tom: "neutro" },
  pendente_validacao: { label: "Pendente de validação", tom: "alerta" },
  validada: { label: "Validada", tom: "ok" },
  paga: { label: "Paga", tom: "ok" },
  cancelada: { label: "Cancelada", tom: "erro" },
};
