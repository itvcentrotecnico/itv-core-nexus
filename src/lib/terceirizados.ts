/**
 * SERVIÇOS TERCEIRIZADOS — lançamento em lote (Central Operacional).
 * Nada é gravado antes da confirmação humana: a prévia é apenas validação.
 * Valores sempre NUMERIC(12,2) no banco; aqui number arredondado a 2 casas.
 */
import { supabase } from "@/integrations/supabase/client";

export type SituacaoItem = "ok" | "atencao" | "duplicidade" | "duplicidade_exata" | "erro";

export type LoteStatus =
  | "rascunho"
  | "em_validacao"
  | "aguardando_confirmacao"
  | "confirmado"
  | "liberado_financeiro"
  | "parcialmente_pago"
  | "pago"
  | "cancelado";

export const STATUS_LOTE: Record<LoteStatus, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  em_validacao: { label: "Em validação", className: "bg-muted text-muted-foreground" },
  aguardando_confirmacao: { label: "Aguardando confirmação", className: "bg-amber-500/10 text-amber-600" },
  confirmado: { label: "Confirmado", className: "bg-primary/10 text-primary" },
  liberado_financeiro: { label: "Liberado para o Financeiro", className: "bg-blue-500/10 text-blue-600" },
  parcialmente_pago: { label: "Parcialmente pago", className: "bg-amber-500/10 text-amber-600" },
  pago: { label: "Pago", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
};

/** Situação do lote dentro do Financeiro — sempre visível na lista e no detalhe. */
export type FinanceiroStatus =
  | "nao_liberado"
  | "liberado"
  | "em_analise"
  | "devolvido"
  | "em_pagamento"
  | "pago"
  | "cancelado";

export const STATUS_FINANCEIRO: Record<FinanceiroStatus, { label: string; className: string }> = {
  nao_liberado: { label: "Ainda não liberado", className: "bg-muted text-muted-foreground" },
  liberado: { label: "Liberado para o Financeiro", className: "bg-blue-500/10 text-blue-600" },
  em_analise: { label: "Em análise financeira", className: "bg-blue-500/10 text-blue-600" },
  devolvido: { label: "Devolvido para correção", className: "bg-orange-500/10 text-orange-600" },
  em_pagamento: { label: "Pagamento parcial", className: "bg-amber-500/10 text-amber-600" },
  pago: { label: "Pago", className: "bg-primary/10 text-primary" },
  cancelado: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
};

export interface EventoLote {
  em: string;
  titulo: string;
  quem?: string | null;
  detalhe?: string | null;
}

/** Retorno da liberação: tudo que o gerente precisa ver confirmado na hora. */
export interface LiberacaoResultado {
  ok: boolean;
  message?: string;
  repetido?: boolean;
  prestador?: string;
  competencia?: string;
  quantidade?: number;
  valor?: number;
  liberado_por?: string | null;
  liberado_em?: string | null;
}

export const SITUACAO_ITEM: Record<SituacaoItem, { label: string; className: string }> = {
  ok: { label: "OK", className: "bg-primary/10 text-primary" },
  atencao: { label: "Atenção", className: "bg-amber-500/10 text-amber-600" },
  duplicidade: { label: "Possível duplicidade", className: "bg-orange-500/10 text-orange-600" },
  duplicidade_exata: { label: "Duplicidade exata", className: "bg-destructive/10 text-destructive" },
  erro: { label: "Erro", className: "bg-destructive/10 text-destructive" },
};

/** Linha digitada/colada pelo ADM Operacional (ainda não gravada). */
export interface LinhaEntrada {
  id: string;
  data_execucao: string;
  os: string;
  referencia: string;
  marca: string;
  modelo: string;
  polegadas: string;
  tipo_servico: string;
  descricao_servico: string;
  valor: string;
  observacao: string;
}

export interface ItemPrevia {
  linha: number;
  os: string | null;
  referencia: string | null;
  data_execucao: string | null;
  marca: string | null;
  modelo: string | null;
  polegadas: number | null;
  tipo_servico: string | null;
  descricao_servico: string | null;
  valor: number | null;
  observacao: string | null;
  situacao: SituacaoItem;
  mensagens: string[];
  similar: {
    os: string | null;
    referencia: string | null;
    descricao_servico: string | null;
    valor_devido_prestador: number;
    data_execucao: string | null;
  } | null;
}

export interface PreviaLote {
  ok: boolean;
  message?: string;
  itens: ItemPrevia[];
  quantidade: number;
  total_calculado: number;
  total_esperado: number | null;
  diferenca: number | null;
  conciliado: boolean | null;
  erros: number;
  atencoes: number;
  duplicidades: number;
  duplicidades_exatas: number;
  pode_confirmar: boolean;
}

export interface LoteResumo {
  id: string;
  prestador: string;
  prestador_id: string;
  competencia: string;
  descricao: string | null;
  origem_lote: string;
  quantidade_itens: number;
  valor_total: number;
  total_esperado: number | null;
  status: LoteStatus;
  teste: boolean;
  conta_pagar_id: string | null;
  created_at: string;
}

export interface LoteItem {
  id: string;
  os: string | null;
  referencia: string | null;
  data_execucao: string | null;
  marca: string | null;
  modelo: string | null;
  polegadas: number | null;
  tipo_servico: string | null;
  descricao_servico: string;
  valor_devido_prestador: number;
  observacao: string | null;
  duplicidade_autorizada: boolean;
  motivo_duplicidade: string | null;
  status: string;
}

export interface LoteDetalhe {
  ok: boolean;
  message?: string;
  lote: LoteResumo & {
    criado_por: string | null;
    confirmado_por: string | null;
    liberado_por: string | null;
    released_to_finance_at: string | null;
    confirmed_at: string | null;
    cancel_reason: string | null;
  };
  itens: LoteItem[];
}

/** Chamada às rotinas de terceirizados com mensagem amigável (nunca expõe SQL/RLS). */
export async function rpcTerc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) {
    throw new Error("Não foi possível concluir a operação agora. Tente novamente.");
  }
  return data as T;
}

export function linhaVazia(): LinhaEntrada {
  return {
    id: crypto.randomUUID(),
    data_execucao: "",
    os: "",
    referencia: "",
    marca: "",
    modelo: "",
    polegadas: "",
    tipo_servico: "",
    descricao_servico: "",
    valor: "",
    observacao: "",
  };
}

/** Converte "1.234,56", "1234.56" ou "R$ 200" em número (string ISO para o banco). */
export function normalizarValor(bruto: string): string {
  const limpo = bruto
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  return limpo;
}

/** Converte 05/08/2026 ou 2026-08-05 em YYYY-MM-DD; devolve o original se não reconhecer. */
export function normalizarData(bruto: string): string {
  const t = bruto.trim();
  const br = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(t);
  if (br) {
    const [, d, m, y] = br;
    const ano = y!.length === 2 ? `20${y}` : y!;
    return `${ano}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }
  return t;
}

/**
 * Colagem estruturada: uma linha por serviço, colunas separadas por TAB ou ponto e vírgula.
 * Ordem: Data | OS | Referência | Marca | Modelo | Polegadas | Serviço | Valor
 */
export function parsearColagem(texto: string): LinhaEntrada[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linha) => {
      const c = linha.split(/\t|;/).map((x) => x.trim());
      const base = linhaVazia();
      base.data_execucao = normalizarData(c[0] ?? "");
      base.os = c[1] ?? "";
      base.referencia = c[2] ?? "";
      base.marca = c[3] ?? "";
      base.modelo = c[4] ?? "";
      base.polegadas = c[5] ?? "";
      base.descricao_servico = c[6] ?? "";
      base.valor = normalizarValor(c[7] ?? "");
      return base;
    });
}

/** Payload enviado ao banco — preserva marca/modelo exatamente como informados. */
export function paraPayload(linhas: LinhaEntrada[]) {
  return linhas.map((l) => ({
    os: l.os.trim(),
    referencia: l.referencia.trim(),
    data_execucao: normalizarData(l.data_execucao),
    marca: l.marca,
    modelo: l.modelo,
    polegadas: l.polegadas.trim(),
    tipo_servico: l.tipo_servico.trim(),
    descricao_servico: l.descricao_servico.trim(),
    valor: normalizarValor(l.valor),
    observacao: l.observacao.trim(),
  }));
}
