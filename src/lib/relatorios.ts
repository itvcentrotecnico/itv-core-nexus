/**
 * Tipos e utilitários do módulo RELATÓRIOS GERENCIAIS — GESTÃO ITV CENTRO TÉCNICO.
 * Todas as agregações são calculadas no banco a partir das fontes oficiais:
 * Caixa (receita), Produção validada (serviços), Custos, Comissões, Despesas e Folha.
 */

export interface RelResumoFaturamento {
  faturamento_bruto: number;
  descontos: number;
  faturamento_final: number;
  taxas: number;
  receita_liquida: number;
  lancamentos: number;
  os_faturadas: number;
  ticket_medio: number;
  ticket_medio_os: number;
}

export interface RelFaturamento {
  ok: boolean;
  code?: string;
  message?: string;
  resumo: RelResumoFaturamento;
  anterior: {
    inicio: string;
    fim: string;
    faturamento_final: number;
    receita_liquida: number;
    os_faturadas: number;
    ticket_medio: number;
  };
  por_dia: { data: string; faturamento: number; os: number; ticket_medio: number }[];
  por_semana: { semana_inicio: string; faturamento: number; os: number; ticket_medio: number; variacao_pct: number | null }[];
  por_mes: { mes: string; faturamento: number; receita_liquida: number; os: number; ticket_medio: number; variacao_pct: number | null }[];
  medias: { m3: number; m6: number; m12: number };
}

export interface RelProducao {
  ok: boolean;
  code?: string;
  message?: string;
  resumo: { servicos_validados: number; valor_producao: number; valor_medio: number; tecnicos_participantes: number };
  por_dia: { data: string; servicos: number; valor: number; media: number }[];
  por_mes: { mes: string; servicos: number; valor: number; media: number }[];
  por_tipo: { tipo: string; quantidade: number; pct: number; valor: number; ticket_medio: number; receita_associada: number }[];
  por_marca: { marca: string; quantidade: number; pct: number; receita_associada: number; ticket_medio: number }[];
  marca_x_servico: { marca: string; tipo: string; quantidade: number }[];
  por_modelo: { marca: string; modelo: string; polegadas: number | null; quantidade: number; receita_associada: number; ticket_medio: number; servicos_comuns: string | null }[];
  modelo_x_servico: { modelo: string; tipo: string; quantidade: number }[];
  marca_x_peca: { marca: string; categoria: string; quantidade: number; custo_total: number }[];
}

export interface RelTecnico {
  tecnico_id: string;
  tecnico: string;
  registrados: number;
  validados: number;
  correcoes: number;
  rejeitados: number;
  producao_validada: number;
  receita_associada: number;
  os_faturadas: number;
  ticket_medio: number;
  custos: number;
  comissao: number;
  margem: number;
  indice_validacao: number | null;
}

export interface RelTecnicos {
  ok: boolean;
  code?: string;
  message?: string;
  tecnicos: RelTecnico[];
}

export interface RelRentabilidadeItem {
  categoria: string;
  quantidade: number;
  receita: number;
  custos: number;
  comissao: number;
  margem: number;
  margem_pct: number | null;
}

export interface RelRentabilidade {
  ok: boolean;
  code?: string;
  message?: string;
  por_servico: RelRentabilidadeItem[];
  por_marca: RelRentabilidadeItem[];
  por_tecnico: RelRentabilidadeItem[];
}

export interface RelPlanejamento {
  ok: boolean;
  code?: string;
  message?: string;
  medias: {
    media_3m: number;
    media_6m: number;
    media_12m: number;
    mes_atual_parcial: number;
    crescimento_medio_pct: number;
    melhor_mes: { mes: string; faturamento: number } | null;
    pior_mes: { mes: string; faturamento: number } | null;
  };
  projecao: {
    projecao_base: number;
    cenarios: {
      conservador: number;
      base: number;
      agressivo: number;
      fatores: { conservador: number; base: number; agressivo: number };
    };
    faixa_sugerida: { min: number; max: number };
    projecao_servicos: number;
  };
  tecnicos: { tecnico: string; media_3m: number; melhor_mes: number; atual: number; ticket_medio: number; servicos_media: number }[];
  marcas: { marca: string; participacao_pct: number; media_mensal: number; projecao_servicos: number }[];
  servicos: { tipo: string; media_mensal: number; total_3m: number }[];
  modelos: { modelo: string; marca: string; media_mensal: number; total_3m: number }[];
  alertas: { tipo: string; texto: string }[];
  snapshots: { competencia: string; faturamento: number; receita_liquida: number; os: number; ticket_medio: number; resultado: number }[];
}

export type PeriodoPreset =
  | "hoje"
  | "semana"
  | "mes"
  | "mes-anterior"
  | "3m"
  | "6m"
  | "12m"
  | "ano"
  | "personalizado";

export const PERIODO_PRESETS: { key: PeriodoPreset; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta Semana" },
  { key: "mes", label: "Este Mês" },
  { key: "mes-anterior", label: "Mês Anterior" },
  { key: "3m", label: "Últimos 3 Meses" },
  { key: "6m", label: "Últimos 6 Meses" },
  { key: "12m", label: "Últimos 12 Meses" },
  { key: "ano", label: "Ano Atual" },
  { key: "personalizado", label: "Personalizado" },
];

function iso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Intervalo do preset no timezone da operação (America/Manaus). */
export function presetRange(preset: PeriodoPreset, customFrom: string, customTo: string): { from: string; to: string } | null {
  const hoje = new Date();
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  switch (preset) {
    case "hoje":
      return { from: iso(hoje), to: iso(hoje) };
    case "semana": {
      const seg = new Date(hoje);
      seg.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
      return { from: iso(seg), to: iso(hoje) };
    }
    case "mes":
      return { from: iso(new Date(y, m, 1)), to: iso(hoje) };
    case "mes-anterior":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "3m":
      return { from: iso(new Date(y, m - 2, 1)), to: iso(hoje) };
    case "6m":
      return { from: iso(new Date(y, m - 5, 1)), to: iso(hoje) };
    case "12m":
      return { from: iso(new Date(y, m - 11, 1)), to: iso(hoje) };
    case "ano":
      return { from: `${y}-01-01`, to: iso(hoje) };
    case "personalizado":
      return customFrom && customTo ? { from: customFrom, to: customTo } : null;
  }
}

/** Rótulo "Mmm/AAAA" para competência ISO. */
export function labelMes(isoMes: string): string {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [, m] = isoMes.split("-");
  return `${meses[Number(m) - 1]}/${isoMes.slice(0, 4)}`;
}
