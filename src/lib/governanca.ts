/**
 * GOVERNANÇA FINANCEIRA — tributos gerenciais, caixa físico, alçadas de desconto e backup.
 * Valores sempre NUMERIC(12,2) no banco; aqui, number. Timezone America/Manaus.
 */

export interface GovernancaConfig {
  tributo_metodo: "manual" | "percentual";
  tributo_percentual_padrao: number;
  alcada_desconto: Record<string, number | null>;
  alerta_desconto_pct: number;
  backup_intervalo_dias: number;
  exige_conferencia_fisica: boolean;
  comissao_entrega_reconhecimento: "validada" | "paga";
}

export const GOVERNANCA_PADRAO: GovernancaConfig = {
  tributo_metodo: "percentual",
  tributo_percentual_padrao: 6,
  alcada_desconto: {
    administrador: null,
    adm_financeiro: 15,
    adm_operacional: 10,
    vendedor: 5,
    tecnico: 0,
    tv_display: 0,
  },
  alerta_desconto_pct: 5,
  backup_intervalo_dias: 7,
  exige_conferencia_fisica: true,
  comissao_entrega_reconhecimento: "validada",
};

/* ---------------------------------- Caixa físico --------------------------------- */

export type CaixaMovimentoTipo = "saldo_inicial" | "suprimento" | "sangria";

export const TIPO_MOVIMENTO: Record<CaixaMovimentoTipo, { label: string; sinal: 1 | -1 }> = {
  saldo_inicial: { label: "Saldo inicial", sinal: 1 },
  suprimento: { label: "Suprimento", sinal: 1 },
  sangria: { label: "Sangria", sinal: -1 },
};

export interface CaixaMovimento {
  id: string;
  data_movimento: string;
  ocorrido_em: string;
  tipo: CaixaMovimentoTipo;
  valor: number;
  motivo: string;
  observacao: string | null;
  responsavel_id: string;
  responsavel?: { full_name: string } | null;
}

export interface CaixaFisicoResumo {
  ok: boolean;
  code?: string;
  saldo_inicial: number;
  entradas_dinheiro: number;
  suprimentos: number;
  sangrias: number;
  saldo_esperado: number;
}

/* ------------------------------ Alçadas de desconto ------------------------------ */

export type DescontoStatus = "pendente" | "aprovado" | "rejeitado";

export const STATUS_DESCONTO: Record<DescontoStatus, { label: string; tom: "ok" | "alerta" | "erro" }> = {
  pendente: { label: "Pendente", tom: "alerta" },
  aprovado: { label: "Aprovado", tom: "ok" },
  rejeitado: { label: "Rejeitado", tom: "erro" },
};

export interface DescontoAutorizacao {
  id: string;
  os: string | null;
  cliente: string | null;
  valor_original: number;
  valor_desconto: number;
  percentual: number;
  limite_perfil: number | null;
  motivo: string;
  status: DescontoStatus;
  solicitado_por: string;
  solicitado_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
  comentario: string | null;
  lancamento_id: string | null;
  utilizado_em: string | null;
  solicitante?: { full_name: string } | null;
  decisor?: { full_name: string } | null;
}

export interface DescontosIndicadores {
  ok: boolean;
  code?: string;
  faturamento_bruto: number;
  total_descontos: number;
  lancamentos_com_desconto: number;
  desconto_percentual: number;
  desconto_medio: number;
  por_usuario: { usuario: string; total: number; lancamentos: number }[];
  solicitacoes_acima_alcada: number;
  valor_aprovado_gestor: number;
  limite_alerta_pct: number;
  alerta: boolean;
}

/* ----------------------------------- Tributos ------------------------------------ */

export type TributoStatus = "previsto" | "confirmado" | "pago" | "cancelado";
export type TributoMetodo = "manual" | "percentual";

export const STATUS_TRIBUTO: Record<TributoStatus, { label: string; className: string }> = {
  previsto: { label: "Previsto", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  confirmado: { label: "Confirmado", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  pago: { label: "Pago", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
};

export const TIPOS_TRIBUTO = ["Simples Nacional", "ISS", "ICMS", "IRPJ", "CSLL", "PIS/COFINS", "Outros"];

export interface Tributo {
  id: string;
  competencia: string;
  tipo: string;
  metodo: TributoMetodo;
  base_calculo: number;
  percentual: number | null;
  valor: number;
  observacao: string | null;
  status: TributoStatus;
  motivo_cancelamento: string | null;
  created_at: string;
  responsavel?: { full_name: string } | null;
}

/* ------------------------------------- DRE --------------------------------------- */

export interface DreGerencial {
  ok: boolean;
  code?: string;
  message?: string;
  faturamento_bruto: number;
  descontos: number;
  taxas_recebimento: number;
  receita_liquida: number;
  custos_diretos: number;
  comissoes_tecnicas: number;
  comissoes_entrega: number;
  comissoes_total: number;
  comissao_sobre_receita: number;
  desconto_sobre_faturamento: number;
  tributos: number;
  margem_contribuicao: number;
  despesas_operacionais: number;
  folha_gerencial: number;
  resultado_operacional: number;
  margem_operacional: number;
  reconhecimento_entrega: string;
}

/* ------------------------------------ Backup -------------------------------------- */

export const TIPOS_BACKUP = [
  { value: "exportacao_csv", label: "Exportação CSV" },
  { value: "dump_banco", label: "Cópia completa do banco" },
  { value: "conferencia", label: "Conferência de integridade" },
];

export const STATUS_BACKUP = [
  { value: "concluido", label: "Concluído" },
  { value: "parcial", label: "Parcial" },
  { value: "falhou", label: "Falhou" },
];

export interface BackupRegistro {
  id: string;
  data_backup: string;
  tipo: string;
  local_armazenamento: string;
  status: string;
  observacao: string | null;
  created_at: string;
  responsavel?: { full_name: string } | null;
}

export interface BackupStatus {
  ok: boolean;
  ultimo: string | null;
  dias: number | null;
  intervalo: number;
  pendente: boolean;
}
