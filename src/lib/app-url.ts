/**
 * FONTE ÚNICA da URL pública do sistema.
 *
 * Motivo: links externos (cadastro de coleta) eram montados com
 * `window.location.origin`, que no ambiente de preview aponta para um domínio
 * temporário do Lovable — o cliente recebia "No Lovable project found".
 *
 * Regra: links enviados ao cliente SEMPRE usam o domínio publicado.
 * Override opcional por `VITE_PUBLIC_APP_URL` (ex.: domínio próprio no futuro).
 */

/** Domínio publicado atual do Gestão ITV. */
const URL_PUBLICADA_PADRAO = "https://itvcentrotecnico.lovable.app";

/** Hosts que NUNCA podem ser usados em links enviados ao cliente. */
function hostEhPreviewOuLocal(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h.endsWith(".local") ||
    h.includes("-preview--") ||
    h.includes("id-preview") ||
    h.endsWith(".lovableproject.com") ||
    h.endsWith(".lovableproject-dev.com") ||
    h.endsWith(".gpt-eng.com") ||
    h.endsWith(".gptengineer.run") ||
    h.endsWith("-dev.lovable.app") ||
    h.endsWith(".sandbox.lovable.dev")
  );
}

function normalizar(valor: string | undefined | null): string | null {
  const bruto = (valor ?? "").trim().replace(/\/+$/, "");
  if (!bruto) return null;
  try {
    const u = new URL(bruto);
    if (u.protocol !== "https:") return null;
    if (hostEhPreviewOuLocal(u.hostname)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * URL pública oficial. Ordem: variável de ambiente → domínio publicado →
 * domínio atual (apenas se for um domínio público válido).
 *
 * O domínio publicado vem ANTES do domínio atual para que nenhum ambiente
 * inesperado (preview novo, sandbox, iframe do editor) vaze para o cliente.
 */
export function publicAppUrl(): string | null {
  const doEnv = normalizar(import.meta.env["VITE_PUBLIC_APP_URL"] as string | undefined);
  if (doEnv) return doEnv;
  const publicada = normalizar(URL_PUBLICADA_PADRAO);
  if (publicada) return publicada;
  if (typeof window !== "undefined") {
    const atual = normalizar(window.location.origin);
    if (atual) return atual;
  }
  return null;
}

/** Mensagem interna (nunca exibida ao cliente) quando não há URL pública válida. */
export const ERRO_URL_PUBLICA =
  "Endereço público do cadastro não está configurado. Contate a administração.";

/** Monta uma URL pública a partir de um caminho. Retorna null se não houver base válida. */
export function publicUrl(caminho: string): string | null {
  const base = publicAppUrl();
  if (!base) return null;
  return `${base}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
