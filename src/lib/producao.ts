// Modelos e utilitários do módulo Produção Técnica (Prompt 8).

export type ProducaoStatus =
  | "rascunho"
  | "enviado_validacao"
  | "validado"
  | "rejeitado"
  | "correcao_solicitada"
  | "cancelado";

export const STATUS_PRODUCAO: Record<ProducaoStatus, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  enviado_validacao: { label: "Enviado p/ Validação", className: "bg-amber-500/10 text-amber-600" },
  validado: { label: "Validado", className: "bg-primary/10 text-primary" },
  rejeitado: { label: "Rejeitado", className: "bg-destructive/10 text-destructive" },
  correcao_solicitada: { label: "Correção Solicitada", className: "bg-orange-500/10 text-orange-600" },
  cancelado: { label: "Cancelado", className: "bg-muted text-muted-foreground line-through" },
};

export interface TipoServico {
  id: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

export interface ProducaoRegistro {
  id: string;
  tecnico_id: string;
  os: string;
  data_execucao: string;
  cliente: string | null;
  marca_tv: string | null;
  modelo_tv: string | null;
  polegadas: number | null;
  defeito_relatado: string | null;
  diagnostico: string | null;
  tipo_servico_id: string | null;
  servico_executado: string;
  valor_servico: number | null;
  valor_mao_obra: number | null;
  pecas_descricao: string | null;
  observacao: string | null;
  status: ProducaoStatus;
  enviado_em: string | null;
  validado_por: string | null;
  validado_em: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  tecnico?: { full_name: string } | null;
  tipo_servico?: { nome: string } | null;
}

export interface ProducaoFoto {
  id: string;
  producao_id: string;
  storage_path: string;
  tipo: string;
  descricao: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProducaoValidacao {
  id: string;
  producao_id: string;
  acao: string;
  comentario: string | null;
  usuario_id: string | null;
  created_at: string;
  usuario?: { full_name: string } | null;
}

export const ACAO_VALIDACAO: Record<string, string> = {
  enviado: "Enviado para validação",
  validado: "Validado",
  correcao_solicitada: "Correção solicitada",
  rejeitado: "Rejeitado",
  cancelado: "Cancelado",
};

export interface ProducaoMetaInfo {
  tipo: "valor" | "quantidade" | "combinada";
  inicio: string;
  fim: string;
  valor_meta: number | null;
  quantidade_meta: number | null;
  realizado_valor: number;
  realizado_qtd: number;
  percentual: number | null;
  projecao: number | null;
  nivel: string | null;
}

export interface ProducaoMeusIndicadores {
  registrados: number;
  validados: number;
  pendentes_validacao: number;
  correcao_solicitada: number;
  rejeitados: number;
  rascunhos: number;
  valor_validado: number;
  ticket_medio: number;
  tempo_medio_validacao_horas: number;
  percentual_validado_sem_correcao: number | null;
  meta: ProducaoMetaInfo | null;
}

export interface ProducaoFilaIndicadores {
  aguardando_validacao: number;
  correcao_solicitada: number;
  validados_hoje: number;
  validados_mes: number;
  rejeitados_mes: number;
  valor_validado_mes: number;
  tempo_medio_fila_horas: number;
}

export interface ProducaoRankingItem {
  tecnico_id: string;
  tecnico: string;
  validados: number;
  valor_validado: number;
  meta_valor: number | null;
  meta_qtd: number | null;
  percentual: number | null;
  nivel: string | null;
}

export interface MetaTecnico {
  id: string;
  tecnico_id: string;
  tipo_meta: "valor" | "quantidade" | "combinada";
  periodo_tipo: "semanal" | "mensal" | "personalizado";
  inicio: string;
  fim: string;
  valor_meta: number | null;
  quantidade_meta: number | null;
  ativo: boolean;
  tecnico?: { full_name: string } | null;
}

export interface NivelDesempenho {
  id: string;
  nome: string;
  percentual_minimo: number;
  percentual_maximo: number | null;
  ordem: number;
  ativo: boolean;
}

export const TIPO_META_LABEL: Record<string, string> = {
  valor: "Por valor (R$)",
  quantidade: "Por quantidade",
  combinada: "Combinada",
};

export const PERIODO_META_LABEL: Record<string, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  personalizado: "Personalizado",
};

export const NIVEL_BADGE: Record<string, string> = {
  "Abaixo do Esperado": "bg-destructive/10 text-destructive",
  "Em Desenvolvimento": "bg-amber-500/10 text-amber-600",
  "Meta Atingida": "bg-primary/10 text-primary",
  "Alto Desempenho": "bg-emerald-600/10 text-emerald-600",
};

export function storagePathFoto(tecnicoId: string, producaoId: string, fileName: string): string {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = String(now.getMonth() + 1).padStart(2, "0");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${tecnicoId}/${ano}/${mes}/${producaoId}/${crypto.randomUUID()}-${safeName}`;
}
