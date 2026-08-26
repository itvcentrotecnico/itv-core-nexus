/**
 * Tipos e utilitários do módulo COLABORADORES E FOLHA GERENCIAL — GESTÃO ITV CENTRO TÉCNICO.
 * Folha gerencial interna: não substitui a folha contábil oficial.
 */

export type ColaboradorStatus = "ativo" | "ferias" | "afastado" | "desligado";

export interface Setor {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface Cargo {
  id: string;
  nome: string;
  setor_id: string | null;
  ativo: boolean;
  ordem: number;
}

export interface Colaborador {
  id: string;
  nome: string;
  nome_exibicao: string | null;
  cargo_id: string | null;
  setor_id: string | null;
  data_admissao: string | null;
  tipo_vinculo: string | null;
  status: ColaboradorStatus;
  telefone: string | null;
  email: string | null;
  observacao: string | null;
  user_id: string | null;
  desligado_em: string | null;
  motivo_desligamento: string | null;
  created_at: string;
  cargo_nome?: string | null;
  setor_nome?: string | null;
  salario_atual?: number | null;
}

export interface SalarioHistorico {
  id: string;
  colaborador_id: string;
  valor: number;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  motivo: string | null;
  created_at: string;
}

export interface ColaboradorBeneficio {
  id: string;
  colaborador_id: string;
  tipo: "vale_transporte" | "vale_alimentacao" | "ajuda_custo" | "outros";
  descricao: string | null;
  valor: number;
  inicio_vigencia: string;
  fim_vigencia: string | null;
  ativo: boolean;
}

export interface ColaboradorAdiantamento {
  id: string;
  colaborador_id: string;
  data: string;
  valor: number;
  competencia_desconto: string;
  motivo: string;
  status: "pendente" | "descontado" | "cancelado";
  created_at: string;
}

export type FolhaCompetenciaStatus = "aberta" | "em_conferencia" | "aprovada" | "paga" | "fechada";
export type FolhaItemStatus = "pendente" | "conferido" | "aprovado" | "parcialmente_pago" | "pago";
export type FolhaNatureza = "provento" | "desconto";

export interface FolhaCompetencia {
  id: string;
  competencia: string;
  status: FolhaCompetenciaStatus;
  aprovada_em: string | null;
  fechada_em: string | null;
  motivo_reabertura: string | null;
  observacao: string | null;
  created_at: string;
}

export interface FolhaTipoLancamento {
  id: string;
  nome: string;
  natureza: FolhaNatureza;
  ativo: boolean;
  ordem: number;
}

export interface FolhaLancamento {
  id: string;
  competencia_id: string;
  colaborador_id: string;
  tipo_lancamento_id: string;
  natureza: FolhaNatureza;
  descricao: string | null;
  valor: number;
  origem: string;
  referencia_id: string | null;
  observacao: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  tipo?: { nome: string } | null;
  colaborador?: { nome: string } | null;
}

export interface FolhaPagamento {
  id: string;
  competencia_id: string;
  colaborador_id: string;
  data_pagamento: string;
  valor: number;
  forma_pagamento_id: string | null;
  comprovante_path: string | null;
  observacao: string | null;
  estorno_de_id: string | null;
  motivo_estorno: string | null;
  created_at: string;
  forma?: { nome: string } | null;
  colaborador?: { nome: string } | null;
}

export interface FolhaResumoColaborador {
  folha_colaborador_id: string;
  competencia_id: string;
  competencia: string;
  competencia_status: FolhaCompetenciaStatus;
  colaborador_id: string;
  colaborador_nome: string;
  cargo_nome: string | null;
  setor_nome: string | null;
  status: FolhaItemStatus;
  proventos: number;
  descontos: number;
  total: number;
  pago: number;
}

export interface FolhaResumo {
  ok: boolean;
  code?: string;
  message?: string;
  competencia: string;
  status: FolhaCompetenciaStatus;
  aprovada_por: string | null;
  aprovada_em: string | null;
  fechada_em: string | null;
  total_proventos: number;
  total_descontos: number;
  total_folha: number;
  total_pago: number;
  por_tipo: { tipo: string; natureza: FolhaNatureza; total: number }[];
  por_setor: { setor: string; total: number }[];
  por_colaborador: {
    folha_colaborador_id: string;
    colaborador_id: string;
    nome: string;
    cargo: string | null;
    setor: string | null;
    status: FolhaItemStatus;
    proventos: number;
    descontos: number;
    total: number;
    pago: number;
    saldo: number;
  }[];
}

export interface FolhaRpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
  [key: string]: unknown;
}

export const STATUS_COLABORADOR: Record<ColaboradorStatus, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-primary/10 text-primary" },
  ferias: { label: "Férias", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  afastado: { label: "Afastado", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  desligado: { label: "Desligado", className: "bg-muted text-muted-foreground" },
};

export const STATUS_COMPETENCIA: Record<FolhaCompetenciaStatus, { label: string; className: string }> = {
  aberta: { label: "Aberta", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  em_conferencia: { label: "Em Conferência", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  aprovada: { label: "Aprovada", className: "bg-primary/10 text-primary" },
  paga: { label: "Paga", className: "bg-primary/10 text-primary" },
  fechada: { label: "Fechada", className: "bg-muted text-muted-foreground" },
};

export const STATUS_ITEM_FOLHA: Record<FolhaItemStatus, { label: string; className: string }> = {
  pendente: { label: "Pendente", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  conferido: { label: "Conferido", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  aprovado: { label: "Aprovado", className: "bg-primary/10 text-primary" },
  parcialmente_pago: { label: "Parcialmente Pago", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  pago: { label: "Pago", className: "bg-primary/10 text-primary" },
};

export const TIPOS_VINCULO = ["CLT", "PJ", "Estágio", "Temporário", "Autônomo", "Outro"];

export const BENEFICIO_TIPOS: { value: ColaboradorBeneficio["tipo"]; label: string }[] = [
  { value: "vale_transporte", label: "Vale Transporte" },
  { value: "vale_alimentacao", label: "Vale Alimentação" },
  { value: "ajuda_custo", label: "Ajuda de Custo" },
  { value: "outros", label: "Outros" },
];

/** "Agosto/2026" a partir de "2026-08-01". */
export function competenciaLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const meses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${meses[(m ?? 1) - 1]}/${y}`;
}

/** "2026-08" → "2026-08-01". */
export function competenciaISO(month: string): string | null {
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return `${month}-01`;
}
