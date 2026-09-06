/**
 * COMISSÃO DE ENTREGA — incentivo operacional vinculado ao lançamento do Caixa.
 * Nunca altera faturamento, receita líquida ou comissão técnica.
 */

export type ComissaoEntregaTipo = "entrega" | "entrega_avaliacao";

export type ComissaoEntregaStatus =
  "gerada" | "pendente_validacao" | "validada" | "paga" | "cancelada";

export interface ComissaoEntregaConfig {
  valor_taxa_fixa: number;
  valor_taxa_com_avaliacao: number | null;
  exige_validacao: boolean;
  ativo: boolean;
}

export const CONFIG_PADRAO: ComissaoEntregaConfig = {
  valor_taxa_fixa: 5,
  valor_taxa_com_avaliacao: null,
  exige_validacao: true,
  ativo: true,
};

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
  caixa_lancamento_id: string;
  entregador_id: string;
  entregador: string;
  tipo: ComissaoEntregaTipo;
  valor: number;
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
