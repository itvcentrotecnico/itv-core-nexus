/**
 * Projeção de fechamento do mês — GESTÃO ITV CENTRO TÉCNICO.
 *
 * Cálculos puros (sem acesso ao banco). O faturamento, o ticket médio e o
 * realizado da semana vêm da mesma fonte do Caixa Diário (caixa_indicadores).
 * Timezone da operação: America/Manaus.
 */

/** Metas de faturamento mensal. Centralizadas aqui para configuração futura. */
export interface MetasFaturamento {
  piso: number;
  meta: number;
  desafio: number;
}

export const METAS_PADRAO: MetasFaturamento = {
  piso: 120000,
  meta: 125000,
  desafio: 130000,
};

/** Marcos exibidos na barra de progresso e em "Próximo marco". */
export const MARCOS_PADRAO = [100000, 110000, 120000, 125000, 130000];

/** Cenários de ticket médio para a simulação gerencial. */
export const CENARIOS_TICKET_PADRAO = [850, 930];

/** Peso operacional por dia da semana: seg-sex = 1, sábado = 0,5, domingo = 0. */
export function pesoOperacional(date: Date, feriados: string[] = []): number {
  if (feriados.includes(isoDate(date))) return 0;
  const dia = date.getDay();
  if (dia === 0) return 0;
  if (dia === 6) return 0.5;
  return 1;
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Soma os pesos operacionais entre duas datas (inclusivas). */
export function diasOperacionais(inicio: Date, fim: Date, feriados: string[] = []): number {
  let total = 0;
  const cur = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const ultimo = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  while (cur <= ultimo) {
    total += pesoOperacional(cur, feriados);
    cur.setDate(cur.getDate() + 1);
  }
  return Math.round(total * 100) / 100;
}

export type FaixaProjecao = "abaixo_piso" | "piso" | "meta" | "desafio";
export type Semaforo = "vermelho" | "amarelo" | "verde_claro" | "verde";
export type RitmoStatus = "abaixo" | "no_ritmo" | "acima";

export interface NivelResultado {
  chave: "piso" | "meta" | "desafio";
  rotulo: string;
  alvo: number;
  falta: number;
  ritmoDiario: number;
  lancamentos: number | null;
}

export interface ProjecaoMes {
  faturamento: number;
  ticketMedio: number;
  metas: MetasFaturamento;
  /** Progresso em relação ao desafio (0-100). */
  progresso: number;
  diasDecorridos: number;
  /** Dias operacionais restantes, incluindo o dia de hoje. */
  diasRestantes: number;
  mediaDiaria: number;
  projecao: number;
  faixa: FaixaProjecao;
  semaforo: Semaforo;
  niveis: NivelResultado[];
  ritmoNecessarioDesafio: number;
  diferencaRitmo: number;
  ritmoStatus: RitmoStatus;
  proximoMarco: { valor: number; falta: number } | null;
  marcos: { valor: number; atingido: boolean; posicao: number }[];
  semana: { realizado: number; meta: number; falta: number } | null;
  cenarios: { ticket: number; lancamentos: number | null }[];
}

export interface EntradaProjecao {
  faturamento: number;
  ticketMedio: number;
  hoje: Date;
  realizadoSemana?: number | null;
  metas?: MetasFaturamento;
  marcos?: number[];
  cenariosTicket?: number[];
  feriados?: string[];
}

const ROTULOS: Record<"piso" | "meta" | "desafio", string> = {
  piso: "Piso",
  meta: "Meta",
  desafio: "Desafio",
};

function estimaLancamentos(falta: number, ticket: number): number | null {
  if (ticket <= 0) return null;
  if (falta <= 0) return 0;
  return Math.ceil(falta / ticket);
}

/** Calcula todo o painel de projeção a partir dos dados reais do mês. */
export function calcularProjecao(entrada: EntradaProjecao): ProjecaoMes {
  const metas = entrada.metas ?? METAS_PADRAO;
  const marcosBase = entrada.marcos ?? MARCOS_PADRAO;
  const feriados = entrada.feriados ?? [];
  const faturamento = Math.max(entrada.faturamento, 0);
  const ticketMedio = Math.max(entrada.ticketMedio, 0);

  const hoje = new Date(
    entrada.hoje.getFullYear(),
    entrada.hoje.getMonth(),
    entrada.hoje.getDate(),
  );
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);

  const diasDecorridos = diasOperacionais(primeiro, hoje, feriados);
  const diasFuturos = amanha > ultimo ? 0 : diasOperacionais(amanha, ultimo, feriados);
  const diasRestantes = Math.round((diasFuturos + pesoOperacional(hoje, feriados)) * 100) / 100;

  const mediaDiaria = diasDecorridos > 0 ? faturamento / diasDecorridos : 0;
  const projecao = faturamento + mediaDiaria * diasFuturos;

  const niveis: NivelResultado[] = (["piso", "meta", "desafio"] as const).map((chave) => {
    const alvo = metas[chave];
    const falta = Math.max(alvo - faturamento, 0);
    return {
      chave,
      rotulo: ROTULOS[chave],
      alvo,
      falta,
      ritmoDiario: diasRestantes > 0 ? falta / diasRestantes : falta,
      lancamentos: estimaLancamentos(falta, ticketMedio),
    };
  });

  const faixa: FaixaProjecao =
    projecao >= metas.desafio
      ? "desafio"
      : projecao >= metas.meta
        ? "meta"
        : projecao >= metas.piso
          ? "piso"
          : "abaixo_piso";
  const semaforo: Semaforo =
    faixa === "desafio"
      ? "verde"
      : faixa === "meta"
        ? "verde_claro"
        : faixa === "piso"
          ? "amarelo"
          : "vermelho";

  const ritmoNecessarioDesafio = niveis[2]!.ritmoDiario;
  const diferencaRitmo = mediaDiaria - ritmoNecessarioDesafio;
  const ritmoStatus: RitmoStatus =
    Math.abs(diferencaRitmo) <= ritmoNecessarioDesafio * 0.02
      ? "no_ritmo"
      : diferencaRitmo > 0
        ? "acima"
        : "abaixo";

  const marcosOrdenados = [...marcosBase].sort((a, b) => a - b);
  const proximo = marcosOrdenados.find((m) => m > faturamento);
  const maiorMarco = marcosOrdenados[marcosOrdenados.length - 1] ?? metas.desafio;
  const referencia = Math.max(metas.desafio, maiorMarco);

  let semana: ProjecaoMes["semana"] = null;
  if (entrada.realizadoSemana != null) {
    const segunda = new Date(hoje);
    segunda.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const sabado = new Date(segunda);
    sabado.setDate(segunda.getDate() + 5);
    const iniSemana = segunda < primeiro ? primeiro : segunda;
    const fimSemana = sabado > ultimo ? ultimo : sabado;
    const diasSemana = diasOperacionais(iniSemana, fimSemana, feriados);
    const ritmoMeta = niveis[1]!.ritmoDiario;
    const metaSemana = ritmoMeta * diasSemana;
    semana = {
      realizado: entrada.realizadoSemana,
      meta: metaSemana,
      falta: Math.max(metaSemana - entrada.realizadoSemana, 0),
    };
  }

  const faltaDesafio = niveis[2]!.falta;
  const cenarios = [ticketMedio, ...(entrada.cenariosTicket ?? CENARIOS_TICKET_PADRAO)]
    .filter((t) => t > 0)
    .map((ticket) => ({ ticket, lancamentos: estimaLancamentos(faltaDesafio, ticket) }));

  return {
    faturamento,
    ticketMedio,
    metas,
    progresso: referencia > 0 ? Math.min((faturamento / referencia) * 100, 100) : 0,
    diasDecorridos,
    diasRestantes,
    mediaDiaria,
    projecao,
    faixa,
    semaforo,
    niveis,
    ritmoNecessarioDesafio,
    diferencaRitmo,
    ritmoStatus,
    proximoMarco: proximo != null ? { valor: proximo, falta: proximo - faturamento } : null,
    marcos: marcosOrdenados.map((valor) => ({
      valor,
      atingido: faturamento >= valor,
      posicao: referencia > 0 ? Math.min((valor / referencia) * 100, 100) : 0,
    })),
    semana,
    cenarios,
  };
}

export const FAIXA_LABEL: Record<FaixaProjecao, string> = {
  abaixo_piso: "Abaixo do piso",
  piso: "R$ 120K–125K",
  meta: "Meta atingida",
  desafio: "Desafio atingido",
};

export const SEMAFORO_LABEL: Record<Semaforo, string> = {
  vermelho: "Atenção máxima",
  amarelo: "Atenção",
  verde_claro: "Dentro da meta",
  verde: "Desafio no alcance",
};

export const RITMO_LABEL: Record<RitmoStatus, string> = {
  abaixo: "Abaixo do ritmo",
  no_ritmo: "No ritmo",
  acima: "Acima do ritmo",
};
