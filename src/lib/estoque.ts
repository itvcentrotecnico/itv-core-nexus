/**
 * ESTOQUE TÉCNICO — cadastro, consulta, reserva e movimentação.
 * Reserva NUNCA reduz o saldo físico; só a baixa reduz.
 * Nenhuma quantidade muda sem movimentação registrada.
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
  custo_unitario: number | null;
  condicao: CondicaoPeca | null;
  compatibilidades: string[];
  status: EstoqueStatus;
  /** Quantidade reservada para o próprio usuário (técnico) — nunca expõe OS de terceiros. */
  minha_reserva?: number;
  minha_reserva_os?: string | null;
}

/** Condição da peça — usada principalmente nas Placas Main. */
export type CondicaoPeca =
  | "nova"
  | "usada_testada"
  | "recuperada_testada"
  | "aguardando_teste"
  | "defeituosa";

export const CONDICOES: { value: CondicaoPeca; label: string; classe: string }[] = [
  { value: "nova", label: "Nova", classe: "bg-primary/10 text-primary border-primary/30" },
  {
    value: "usada_testada",
    label: "Original usada testada",
    classe: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  },
  {
    value: "recuperada_testada",
    label: "Recuperada testada",
    classe: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  },
  {
    value: "aguardando_teste",
    label: "Aguardando teste",
    classe: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  },
  {
    value: "defeituosa",
    label: "Defeituosa",
    classe: "bg-destructive/10 text-destructive border-destructive/30",
  },
];

export const CONDICAO_LABEL: Record<string, string> = Object.fromEntries(
  CONDICOES.map((c) => [c.value, c.label]),
);

/** Como a quantidade inicial de um cadastro entra no estoque (sempre com movimentação). */
export const MOTIVOS_INICIAIS = [
  { value: "entrada_inicial", label: "Quantidade inicial do cadastro" },
  { value: "saldo_abertura", label: "Saldo de abertura (peça já existia na ITV)" },
  { value: "entrada_compra", label: "Entrada por compra" },
];

export interface ReposicaoLinha {
  id: string;
  tipo: EstoqueTipo;
  marca_nome: string;
  polegada: string | null;
  modelo: string;
  codigo_placa: string | null;
  gaveta_label: string;
  fisico: number;
  reservado: number;
  disponivel: number;
  minimo: number;
  falta: number;
  status: "sem_estoque" | "baixo";
}

export interface MovimentoLinha {
  id: string;
  data: string;
  tipo: "entrada" | "saida";
  motivo: string;
  quantidade: number;
  saldo_anterior: number;
  saldo_posterior: number;
  os: string | null;
  observacao: string | null;
  familia: EstoqueTipo;
  marca_nome: string;
  polegada: string | null;
  modelo: string;
  codigo_placa: string | null;
  gaveta_label: string;
  tecnico_nome: string | null;
  responsavel: string | null;
  estornado_em: string | null;
  estorno_de: string | null;
}

export interface GavetaPainelLinha {
  id: string;
  grupo: "LED" | "MAIN";
  numero: number;
  codigo: string;
  label: string;
  descricao: string | null;
  ativo: boolean;
  itens: number;
  total: number;
  reservado: number;
}

export interface RelatorioLinha {
  rotulo?: string;
  marca?: string;
  grupo_label?: string;
  gaveta?: string;
  total?: number;
  posicoes?: number;
  reservado?: number;
  disponivel?: number;
  minimo?: number;
  movimentos?: number;
  sistema?: number;
  contado?: number;
  diferenca?: number;
  data?: string;
  responsavel?: string | null;
  itens?: { marca: string; modelo: string; quantidade: number }[];
}

export type StatusSolicitacao =
  | "aguardando"
  | "reservada"
  | "parcialmente_atendida"
  | "entregue"
  | "rejeitada"
  | "cancelada";

export const STATUS_SOLICITACAO: Record<StatusSolicitacao, { label: string; classe: string }> = {
  aguardando: {
    label: "AGUARDANDO GERÊNCIA",
    classe: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  },
  reservada: { label: "RESERVADA", classe: "bg-primary/10 text-primary border-primary/30" },
  parcialmente_atendida: {
    label: "PARCIALMENTE ATENDIDA",
    classe: "bg-sky-500/10 text-sky-600 border-sky-500/30",
  },
  entregue: {
    label: "ENTREGUE / UTILIZADA",
    classe: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  },
  rejeitada: {
    label: "REJEITADA",
    classe: "bg-destructive/10 text-destructive border-destructive/30",
  },
  cancelada: { label: "CANCELADA", classe: "bg-muted text-muted-foreground border-border" },
};

export interface SolicitacaoEstoque {
  id: string;
  item_id: string;
  os: string;
  quantidade: number;
  quantidade_reservada: number;
  quantidade_entregue: number;
  status: StatusSolicitacao;
  observacao: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  analisado_em: string | null;
  analisado_por_nome: string | null;
  tecnico_id: string;
  tecnico_nome: string | null;
  tipo: EstoqueTipo;
  marca_nome: string;
  modelo: string;
  polegada: string | null;
  codigo_placa: string | null;
  gaveta_label: string;
  fisico: number;
  reservado: number;
  disponivel: number;
}

export interface ReservaAtiva {
  id: string;
  item_id: string;
  quantidade: number;
  quantidade_entregue: number;
  status: "ativa" | "parcialmente_utilizada";
  os: string | null;
  tecnico_id: string | null;
  tecnico_nome: string | null;
  observacao: string | null;
  created_at: string;
  dias: number;
  reservado_por: string | null;
  tipo: EstoqueTipo;
  marca_nome: string;
  modelo: string;
  codigo_placa: string | null;
  gaveta_label: string;
  fisico: number;
  reservado_item: number;
  disponivel: number;
  solicitacao_id: string | null;
}

export interface EstoqueResumo {
  ok: true;
  solicitacoes_pendentes: number;
  minhas_solicitacoes_pendentes: number;
  reservas_ativas: number;
  reservas_antigas: number;
  entregas_hoje: number;
  baixas_hoje: number;
  itens_sem_disponibilidade: number;
}

/** Motivos padronizados para liberar uma reserva sem baixa física. */
export const MOTIVOS_LIBERACAO = [
  "Reparo cancelado",
  "Cliente não aprovou",
  "Diagnóstico alterado",
  "Peça incompatível",
  "Peça não será utilizada",
  "OS encerrada",
  "Outro",
];

export type MotivoSaida =
  | "uso_os"
  | "defeito_perda"
  | "devolucao_fornecedor"
  | "transferencia"
  | "ajuste_inventario";

export type MotivoEntrada =
  | "entrada_compra"
  | "devolucao_tecnico"
  | "ajuste_inventario"
  | "transferencia";

export const MOTIVOS_SAIDA: { value: MotivoSaida; label: string }[] = [
  { value: "uso_os", label: "Uso em OS" },
  { value: "defeito_perda", label: "Defeito / Perda" },
  { value: "devolucao_fornecedor", label: "Devolução ao fornecedor" },
  { value: "transferencia", label: "Transferência" },
  { value: "ajuste_inventario", label: "Ajuste de inventário" },
];

export const MOTIVOS_ENTRADA: { value: MotivoEntrada; label: string }[] = [
  { value: "entrada_compra", label: "Entrada / compra" },
  { value: "devolucao_tecnico", label: "Devolução do técnico" },
  { value: "ajuste_inventario", label: "Ajuste de inventário" },
  { value: "transferencia", label: "Transferência" },
];

export const MOTIVO_LABEL: Record<string, string> = {
  uso_os: "Uso em OS",
  defeito_perda: "Defeito / Perda",
  devolucao_fornecedor: "Devolução ao fornecedor",
  transferencia: "Transferência",
  ajuste_inventario: "Ajuste de inventário",
  entrada_inicial: "Quantidade inicial do cadastro",
  entrada_compra: "Entrada / compra",
  devolucao_tecnico: "Devolução do técnico",
  estorno: "Estorno",
  saldo_abertura: "Saldo de abertura",
};

export interface MovimentoEstoque {
  id: string;
  tipo: "entrada" | "saida";
  motivo: string;
  quantidade: number;
  os: string | null;
  tecnico_nome: string | null;
  observacao: string | null;
  saldo_anterior: number;
  saldo_posterior: number;
  custo_unitario: number | null;
  custo_os_id: string | null;
  reserva_id?: string | null;
  estornado_em: string | null;
  estorno_de: string | null;
  created_at: string;
  responsavel: string | null;
}

export interface ReservaEstoque {
  id: string;
  quantidade: number;
  os: string | null;
  tecnico_nome: string | null;
  observacao: string | null;
  created_at: string;
}

export interface HistoricoEstoque {
  ok: true;
  movimentos: MovimentoEstoque[];
  reservas: ReservaEstoque[];
}

export interface BaixaResultado {
  ok: true;
  id: string;
  peca: string;
  tipo: EstoqueTipo;
  gaveta: string;
  quantidade: number;
  os: string | null;
  tecnico: string | null;
  saldo_anterior: number;
  saldo_posterior: number;
  custo_os_id: string | null;
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
  QUANTIDADE_INVALIDA: "Informe uma quantidade maior que zero.",
  MOTIVO_INVALIDO: "Motivo de movimentação inválido.",
  MOTIVO_OBRIGATORIO: "Informe o motivo.",
  OS_OBRIGATORIA: "Para uso em OS, informe o número da OS.",
  SALDO_INSUFICIENTE: "Quantidade maior que o saldo disponível. A baixa não foi registrada.",
  RESERVA_INVALIDA: "Reserva não encontrada ou já atendida.",
  QUANTIDADE_ACIMA_RESERVA: "Quantidade maior que a quantidade reservada.",
  JA_ESTORNADO: "Esta movimentação já foi estornada.",
  MOVIMENTO_NAO_ESTORNAVEL: "Um estorno não pode ser estornado.",
  SEM_DISPONIBILIDADE: "Esta peça não possui mais quantidade disponível suficiente.",
  SOLICITACAO_DUPLICADA: "Você já tem uma solicitação igual aguardando a Gerência.",
  SOLICITACAO_NAO_PENDENTE:
    "Esta solicitação já foi analisada pela Gerência e não pode mais ser alterada.",
  QUANTIDADE_ACIMA_SOLICITADA: "Quantidade maior que a solicitada pelo técnico.",
  LOCALIZACAO_IGUAL: "Escolha uma gaveta diferente da atual.",
  LOTE_OBRIGATORIO: "Informe o lote do inventário inicial.",
  SEM_ITENS: "Nenhum item informado.",
  LOTE_JA_IMPORTADO:
    "Este inventário inicial já foi gravado. Nada foi duplicado. Consulte o histórico das peças.",
  DIVERGENCIA:
    "⚠️ Divergência no Inventário Inicial. Revise os dados antes da confirmação — nada foi gravado.",
  SALDO_EXISTENTE:
    "Existem peças com saldo diferente de zero. A carga foi bloqueada para não somar quantidades.",
  MARCA_NAO_ENCONTRADA: "Marca não cadastrada. Cadastre a marca antes da carga.",
  GAVETA_NAO_ENCONTRADA: "Gaveta não cadastrada.",
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
