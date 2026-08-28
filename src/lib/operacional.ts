/**
 * CENTRAL OPERACIONAL — camada de controle, validação e gestão do ADM Operacional.
 * Não substitui INFOR OS, Caixa, Financeiro, Folha, Produção ou Comissões:
 * apenas organiza validação, liberação e explicação do fluxo das TVs.
 */
import { supabase } from "@/integrations/supabase/client";

/** RPC do módulo operacional com mensagem amigável (nunca expõe SQL/RLS bruto). */
export async function rpcOp<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    const bruto = error.message ?? "";
    const amigavel = /permiss|acesso/i.test(bruto)
      ? "Você não tem acesso a esta área da Central Operacional."
      : "Não foi possível concluir a operação agora. Tente novamente.";
    throw new Error(amigavel);
  }
  return data as T;
}

export interface OperacionalSemana {
  inicio: string;
  fim: string;
  semana: number;
  ano: number;
  fechamento_id: string | null;
  status: "aberto" | "fechado" | "reaberto";
  entradas: number;
  entradas_fonte: string | null;
  entradas_em: string | null;
  entradas_informadas: boolean;
  entregas: number;
  saldo: number;
  taxa_saida: number | null;
  classificadas: number;
  faltam: number;
  saidas_maiores: boolean;
  fechado_em: string | null;
  reaberto_em: string | null;
  motivo_reabertura: string | null;
  pendentes_por_motivo: { motivo: string; total: number }[];
}

export interface OperacionalAlerta {
  nivel: "critico" | "atencao" | "informativo";
  tipo: string;
  mensagem: string;
}

export interface OperacionalDashboard {
  hoje: {
    aguardando_validacao: number;
    correcao_solicitada: number;
    validados_hoje: number;
    rejeitados: number;
    sem_tecnico: number;
    sem_tipo: number;
  };
  semana: OperacionalSemana;
  semana_anterior: OperacionalSemana;
  comissoes: {
    geradas: number;
    conferidas: number;
    liberadas: number;
    devolvidas: number;
    pagas_mes: number;
    valor_liberado: number;
  };
  estoque: { motivo_id: string; motivo: string; total: number }[];
  parametros: { dias_parada: number; faixa_prioridade: number };
  alertas: OperacionalAlerta[];
}

export interface MotivoPendencia {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface PendenciaOperacional {
  id: string;
  fechamento_id: string | null;
  os: string;
  motivo_id: string;
  observacao: string | null;
  cliente: string | null;
  marca: string | null;
  modelo: string | null;
  polegadas: number | null;
  tecnico_id: string | null;
  data_entrada: string;
  ultima_movimentacao: string;
  status: string;
  motivo?: { nome: string } | null;
  tecnico?: { full_name: string } | null;
}

export interface SemanaHistorico {
  inicio: string;
  fim: string;
  semana: number;
  entradas: number;
  entregas: number;
  status: string;
}

export interface OperacionalTecnicoResumo {
  tecnico_id: string;
  tecnico: string;
  enviados: number;
  validados: number;
  rejeitados: number;
  correcoes: number;
  producao_validada: number;
  tvs_responsabilidade: number;
  tvs_paradas: number;
}

export const NIVEL_ALERTA: Record<string, { label: string; className: string; ordem: number }> = {
  critico: { label: "Crítico", className: "bg-destructive/10 text-destructive", ordem: 0 },
  atencao: { label: "Atenção", className: "bg-amber-500/10 text-amber-600", ordem: 1 },
  informativo: { label: "Informativo", className: "bg-muted text-muted-foreground", ordem: 2 },
};

/** Faixas de envelhecimento (parâmetros sugeridos; texto sempre visível, não só cor). */
export function faixaDias(dias: number): { label: string; className: string } {
  if (dias >= 16) return { label: "Prioridade", className: "bg-destructive/10 text-destructive" };
  if (dias >= 8) return { label: "Crítico", className: "bg-orange-500/10 text-orange-600" };
  if (dias >= 4) return { label: "Atenção", className: "bg-amber-500/10 text-amber-600" };
  return { label: "Normal", className: "bg-primary/10 text-primary" };
}

/** Dias na ITV a partir da data de entrada (America/Manaus, dia cheio). */
export function diasNaItv(dataEntrada: string, hojeISO: string): number {
  const a = new Date(`${dataEntrada}T12:00:00`);
  const b = new Date(`${hojeISO}T12:00:00`);
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

export function inicioSemanaISO(refISO: string): string {
  const d = new Date(`${refISO}T12:00:00`);
  const dow = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function somaSemanasISO(refISO: string, semanas: number): string {
  const d = new Date(`${refISO}T12:00:00`);
  d.setDate(d.getDate() + semanas * 7);
  return d.toISOString().slice(0, 10);
}
