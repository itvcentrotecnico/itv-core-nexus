/**
 * MODO TV — painel de gestão à vista da ITV Centro Técnico.
 * Consome exclusivamente a RPC consolidada `modo_tv_indicadores`, que lê as fontes
 * oficiais (Caixa, Metas e Produção Técnica validada). Nenhum dado financeiro
 * sensível (folha, despesas, comissões, contas, clientes) trafega neste módulo.
 */

export interface ModoTvConfig {
  mostrar_faturamento: boolean;
  mostrar_meta: boolean;
  mostrar_projecao: boolean;
  mostrar_producao: boolean;
  mostrar_ranking: boolean;
  mostrar_ticket_medio: boolean;
  mostrar_marcas: boolean;
  mostrar_tipos_servico: boolean;
  mostrar_comparacao: boolean;
  mostrar_mensagem: boolean;
  mensagem_titulo: string;
  mensagem_texto: string;
  criterio_destaque: "producao" | "meta" | "validacao";
  rotacao_segundos: number;
  refresh_segundos: number;
}

export const MODO_TV_CONFIG_PADRAO: ModoTvConfig = {
  mostrar_faturamento: true,
  mostrar_meta: true,
  mostrar_projecao: true,
  mostrar_producao: true,
  mostrar_ranking: true,
  mostrar_ticket_medio: false,
  mostrar_marcas: true,
  mostrar_tipos_servico: true,
  mostrar_comparacao: true,
  mostrar_mensagem: false,
  mensagem_titulo: "FOCO DA SEMANA",
  mensagem_texto: "",
  criterio_destaque: "producao",
  rotacao_segundos: 25,
  refresh_segundos: 60,
};

export interface ModoTvTecnico {
  tecnico_id: string;
  tecnico: string;
  validados_mes: number;
  valor_mes: number;
  meta: { tipo: string; valor: number | null; quantidade: number | null } | null;
}

export interface ModoTvIndicadores {
  ok: boolean;
  code?: string;
  referencia: string;
  mes: { inicio: string; fim: string; dias_total: number; dias_decorridos: number; dias_restantes: number };
  faturamento: {
    mes: number;
    receita_liquida: number;
    os: number;
    ticket_medio: number;
    mes_anterior_mesmo_periodo: number;
    evolucao_pct: number | null;
  };
  meta: { nome: string; tipo: string; valor: number; realizado: number; percentual: number; faltante: number } | null;
  ritmo: { atual: number; necessario: number; projecao: number; status: "acima" | "no_ritmo" | "atencao" | "sem_meta" };
  producao: { hoje: number; semana: number; mes: number };
  tecnicos: ModoTvTecnico[];
  ranking: { tecnico: string; valor: number; servicos: number }[];
  tipos_servico: { tipo: string; quantidade: number; pct: number }[];
  marcas: { marca: string; quantidade: number }[];
  destaque_semana: {
    producao: { tecnico: string; valor: number; servicos: number } | null;
    validacao: { tecnico: string; indice: number; enviados: number } | null;
  };
  config: Partial<ModoTvConfig> | null;
}

export const STATUS_RITMO_LABEL: Record<ModoTvIndicadores["ritmo"]["status"], string> = {
  acima: "Acima da Meta",
  no_ritmo: "No Ritmo",
  atencao: "Atenção",
  sem_meta: "Sem meta definida",
};

/** Primeiro nome, para leitura rápida à distância. */
export function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1]?.[0] ?? ""}.` : (partes[0] ?? nome);
}

/** Percentual de atingimento de um técnico conforme a meta vigente. */
export function percentualTecnico(t: ModoTvTecnico): number | null {
  if (!t.meta) return null;
  if (t.meta.tipo === "quantidade" && t.meta.quantidade) {
    return Math.round((t.validados_mes / t.meta.quantidade) * 1000) / 10;
  }
  if (t.meta.valor) return Math.round((t.valor_mes / t.meta.valor) * 1000) / 10;
  return null;
}
