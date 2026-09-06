import { supabase } from "@/integrations/supabase/client";

/**
 * Tipos de evento aceitos pelo registro de segurança no banco.
 * Qualquer outro valor é descartado pela função `seguranca_registrar_evento`.
 */
export type EventoSeguranca =
  | "login_falho"
  | "acesso_negado"
  | "conta_bloqueada"
  | "sem_perfil"
  | "reset_senha_solicitado";

type Contexto = {
  email?: string | null;
  modulo?: string | null;
  rota?: string | null;
  detalhes?: Record<string, unknown>;
};

/**
 * Registra um evento de segurança (tentativa de login falha, acesso negado…).
 * Nunca deve interromper o fluxo do usuário: falhas são silenciadas.
 */
export async function registrarEventoSeguranca(
  tipo: EventoSeguranca,
  contexto: Contexto = {},
): Promise<void> {
  try {
    await supabase.rpc("seguranca_registrar_evento", {
      p_tipo: tipo,
      p_email: contexto.email ?? null,
      p_modulo: contexto.modulo ?? null,
      p_rota: contexto.rota ?? null,
      p_detalhes: (contexto.detalhes ?? {}) as never,
    });
  } catch {
    // Silencioso por design.
  }
}
