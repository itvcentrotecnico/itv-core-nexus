/**
 * Modo Expediente e acompanhamento da equipe externa.
 * Regra oficial: posições só são registradas entre 08:00 e 18:00 (America/Manaus),
 * validado também no banco. Nenhum rastreamento fora do expediente.
 */
import { mensagemErro } from "@/lib/erros";
import { supabase } from "@/integrations/supabase/client";

export interface ExpedienteAtual {
  ativo: boolean;
  id?: string;
  inicio?: string;
  ultima_atualizacao?: string | null;
  janela: boolean;
}

export interface EquipeExternaItem {
  motorista_id: string;
  motorista: string;
  expediente_id: string | null;
  inicio: string | null;
  expediente_status: "ativo" | "encerrado" | null;
  latitude: number | null;
  longitude: number | null;
  precisao: number | null;
  bairro: string | null;
  registrado_em: string | null;
  coletas_atribuidas: number;
  entregas_atribuidas: number;
}

export interface EquipeExternaTv {
  equipe: { motorista: string; situacao: string; regiao: string | null }[];
  indicadores: {
    motoristas_operacao: number;
    coletas_pendentes: number;
    entregas_pendentes: number;
    em_execucao: number;
    concluidas_hoje: number;
  };
}

/** Intervalo mínimo entre envios de posição (5 minutos). */
export const INTERVALO_POSICAO_MS = 5 * 60_000;
/** Após este tempo sem atualização, a posição é considerada desatualizada. */
export const LIMITE_DESATUALIZADO_MS = 20 * 60_000;

export async function rpcEquipe<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  return data as T;
}

/** Verificação local da janela de expediente (o banco é a fonte oficial). */
export function dentroDaJanela(agora = new Date()): boolean {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Manaus",
      hour: "2-digit",
      hour12: false,
    }).format(agora),
  );
  return hora >= 8 && hora < 18;
}

export function posicaoDesatualizada(registradoEm: string | null | undefined): boolean {
  if (!registradoEm) return true;
  return Date.now() - new Date(registradoEm).getTime() > LIMITE_DESATUALIZADO_MS;
}
