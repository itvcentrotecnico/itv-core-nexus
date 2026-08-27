/**
 * Módulo COLETAS — tipos e utilitários.
 * Ferramenta operacional leve: pré-cadastro do cliente, fila, motorista e relatório diário.
 */
import { supabase } from "@/integrations/supabase/client";

export type ColetaTipo = "coleta" | "entrega";
export type ColetaStatus =
  | "aguardando_cadastro"
  | "pronto_coleta"
  | "assumida"
  | "concluida"
  | "cancelada";

export interface ColetaSolicitacao {
  id: string;
  tipo: ColetaTipo;
  coleta_origem_id: string | null;
  cliente_nome: string;
  whatsapp: string;
  telefone_alternativo: string | null;
  cep: string | null;
  rua: string | null;
  numero: string | null;
  complemento: string | null;
  condominio: string | null;
  torre_bloco: string | null;
  apartamento: string | null;
  bairro: string | null;
  cidade: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  marca_tv: string | null;
  polegadas: number | null;
  observacao: string | null;
  observacao_conclusao: string | null;
  status: ColetaStatus;
  motorista_id: string | null;
  created_by: string | null;
  concluido_por: string | null;
  cancelado_por: string | null;
  motivo_cancelamento: string | null;
  link_gerado_em: string | null;
  link_expira_em: string | null;
  preenchido_em: string | null;
  atribuido_em: string | null;
  assumido_em: string | null;
  concluido_em: string | null;
  cancelado_em: string | null;
  created_at: string;
  updated_at: string;
}

/** Colunas liberadas para leitura direta (o CPF só sai por RPC com permissão). */
export const COLETA_COLUNAS =
  "id, tipo, coleta_origem_id, cliente_nome, whatsapp, telefone_alternativo, cep, rua, numero, complemento, condominio, torre_bloco, apartamento, bairro, cidade, referencia, latitude, longitude, maps_url, marca_tv, polegadas, observacao, observacao_conclusao, status, motorista_id, created_by, concluido_por, cancelado_por, motivo_cancelamento, link_gerado_em, link_expira_em, preenchido_em, atribuido_em, assumido_em, concluido_em, cancelado_em, created_at, updated_at";


export const STATUS_COLETA: Record<ColetaStatus, { label: string; className: string }> = {
  aguardando_cadastro: { label: "Aguardando cadastro", className: "bg-amber-100 text-amber-800" },
  pronto_coleta: { label: "Pronto para coleta", className: "bg-sky-100 text-sky-800" },
  assumida: { label: "Assumida", className: "bg-violet-100 text-violet-800" },
  concluida: { label: "Concluída", className: "bg-primary/15 text-primary" },
  cancelada: { label: "Cancelada", className: "bg-muted text-muted-foreground" },
};

export const TIPO_LABEL: Record<ColetaTipo, string> = {
  coleta: "Coleta",
  entrega: "Entrega",
};

export const MARCAS_TV = [
  "Samsung", "LG", "TCL", "Philco", "AOC", "Sony", "Panasonic", "Semp", "Toshiba",
  "Philips", "Multilaser", "Britânia", "Hisense", "Outra",
];

/** RPC tipada do módulo coletas. */
export async function rpcColetas<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------- máscaras e validações ------------------------- */

export function somenteDigitos(v: string): string {
  return (v ?? "").replace(/\D/g, "");
}

export function maskTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCPF(v: string): string {
  const d = somenteDigitos(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export function maskCEP(v: string): string {
  const d = somenteDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Validação oficial de CPF (dígitos verificadores). */
export function cpfValido(v: string): boolean {
  const c = somenteDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (fim: number) => {
    let soma = 0;
    for (let i = 0; i < fim; i++) soma += Number(c[i]) * (fim + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

/* ------------------------------ atalhos ------------------------------ */

export function whatsappUrl(numero: string, mensagem?: string): string {
  const d = somenteDigitos(numero);
  const full = d.length <= 11 ? `55${d}` : d;
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : "";
  return `https://wa.me/${full}${texto}`;
}

export function telUrl(numero: string): string {
  return `tel:+55${somenteDigitos(numero)}`;
}

export function enderecoCompleto(s: Partial<ColetaSolicitacao>): string {
  return [
    [s.rua, s.numero].filter(Boolean).join(", "),
    s.bairro,
    s.cidade ?? "Manaus",
    s.cep ? `CEP ${maskCEP(s.cep)}` : null,
  ]
    .filter(Boolean)
    .join(" - ");
}

export function enderecoResumido(s: Partial<ColetaSolicitacao>): string {
  return [s.rua, s.numero].filter(Boolean).join(", ") || "Endereço não informado";
}

export function complementoResumido(s: Partial<ColetaSolicitacao>): string {
  return [s.condominio, s.torre_bloco ? `Torre ${s.torre_bloco}` : null, s.apartamento ? `Ap ${s.apartamento}` : null, s.complemento]
    .filter(Boolean)
    .join(" · ");
}

/** Abre no app de mapas: prioriza coordenadas, cai para endereço. */
export function mapsUrl(s: Partial<ColetaSolicitacao>): string {
  if (s.maps_url) return s.maps_url;
  if (s.latitude != null && s.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(enderecoCompleto(s))}`;
}

export function linkCadastro(token: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/cadastro-coleta/${token}`;
}

export const MENSAGEM_PADRAO =
  "Olá! Para agendarmos sua coleta e evitarmos erros no endereço, pedimos que preencha seus dados no link abaixo. Leva menos de 1 minuto.";

export function storagePathColeta(solicitacaoId: string, fileName: string): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${solicitacaoId}/${crypto.randomUUID()}-${safe}`;
}

/* --------------------- mensagens amigáveis de erro --------------------- */

/**
 * Traduz falhas técnicas (RLS, rede, SQL) para linguagem operacional.
 * Nenhuma mensagem bruta do banco deve chegar ao usuário final.
 */
export function mensagemErro(e: unknown, padrao = "Não foi possível concluir a ação. Tente novamente."): string {
  const bruto = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const t = bruto.toLowerCase();
  if (!bruto) return padrao;
  if (t.includes("failed to fetch") || t.includes("networkerror") || t.includes("network request")) {
    return "Não foi possível conectar ao sistema. Verifique sua internet e tente novamente.";
  }
  if (t.includes("row-level security") || t.includes("violates row") || t.includes("permission denied")) {
    return "Você não possui permissão para realizar esta ação.";
  }
  if (t.includes("jwt") || t.includes("not authenticated") || t.includes("invalid token")) {
    return "Sua sessão expirou. Entre novamente para continuar.";
  }
  if (t.includes("duplicate key") || t.includes("unique constraint")) {
    return "Este registro já existe.";
  }
  // Mensagens escritas por nós nas RPCs já são amigáveis (começam em maiúscula e sem termos técnicos).
  if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(bruto) && !t.includes("error") && !t.includes("relation") && bruto.length < 160) {
    return bruto;
  }
  return padrao;
}

/* --------------------- exclusão controlada --------------------- */

export const MOTIVOS_EXCLUSAO = [
  "Cadastro duplicado",
  "Criado por engano",
  "Cliente cancelou",
  "Informação incorreta",
  "Outro",
];

/** Rótulo do status conforme o tipo (entrega usa "Pendente" no lugar de "Pronto para coleta"). */
export function labelStatus(tipo: ColetaTipo, status: ColetaStatus): string {
  if (tipo === "entrega") {
    if (status === "pronto_coleta") return "Pendente";
    if (status === "aguardando_cadastro") return "Aguardando cadastro";
  }
  return STATUS_COLETA[status].label;
}

/** Tempo decorrido entre dois instantes, em formato curto (ex.: "2d 4h"). */
export function tempoEntre(inicio?: string | null, fim?: string | null): string | null {
  if (!inicio || !fim) return null;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const horas = Math.floor(ms / 3_600_000);
  const dias = Math.floor(horas / 24);
  if (dias > 0) return `${dias}d ${horas % 24}h`;
  const minutos = Math.floor(ms / 60_000);
  return horas > 0 ? `${horas}h ${minutos % 60}min` : `${minutos}min`;
}
