/**
 * Tipos e utilitários do módulo CAIXA DIÁRIO — GESTÃO ITV CENTRO TÉCNICO.
 * Valores financeiros sempre NUMERIC(12,2) no banco; aqui, number com round2.
 */

export interface TipoReceita {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface FormaPagamento {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
  eh_dinheiro: boolean;
  taxa_padrao_percentual: number;
  permite_parcelamento?: boolean;
  max_parcelas?: number;
  /** false = valor faturado que ainda será recebido (Boleto/Bemol). */
  liquidacao_imediata?: boolean;
  prazo_liquidacao_dias?: number;
}

/** Taxa configurada pelo ADM por quantidade de parcelas. */
export interface FormaPagamentoTaxa {
  id: string;
  forma_pagamento_id: string;
  parcelas: number;
  taxa_percentual: number;
}

export interface CaixaPagamento {
  id: string;
  lancamento_id: string;
  forma_pagamento_id: string;
  valor: number;
  parcelas: number;
  taxa_percentual: number;
  taxa_valor: number;
  forma?: { nome: string; eh_dinheiro: boolean } | null;
}

export type CaixaLancamentoStatus = "ativo" | "cancelado" | "estornado";

export interface CaixaLancamento {
  id: string;
  data_lancamento: string;
  os: string | null;
  cliente: string | null;
  tipo_receita_id: string;
  descricao: string | null;
  tecnico_id: string | null;
  responsavel_id: string;
  valor_bruto: number;
  desconto: number;
  valor_final: number;
  taxas_total: number;
  receita_liquida: number;
  status: CaixaLancamentoStatus;
  observacao: string | null;
  alerta_duplicidade: boolean;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  tipo?: { nome: string } | null;
  tecnico?: { full_name: string } | null;
  responsavel?: { full_name: string } | null;
  pagamentos?: CaixaPagamento[];
}

export interface ResumoPagamentoItem {
  forma: string;
  total: number;
  taxas: number;
}

export interface CaixaFechamento {
  id: string;
  data_referencia: string;
  responsavel_id: string;
  faturamento_total: number;
  taxas_total: number;
  receita_liquida: number;
  dinheiro_esperado: number;
  dinheiro_informado: number;
  diferenca: number | null;
  resumo_pagamentos: ResumoPagamentoItem[];
  observacao: string | null;
  status: "fechado" | "reaberto";
  fechado_em: string;
  reaberto_em: string | null;
  motivo_reabertura: string | null;
  responsavel?: { full_name: string } | null;
  reabridor?: { full_name: string } | null;
}

export interface CaixaIndicadores {
  ok: boolean;
  code?: string;
  quantidade: number;
  faturamento_bruto: number;
  descontos: number;
  faturamento_final: number;
  taxas: number;
  receita_liquida: number;
  os_faturadas: number;
  ticket_medio: number;
}

/** Resultado padronizado das funções RPC do caixa. */
export interface CaixaRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
  valor_final?: number;
  diferenca?: number;
  dinheiro_esperado?: number;
  existente?: {
    os: string;
    data: string;
    cliente: string | null;
    valor: number;
    responsavel: string | null;
  };
  [key: string]: unknown;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const STATUS_LANCAMENTO: Record<CaixaLancamentoStatus, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
  estornado: { label: "Estornado", className: "bg-muted text-muted-foreground" },
};

export const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60";

export const labelClass = "mb-1.5 block text-sm font-medium text-foreground";
