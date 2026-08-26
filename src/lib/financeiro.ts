/**
 * Tipos e utilitários do módulo FINANCEIRO — GESTÃO ITV CENTRO TÉCNICO.
 * Valores financeiros sempre NUMERIC(12,2) no banco; aqui, number.
 * Saldos são sempre derivados dos movimentos (pagamentos/recebimentos).
 */

export interface CategoriaFinanceira {
  id: string;
  nome: string;
  tipo: "despesa" | "receita" | "ambos";
  ativo: boolean;
  ordem: number;
}

export interface SubcategoriaFinanceira {
  id: string;
  categoria_id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface CentroCusto {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export type DespesaStatus = "pendente" | "paga" | "cancelada";

export interface Despesa {
  id: string;
  descricao: string;
  categoria_id: string | null;
  subcategoria_id: string | null;
  fornecedor_id: string | null;
  centro_custo_id: string | null;
  competencia: string;
  data_lancamento: string;
  vencimento: string | null;
  valor: number;
  status: DespesaStatus;
  recorrente: boolean;
  observacao: string | null;
  comprovante_path: string | null;
  responsavel_id: string;
  conta_pagar_id: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  categoria?: { nome: string } | null;
  fornecedor?: { nome: string } | null;
  centro?: { nome: string } | null;
  responsavel?: { full_name: string } | null;
}

export type ContaPagarStatus = "pendente" | "parcialmente_pago" | "pago" | "cancelado";
export type ContaReceberStatus = "pendente" | "parcialmente_recebido" | "recebido" | "cancelado";

/** Linha da visão contas_pagar_saldos (saldo calculado dos movimentos). */
export interface ContaPagarSaldo {
  id: string;
  descricao: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  categoria_id: string | null;
  subcategoria_id: string | null;
  centro_custo_id: string | null;
  despesa_id: string | null;
  competencia: string | null;
  data_emissao: string;
  vencimento: string;
  valor_original: number;
  valor_pago: number;
  saldo: number;
  forma_pagamento_id: string | null;
  status: ContaPagarStatus;
  recorrente: boolean;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
  observacao: string | null;
  responsavel_id: string;
  responsavel_nome: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  vencido: boolean;
  dias_atraso: number;
}

/** Linha da visão contas_receber_saldos (saldo calculado dos movimentos). */
export interface ContaReceberSaldo {
  id: string;
  cliente: string;
  os: string | null;
  descricao: string;
  origem: string | null;
  competencia: string | null;
  data_emissao: string;
  vencimento: string;
  valor_original: number;
  valor_recebido: number;
  saldo: number;
  status: ContaReceberStatus;
  parcela_atual: number | null;
  parcela_total: number | null;
  grupo_parcela: string | null;
  observacao: string | null;
  responsavel_id: string;
  responsavel_nome: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  vencido: boolean;
  dias_atraso: number;
}

export interface PagamentoConta {
  id: string;
  conta_pagar_id: string;
  data_pagamento: string;
  valor: number;
  forma_pagamento_id: string | null;
  comprovante_path: string | null;
  observacao: string | null;
  estorno_de_id: string | null;
  motivo_estorno: string | null;
  pago_por: string;
  created_at: string;
  forma?: { nome: string } | null;
  responsavel?: { full_name: string } | null;
}

export interface RecebimentoConta {
  id: string;
  conta_receber_id: string;
  data_recebimento: string;
  valor: number;
  forma_pagamento_id: string | null;
  caixa_lancamento_id: string | null;
  observacao: string | null;
  referencia: string | null;
  estorno_de_id: string | null;
  motivo_estorno: string | null;
  recebido_por: string;
  created_at: string;
  forma?: { nome: string } | null;
  responsavel?: { full_name: string } | null;
}

export interface FinanceiroIndicadores {
  ok: boolean;
  code?: string;
  message?: string;
  receita_liquida: number;
  custos_diretos: number;
  comissoes: number;
  despesas_operacionais: number;
  folha_gerencial: number;
  folha_pendente: number;
  margem_contribuicao: number;
  resultado_antes_folha: number;
  resultado_operacional: number;
  margem_operacional: number;
  contas_pagar_pendente: number;
  contas_receber_pendente: number;
  contas_pagar_vencido: number;
  contas_receber_vencido: number;
  entradas_previstas_30d: number;
  saidas_previstas_30d: number;
  saldo_projetado_30d: number;
}

export interface FluxoDia {
  data: string;
  entradas: number;
  saidas: number;
}

export interface FinanceiroFluxo {
  ok: boolean;
  code?: string;
  message?: string;
  saldo_inicial: number;
  dias: FluxoDia[];
}

/** Resultado padronizado das RPCs do financeiro. */
export interface FinanceiroRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
  saldo?: number;
  [key: string]: unknown;
}

export const STATUS_DESPESA: Record<DespesaStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  paga: { label: "Paga", className: "bg-primary/10 text-primary" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

export const STATUS_CONTA_PAGAR: Record<ContaPagarStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  parcialmente_pago: { label: "Parcialmente Pago", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  pago: { label: "Pago", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

export const STATUS_CONTA_RECEBER: Record<ContaReceberStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  parcialmente_recebido: {
    label: "Parcialmente Recebido",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  recebido: { label: "Recebido", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

export type FaixaAtraso = "1-7" | "8-15" | "16-30" | "30+";

export const FAIXAS_ATRASO: { key: FaixaAtraso; label: string; test: (dias: number) => boolean }[] = [
  { key: "1-7", label: "1 a 7 dias", test: (d) => d >= 1 && d <= 7 },
  { key: "8-15", label: "8 a 15 dias", test: (d) => d >= 8 && d <= 15 },
  { key: "16-30", label: "16 a 30 dias", test: (d) => d >= 16 && d <= 30 },
  { key: "30+", label: "Acima de 30 dias", test: (d) => d > 30 },
];

/** Competência (YYYY-MM-01) a partir de um mês "YYYY-MM". */
export function competenciaFromMonth(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return `${month}-01`;
}

/** Mês "YYYY-MM" a partir de uma competência/date ISO. */
export function monthFromDateISO(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 7) : "";
}
