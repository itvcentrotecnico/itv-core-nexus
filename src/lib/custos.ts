/**
 * Tipos e utilitários do módulo PEÇAS E CUSTOS POR OS — GESTÃO ITV CENTRO TÉCNICO.
 * Valores financeiros sempre NUMERIC(12,2) no banco; aqui, number com round2 (de @/lib/caixa).
 */

export interface TipoCusto {
  id: string;
  nome: string;
  eh_peca: boolean;
  ativo: boolean;
  ordem: number;
}

export interface CategoriaPeca {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface Fornecedor {
  id: string;
  nome: string;
  telefone: string | null;
  observacao: string | null;
  ativo: boolean;
}

export type CustoStatus = "registrado" | "confirmado" | "cancelado" | "estornado";

export interface CustoOS {
  id: string;
  data_lancamento: string;
  os: string;
  tecnico_id: string | null;
  tipo_custo_id: string;
  descricao: string;
  categoria_id: string | null;
  marca: string | null;
  modelo: string | null;
  compatibilidade: string | null;
  fornecedor_id: string | null;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  devolvido_total: number;
  status: CustoStatus;
  observacao: string | null;
  motivo_cancelamento: string | null;
  created_by: string | null;
  created_at: string;
  tipo?: { nome: string; eh_peca: boolean } | null;
  categoria?: { nome: string } | null;
  fornecedor?: { nome: string } | null;
  tecnico?: { full_name: string } | null;
  responsavel?: { full_name: string } | null;
}

export interface CustosIndicadores {
  ok: boolean;
  code?: string;
  custo_total: number;
  custo_pecas: number;
  outros_custos: number;
  os_com_custos: number;
  custo_medio: number;
  receita_liquida_relacionada: number;
  custo_sobre_receita_pct: number | null;
}

export interface CustoOsItem {
  id: string;
  descricao: string;
  tipo: string;
  valor_liquido: number;
  status: CustoStatus;
}

export interface CustoOsGrupo {
  os: string;
  itens: CustoOsItem[];
  custo_total: number;
  receita_liquida: number | null;
  cliente: string | null;
  tecnico: string | null;
  faturado_em: string | null;
  margem_parcial: number | null;
  margem_pct: number | null;
  alerta_custo_elevado: boolean;
  alerta_margem_baixa: boolean;
}

export interface CustosPorOs {
  ok: boolean;
  code?: string;
  custo_elevado_pct: number;
  margem_minima_pct: number;
  os: CustoOsGrupo[];
}

/** Resultado padronizado das funções RPC de custos. */
export interface CustosRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
  custo_total?: number;
  custo_liquido?: number;
  restante?: number;
  [key: string]: unknown;
}

/** Resumo da OS consultado no Caixa (somente referência, nunca edição). */
export interface OsCaixaRef {
  os: string;
  cliente: string | null;
  data_lancamento: string;
  valor_bruto: number;
  desconto: number;
  receita_liquida: number;
  tecnico_id: string | null;
  tecnico_nome: string | null;
  pagamentos: string;
}

export const STATUS_CUSTO: Record<CustoStatus, { label: string; className: string }> = {
  registrado: { label: "Registrado", className: "bg-secondary text-secondary-foreground" },
  confirmado: { label: "Confirmado", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
  estornado: { label: "Estornado", className: "bg-muted text-muted-foreground" },
};
