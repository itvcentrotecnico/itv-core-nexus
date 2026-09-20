/**
 * INVENTÁRIO OFICIAL ITV — Kits de LED (carga inicial / saldo de abertura).
 * Dados conferidos pela ITV: 29 posições, 25 gavetas ocupadas, 183 kits.
 * Compatibilidades ficam VAZIAS até validação técnica. Nenhum custo foi informado.
 */

export const LOTE_INVENTARIO_LED = "INVENTARIO-INICIAL-LED-ITV-2026";

export interface PosicaoInventario {
  marca: string;
  polegada: string;
  modelo: string;
  gaveta: number;
  quantidade: number;
  observacao?: string;
}

export const INVENTARIO_LED: PosicaoInventario[] = [
  // Samsung — 141
  { marca: "Samsung", polegada: "40", modelo: "UN40J5200", gaveta: 1, quantidade: 10 },
  { marca: "Samsung", polegada: "43", modelo: "UN43RU7100", gaveta: 2, quantidade: 6 },
  { marca: "Samsung", polegada: "49", modelo: "UN49RU7100", gaveta: 2, quantidade: 1 },
  { marca: "Samsung", polegada: "50", modelo: "UN50AU8000G", gaveta: 4, quantidade: 10 },
  { marca: "Samsung", polegada: "65", modelo: "UN65TU7020", gaveta: 5, quantidade: 22 },
  { marca: "Samsung", polegada: "60", modelo: "UN60AU8000G", gaveta: 7, quantidade: 5 },
  { marca: "Samsung", polegada: "65", modelo: "UN65AU8000G", gaveta: 8, quantidade: 12 },
  { marca: "Samsung", polegada: "50", modelo: "UN50RU7100G", gaveta: 9, quantidade: 10 },
  { marca: "Samsung", polegada: "55", modelo: "UN55RU7100G", gaveta: 10, quantidade: 9 },
  { marca: "Samsung", polegada: "65", modelo: "UN65RU7100G", gaveta: 11, quantidade: 9 },
  { marca: "Samsung", polegada: "75", modelo: "UN75RU7100G", gaveta: 12, quantidade: 8 },
  { marca: "Samsung", polegada: "75", modelo: "UN75TU7020G", gaveta: 13, quantidade: 2 },
  { marca: "Samsung", polegada: "55", modelo: "UN55AU8000G", gaveta: 14, quantidade: 6 },
  { marca: "Samsung", polegada: "75", modelo: "UN75AU8000G", gaveta: 15, quantidade: 8 },
  { marca: "Samsung", polegada: "85", modelo: "UN85AU8000G", gaveta: 17, quantidade: 2 },
  { marca: "Samsung", polegada: "50", modelo: "UN50DU7700G", gaveta: 18, quantidade: 20 },
  { marca: "Samsung", polegada: "75", modelo: "UN75F6400G", gaveta: 20, quantidade: 1 },
  // LG — 15
  { marca: "LG", polegada: "55", modelo: "55UM7520", gaveta: 25, quantidade: 4 },
  { marca: "LG", polegada: "47", modelo: "47LA6140", gaveta: 25, quantidade: 1 },
  {
    marca: "LG",
    polegada: "43",
    modelo: "43UH6030",
    gaveta: 28,
    quantidade: 9,
    observacao: "ADAPTAÇÃO",
  },
  { marca: "LG", polegada: "55", modelo: "55LB", gaveta: 29, quantidade: 1 },
  // TCL — 11
  { marca: "TCL", polegada: "65", modelo: "65P8M", gaveta: 24, quantidade: 5 },
  { marca: "TCL", polegada: "43", modelo: "43P635", gaveta: 24, quantidade: 1 },
  { marca: "TCL", polegada: "55", modelo: "55P715", gaveta: 30, quantidade: 5 },
  // Panasonic — 6
  { marca: "Panasonic", polegada: "39", modelo: "TC-39AS600B", gaveta: 23, quantidade: 3 },
  { marca: "Panasonic", polegada: "49", modelo: "49DS630B/ES", gaveta: 26, quantidade: 2 },
  { marca: "Panasonic", polegada: "30", modelo: "TC-L30EM6B", gaveta: 26, quantidade: 1 },
  // Toshiba — 2
  { marca: "Toshiba", polegada: "50", modelo: "50C350KB/LS", gaveta: 22, quantidade: 2 },
  // Philco — 8
  { marca: "Philco", polegada: "58", modelo: "PTV58F60/F80", gaveta: 27, quantidade: 8 },
];

/** Totais oficiais conferidos pela ITV — usados como trava de segurança. */
export const ESPERADO_INVENTARIO_LED = {
  posicoes: 29,
  gavetas: 25,
  total: 183,
  marcas: {
    Samsung: 141,
    LG: 15,
    TCL: 11,
    Panasonic: 6,
    Toshiba: 2,
    Philco: 8,
  } as Record<string, number>,
};

/** Confere os dados do arquivo antes de enviar ao banco. */
export function conferirInventario() {
  const marcas: Record<string, number> = {};
  let total = 0;
  const gavetas = new Set<number>();
  for (const p of INVENTARIO_LED) {
    total += p.quantidade;
    gavetas.add(p.gaveta);
    marcas[p.marca] = (marcas[p.marca] ?? 0) + p.quantidade;
  }
  const ok =
    total === ESPERADO_INVENTARIO_LED.total &&
    INVENTARIO_LED.length === ESPERADO_INVENTARIO_LED.posicoes &&
    gavetas.size === ESPERADO_INVENTARIO_LED.gavetas &&
    Object.entries(ESPERADO_INVENTARIO_LED.marcas).every(([m, q]) => marcas[m] === q) &&
    Object.keys(marcas).length === Object.keys(ESPERADO_INVENTARIO_LED.marcas).length;
  return { ok, total, posicoes: INVENTARIO_LED.length, gavetas: gavetas.size, marcas };
}
