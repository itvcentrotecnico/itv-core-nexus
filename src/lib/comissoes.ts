/**
 * Tipos e utilitários do módulo COMISSÕES TÉCNICAS — GESTÃO ITV CENTRO TÉCNICO.
 * Receita vem do Caixa; custos de Peças e Custos; a comissão nunca cria receita própria.
 */

export type ComissaoTipoRegra =
  | "percentual_mao_obra"
  | "percentual_receita"
  | "fixo_os"
  | "fixo_servico"
  | "personalizada";

export type ComissaoStatus =
  | "gerada"
  | "pendente_conferencia"
  | "conferida"
  | "aprovada"
  | "paga"
  | "cancelada"
  | "pendente_configuracao"
  | "devolvida";

export type ComissaoAjusteTipo = "bonus" | "acrescimo" | "desconto" | "correcao" | "compensacao";

export interface RegraComissao {
  id: string;
  tecnico_id: string;
  tipo_regra: ComissaoTipoRegra;
  percentual: number | null;
  valor_fixo: number | null;
  servico_descricao: string | null;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  ativo: boolean;
  observacao: string | null;
  created_at: string;
  tecnico?: { full_name: string } | null;
}

export interface Comissao {
  id: string;
  data_referencia: string;
  os: string;
  tecnico_id: string;
  caixa_lancamento_id: string | null;
  regra_comissao_id: string | null;
  tipo_regra: ComissaoTipoRegra | null;
  receita_liquida: number;
  custos_diretos: number;
  base_calculo: number | null;
  percentual: number | null;
  valor_calculado: number | null;
  ajuste_total: number;
  valor_final: number | null;
  mao_obra_manual: number | null;
  mao_obra_justificativa: string | null;
  status: ComissaoStatus;
  observacao: string | null;
  conferida_em: string | null;
  aprovada_em: string | null;
  valor_aprovado: number | null;
  motivo_cancelamento: string | null;
  created_at: string;
  tecnico?: { full_name: string } | null;
  ajustes?: ComissaoAjuste[];
}

export interface ComissaoAjuste {
  id: string;
  comissao_id: string;
  tipo: ComissaoAjusteTipo;
  valor: number;
  motivo: string;
  created_at: string;
}

export interface ComissaoPagamento {
  id: string;
  tecnico_id: string;
  data_inicio: string | null;
  data_fim: string | null;
  valor_total: number;
  forma_pagamento_id: string | null;
  responsavel_id: string;
  observacao: string | null;
  pago_em: string;
  tecnico?: { full_name: string } | null;
  responsavel?: { full_name: string } | null;
  forma?: { nome: string } | null;
  itens?: { comissao_id: string; valor: number }[];
}

export interface ComissoesIndicadores {
  ok: boolean;
  comissao_gerada: number;
  comissao_pendente: number;
  comissao_aprovada: number;
  comissao_paga: number;
  tecnicos_com_comissao: number;
  receita_relacionada: number;
  comissao_receita_pct: number | null;
}

export interface ComissaoTecnicoResumo {
  tecnico_id: string;
  tecnico: string;
  qtd_os: number;
  receita_liquida: number;
  custos_diretos: number;
  base_comissionavel: number;
  comissao_gerada: number;
  comissao_pendente: number;
  comissao_paga: number;
  margem_contribuicao: number;
  ticket_medio: number;
  comissao_receita_pct: number | null;
  margem_pct: number | null;
}

export interface ComissaoSimulacao {
  ok: boolean;
  valor_atual: number | null;
  novo_valor: number | null;
  novo_calculado: number | null;
  nova_base: number | null;
  diferenca: number | null;
  regra_encontrada: boolean;
  tipo_regra: ComissaoTipoRegra | null;
  percentual: number | null;
  message?: string;
}

export interface ComissaoRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
}

export const TIPO_REGRA: Record<ComissaoTipoRegra, string> = {
  percentual_mao_obra: "% sobre Mão de Obra",
  percentual_receita: "% sobre Receita",
  fixo_os: "Valor Fixo por OS",
  fixo_servico: "Valor Fixo por Serviço",
  personalizada: "Personalizada",
};

export const STATUS_COMISSAO: Record<ComissaoStatus, { label: string; className: string }> = {
  gerada: { label: "Gerada", className: "bg-blue-100 text-blue-800 border-blue-200" },
  pendente_conferencia: { label: "Pend. Conferência", className: "bg-amber-100 text-amber-800 border-amber-200" },
  conferida: { label: "Conferida", className: "bg-cyan-100 text-cyan-800 border-cyan-200" },
  aprovada: { label: "Aprovada", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  paga: { label: "Paga", className: "bg-primary/10 text-primary border-primary/20" },
  cancelada: { label: "Cancelada", className: "bg-red-100 text-red-800 border-red-200" },
  pendente_configuracao: { label: "Pend. Configuração", className: "bg-orange-100 text-orange-800 border-orange-200" },
  devolvida: { label: "Devolvida ao Operacional", className: "bg-purple-100 text-purple-800 border-purple-200" },
};

export const AJUSTE_TIPO: Record<ComissaoAjusteTipo, string> = {
  bonus: "Bônus",
  acrescimo: "Acréscimo",
  desconto: "Desconto",
  correcao: "Correção",
  compensacao: "Compensação",
};
