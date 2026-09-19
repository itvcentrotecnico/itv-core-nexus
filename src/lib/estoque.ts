/**
 * ESTOQUE TÉCNICO — Parte 1 (cadastro e consulta).
 * Sem baixa, reserva, utilização em OS ou integração financeira nesta etapa.
 */
import { supabase } from "@/integrations/supabase/client";
import { mensagemErro } from "@/lib/erros";

export type EstoqueTipo = "kit_led" | "placa_main";
export type EstoqueStatus = "em_estoque" | "baixo" | "sem_estoque";

export const TIPO_LABEL: Record<EstoqueTipo, string> = {
  kit_led: "Kit de LED",
  placa_main: "Placa Main",
};

export const STATUS_ESTOQUE: Record<EstoqueStatus, { label: string; classe: string }> = {
  em_estoque: {
    label: "EM ESTOQUE",
    classe: "bg-primary/10 text-primary border-primary/30",
  },
  baixo: {
    label: "ESTOQUE BAIXO",
    classe: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  },
  sem_estoque: {
    label: "SEM ESTOQUE",
    classe: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

/** Polegadas padronizadas. "Outra" permite valor livre, gravado como texto. */
export const POLEGADAS = [
  "24",
  "28",
  "32",
  "39",
  "40",
  "42",
  "43",
  "47",
  "48",
  "49",
  "50",
  "55",
  "58",
  "60",
  "65",
  "70",
  "75",
  "77",
  "82",
  "85",
  "86",
  "98",
];

export interface EstoqueMarca {
  id: string;
  nome: string;
  ativo: boolean;
}

export interface EstoqueLocalizacao {
  id: string;
  grupo: "LED" | "MAIN";
  numero: number;
  codigo: string;
  descricao: string | null;
  ativo: boolean;
}

export function labelGaveta(l: Pick<EstoqueLocalizacao, "grupo" | "numero">): string {
  return `${l.grupo} — Gaveta ${String(l.numero).padStart(2, "0")}`;
}

export interface EstoqueItem {
  id: string;
  tipo: EstoqueTipo;
  marca_id: string;
  marca_nome: string;
  polegada: string | null;
  modelo: string;
  codigo_placa: string | null;
  localizacao_id: string;
  gaveta_codigo: string;
  gaveta_grupo: "LED" | "MAIN";
  gaveta_numero: number;
  gaveta_label: string;
  quantidade: number;
  quantidade_reservada: number;
  quantidade_disponivel: number;
  estoque_minimo: number;
  observacao: string | null;
  compatibilidades: string[];
  status: EstoqueStatus;
}

export interface EstoqueBusca {
  ok: true;
  total: number;
  itens: EstoqueItem[];
}

export interface DuplicidadeItem {
  id: string;
  tipo: EstoqueTipo;
  marca_nome: string;
  polegada: string | null;
  modelo: string;
  codigo_placa: string | null;
  quantidade: number;
  gaveta_label: string;
}

export interface GavetaDetalhe {
  ok: true;
  gaveta: {
    id: string;
    grupo: "LED" | "MAIN";
    numero: number;
    codigo: string;
    descricao: string | null;
    ativo: boolean;
    label: string;
  };
  itens: {
    id: string;
    tipo: EstoqueTipo;
    marca_nome: string;
    polegada: string | null;
    modelo: string;
    codigo_placa: string | null;
    quantidade: number;
  }[];
}

const CODIGOS: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  NAO_AUTENTICADO: "Sessão expirada. Entre novamente.",
  NAO_ENCONTRADO: "Registro não encontrado.",
  TIPO_INVALIDO: "Tipo de peça inválido.",
  MODELO_OBRIGATORIO: "Informe o modelo.",
  POLEGADA_OBRIGATORIA: "Informe a polegada.",
  CODIGO_PLACA_OBRIGATORIO: "Informe o código da placa.",
  NOME_OBRIGATORIO: "Informe o nome da marca.",
  GRUPO_INVALIDO: "Grupo da gaveta inválido.",
  NUMERO_INVALIDO: "Número da gaveta inválido.",
};

/** Chamada padronizada às RPCs do Estoque, com mensagens amigáveis. */
export async function rpcEstoque<T extends { ok: boolean; code?: string }>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  const res = (data ?? { ok: false, code: "SEM_RESPOSTA" }) as T;
  if (!res.ok)
    throw new Error(CODIGOS[res.code ?? ""] ?? res.code ?? "Não foi possível concluir a operação.");
  return res;
}
