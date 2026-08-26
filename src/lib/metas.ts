/**
 * Tipos e utilitários do módulo METAS E INDICADORES GERENCIAIS — GESTÃO ITV CENTRO TÉCNICO.
 * Metas são camada analítica: o realizado é sempre calculado das fontes oficiais
 * (Caixa, Custos, Comissões, Financeiro, Folha, Produção validada) no banco.
 */

export type MetaTipo =
  | "faturamento"
  | "receita_liquida"
  | "margem_contribuicao"
  | "resultado_operacional"
  | "os_faturadas"
  | "ticket_medio";

export type MetaStatus = "planejada" | "ativa" | "concluida" | "cancelada";
export type StatusProjecao = "acima" | "no_ritmo" | "atencao" | "critico";
export type MetaUnidade = "BRL" | "quantidade";

export interface MetaEmpresaDetalhe {
  id: string;
  nome: string;
  tipo: MetaTipo;
  periodo_tipo: "semanal" | "mensal" | "personalizado";
  data_inicio: string;
  data_fim: string;
  valor_alvo: number;
  unidade: MetaUnidade;
  principal: boolean;
  status: MetaStatus;
  observacao: string | null;
  created_at: string;
  responsavel: string | null;
  realizado: number;
  percentual: number;
  faltante: number;
  dias_totais: number;
  dias_decorridos: number;
  dias_restantes: number;
  ritmo_atual: number | null;
  ritmo_necessario: number | null;
  projecao: number | null;
  projecao_percentual: number | null;
  status_projecao: StatusProjecao | null;
  nivel: string | null;
}

export interface IndicadoresPeriodo {
  faturamento: number;
  receita_liquida: number;
  ticket_medio: number;
  os_faturadas: number;
  quantidade_lancamentos: number;
  custos_diretos: number;
  custos_receita_pct: number;
  comissoes: number;
  comissao_receita_pct: number;
  margem_contribuicao: number;
  margem_pct: number;
  despesas_operacionais: number;
  folha_gerencial: number;
  resultado_operacional: number;
  resultado_pct: number;
  producao_validada: number;
}

export interface MetaAlerta {
  tipo: "meta_superada" | "meta_em_risco" | "meta_em_atencao";
  meta_id: string;
  nome: string;
  percentual: number;
  projecao_percentual: number | null;
}

export interface FaixasProjecao {
  acima: number;
  no_ritmo: number;
  atencao: number;
}

export interface MetasPainel {
  ok: boolean;
  code?: string;
  message?: string;
  atual: IndicadoresPeriodo;
  anterior: IndicadoresPeriodo;
  periodo_anterior: { inicio: string; fim: string };
  metas: MetaEmpresaDetalhe[];
  alertas: MetaAlerta[];
  faixas_projecao: FaixasProjecao | null;
}

export interface MetaTecnicoProgresso {
  id: string;
  tipo: string;
  inicio: string;
  fim: string;
  valor_meta: number | null;
  quantidade_meta: number | null;
  percentual: number | null;
  projecao: number | null;
  ritmo_necessario: number | null;
  nivel: string | null;
}

export interface TecnicoDesempenho {
  tecnico_id: string;
  tecnico: string;
  registrados: number;
  enviados: number;
  validados: number;
  pendentes: number;
  correcoes: number;
  rejeitados: number;
  producao_validada: number;
  ticket_medio: number;
  receita_associada: number;
  custos_diretos: number;
  comissao: number;
  margem_contribuicao: number;
  margem_pct: number | null;
  indice_validacao: number | null;
  indice_correcao: number | null;
  indice_rejeicao: number | null;
  meta: MetaTecnicoProgresso | null;
}

export interface MetasTecnicosResult {
  ok: boolean;
  code?: string;
  message?: string;
  tecnicos: TecnicoDesempenho[];
}

export interface MetaTecnicoItem {
  id: string;
  tipo: string;
  periodo_tipo: string;
  inicio: string;
  fim: string;
  valor_meta: number | null;
  quantidade_meta: number | null;
  status: MetaStatus;
  ativo: boolean;
}

export interface MetasTecnicoPainelResult {
  ok: boolean;
  code?: string;
  message?: string;
  desempenho: TecnicoDesempenho | null;
  metas: MetaTecnicoItem[];
}

export interface EvolucaoDia {
  data: string;
  realizado_dia: number;
  acumulado: number;
  ideal: number | null;
}

export interface MetasEvolucao {
  ok: boolean;
  code?: string;
  meta_principal: MetaEmpresaDetalhe | null;
  dias: EvolucaoDia[];
}

export interface MetasHistorico {
  ok: boolean;
  code?: string;
  metas: MetaEmpresaDetalhe[];
}

export interface MetasRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
}

export const TIPO_META_EMPRESA_LABEL: Record<MetaTipo, string> = {
  faturamento: "Faturamento",
  receita_liquida: "Receita Líquida",
  margem_contribuicao: "Margem de Contribuição",
  resultado_operacional: "Resultado Operacional",
  os_faturadas: "OS Faturadas",
  ticket_medio: "Ticket Médio",
};

/** Fonte oficial de cada tipo de meta (transparência do cálculo). */
export const TIPO_META_FONTE: Record<MetaTipo, string> = {
  faturamento: "Caixa Diário",
  receita_liquida: "Caixa Diário",
  margem_contribuicao: "Caixa − Custos − Comissões",
  resultado_operacional: "Caixa − Custos − Comissões − Despesas − Folha",
  os_faturadas: "Caixa Diário",
  ticket_medio: "Caixa Diário",
};

export const STATUS_META: Record<MetaStatus, { label: string; className: string }> = {
  planejada: { label: "Planejada", className: "bg-muted text-muted-foreground" },
  ativa: { label: "Ativa", className: "bg-primary/10 text-primary" },
  concluida: { label: "Concluída", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  cancelada: { label: "Cancelada", className: "bg-destructive/10 text-destructive" },
};

export const STATUS_PROJECAO: Record<StatusProjecao, { label: string; className: string }> = {
  acima: { label: "Acima da Meta", className: "bg-primary/10 text-primary" },
  no_ritmo: { label: "No Ritmo", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  atencao: { label: "Atenção", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  critico: { label: "Crítico", className: "bg-destructive/10 text-destructive" },
};

export const TIPO_META_TECNICO_LABEL: Record<string, string> = {
  valor: "Produção validada (R$)",
  quantidade: "Quantidade de serviços",
  combinada: "Combinada (valor + quantidade)",
  ticket_medio: "Ticket médio",
  margem: "Margem de contribuição (%)",
  indice_validacao: "Índice de validação (%)",
};
