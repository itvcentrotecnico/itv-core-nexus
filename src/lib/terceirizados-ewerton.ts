/**
 * CARGA REAL — Serviços terceirizados EWERTON, competência AGOSTO/2026.
 * 39 serviços, total esperado R$ 3.030,00.
 * Descrições preservadas exatamente como na planilha (inclusive "CONCERTO").
 * Correção autorizada pela gestão: OS 3170 de 26/09/2026 para 26/08/2026.
 * Estes dados apenas preenchem o formulário — nada é gravado sem a confirmação humana.
 */
import { linhaVazia, type LinhaEntrada } from "./terceirizados";

interface ServicoEwerton {
  data: string;
  os: string;
  referencia: string;
  marca: string;
  modelo: string;
  servico: string;
  valor: string;
  observacao?: string;
}

export const EWERTON_COMPETENCIA = "2026-08";
export const EWERTON_TOTAL_ESPERADO = "3030,00";
export const EWERTON_DESCRICAO = "Serviços Técnicos Terceirizados — Ewerton — Agosto/2026";

export const EWERTON_AGOSTO_2026: ServicoEwerton[] = [
  { data: "2026-08-17", os: "3086", referencia: "", marca: "TOSHIBA", modelo: "55M550", servico: "KIT DE LED", valor: "70" },
  { data: "2026-08-17", os: "3114", referencia: "", marca: "SAMSUNG", modelo: "UN43RU7100", servico: "CONCERTO DE MAIN", valor: "80" },
  { data: "2026-08-17", os: "3176", referencia: "", marca: "PANASONIC", modelo: "32FS500B", servico: "KIT DE LED", valor: "50" },
  { data: "2026-08-18", os: "3196", referencia: "", marca: "SAMSUNG", modelo: "UN50TU8000G", servico: "REC DISPLAY", valor: "50" },
  { data: "2026-08-18", os: "3197", referencia: "", marca: "SAMSUNG", modelo: "UN50TU7020", servico: "REC DISPLAY", valor: "50" },
  { data: "2026-08-18", os: "3201", referencia: "", marca: "LG", modelo: "55NANO75", servico: "REC DISPLAY", valor: "80" },
  { data: "2026-08-18", os: "3163", referencia: "", marca: "SAMSUNG", modelo: "UN55HU7200", servico: "KIT DE LED", valor: "70" },
  { data: "2026-08-18", os: "3209", referencia: "", marca: "TCL", modelo: "50P615", servico: "CONCERTO DE MAIN", valor: "80" },
  { data: "2026-08-18", os: "3203", referencia: "", marca: "TCL", modelo: "65P735", servico: "CONCERTO DE FONTE", valor: "140" },
  { data: "2026-08-19", os: "3122", referencia: "", marca: "SAMSUNG", modelo: "UN55MU7500", servico: "REC DISPLAY + ALTOS FALANTES", valor: "100" },
  { data: "2026-08-19", os: "3212", referencia: "", marca: "SAMSUNG", modelo: "QN55Q65", servico: "TROCA PLACASENSOR", valor: "50" },
  { data: "2026-08-19", os: "", referencia: "TV CAIO", marca: "SAMSUNG", modelo: "UN32T4300", servico: "ADP DO DISPLAY", valor: "100" },
  { data: "2026-08-19", os: "3124", referencia: "", marca: "SAMSUNG", modelo: "UN75RU7100", servico: "KIT DE LED", valor: "90" },
  { data: "2026-08-19", os: "3217", referencia: "", marca: "SAMSUNG", modelo: "UN58TU7020", servico: "REC DISPLAY", valor: "80" },
  { data: "2026-08-20", os: "3200", referencia: "", marca: "PANASONIC", modelo: "L39EM6B", servico: "KIT DE LED", valor: "50" },
  { data: "2026-08-20", os: "3178", referencia: "TV CAIO", marca: "SAMSUNG", modelo: "UN55CU7700", servico: "KIT DE LED", valor: "70" },
  { data: "2026-08-20", os: "3225", referencia: "", marca: "TCL", modelo: "65P8M", servico: "REC DISPLAY", valor: "100" },
  { data: "2026-08-20", os: "", referencia: "TV CAIO", marca: "LG", modelo: "43LR6700", servico: "ADP DO DISPLAY", valor: "120" },
  { data: "2026-08-21", os: "3207", referencia: "", marca: "LG", modelo: "50UQ8050", servico: "CONCERTO DE MAIN", valor: "80" },
  { data: "2026-08-21", os: "2820", referencia: "", marca: "TCL", modelo: "55C655", servico: "TROCA PLACA MAIN", valor: "50" },
  { data: "2026-08-21", os: "3101", referencia: "", marca: "TCL", modelo: "50S61", servico: "TROCA PLACA MAIN", valor: "50" },
  { data: "2026-08-21", os: "3232", referencia: "", marca: "LG", modelo: "65UP7750", servico: "TROCA PLACA MAIN", valor: "50" },
  { data: "2026-08-25", os: "3237", referencia: "", marca: "SAMSUNG", modelo: "QN65Q70", servico: "REC DISPLAY", valor: "100" },
  { data: "2026-08-25", os: "3241", referencia: "", marca: "PHILCO", modelo: "PTV50G70", servico: "REC DISPLAY", valor: "50" },
  { data: "2026-08-25", os: "3246", referencia: "", marca: "SEMP", modelo: "LE4057", servico: "CONCERTO DE MAIN", valor: "80" },
  { data: "2026-08-25", os: "3093", referencia: "", marca: "PHILCO", modelo: "PTV58G70", servico: "REC DISPLAY", valor: "80" },
  { data: "2026-08-25", os: "3255", referencia: "", marca: "SAMSUNG", modelo: "UN50RU7100", servico: "REC DISPLAY", valor: "50" },
  { data: "2026-08-26", os: "3249", referencia: "", marca: "SAMSUNG", modelo: "UN75DU7700", servico: "REC DISPLAY", valor: "100" },
  { data: "2026-08-26", os: "3259", referencia: "", marca: "LG", modelo: "42CS460", servico: "CONCERTO DE FONTE", valor: "80" },
  { data: "2026-08-26", os: "3268", referencia: "", marca: "PHILCO", modelo: "PTV32G70", servico: "REC DISPLAY", valor: "50" },
  { data: "2026-08-27", os: "3266", referencia: "TV CAIO", marca: "AIWA", modelo: "50-BL-02", servico: "ADP DO DISPLAY", valor: "150" },
  {
    data: "2026-08-26",
    os: "3170",
    referencia: "",
    marca: "TCL",
    modelo: "43S5K",
    servico: "TROCA PLACA MAIN",
    valor: "50",
    observacao: "Data corrigida conforme validação da gestão: 26/09/2026 → 26/08/2026.",
  },
  { data: "2026-08-27", os: "3270", referencia: "", marca: "SEMP", modelo: "55S61", servico: "REC DISPLAY", valor: "80" },
  { data: "2026-08-28", os: "3273", referencia: "", marca: "SAMSUNG", modelo: "UN50CU8000G", servico: "KIT DE LED", valor: "50" },
  { data: "2026-08-31", os: "3223", referencia: "", marca: "LG", modelo: "55UF8500", servico: "CONCERTO DE FONTE", valor: "100" },
  { data: "2026-08-31", os: "3287", referencia: "", marca: "LG", modelo: "55UM7470", servico: "REC DISPLAY", valor: "80" },
  { data: "2026-08-31", os: "3290", referencia: "", marca: "SAMSUNG", modelo: "QN55Q65", servico: "REC DISPLAY", valor: "80" },
  { data: "2026-08-07", os: "3115", referencia: "", marca: "SAMSUNG", modelo: "UN75NU7100", servico: "CONCERTO DE MAIN", valor: "140" },
  { data: "2026-08-14", os: "3168", referencia: "", marca: "SAMSUNG", modelo: "UN43BU8000", servico: "KIT DE LED", valor: "50" },
];

/** Converte a planilha do Ewerton nas linhas do assistente de lote (sem gravar nada). */
export function linhasEwerton(): LinhaEntrada[] {
  return EWERTON_AGOSTO_2026.map((s) => ({
    ...linhaVazia(),
    data_execucao: s.data,
    os: s.os,
    referencia: s.referencia,
    marca: s.marca,
    modelo: s.modelo,
    descricao_servico: s.servico,
    valor: s.valor,
    observacao: s.observacao ?? "",
  }));
}
