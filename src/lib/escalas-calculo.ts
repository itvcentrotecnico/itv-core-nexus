export interface DiaEscala {
  folga: boolean;
  entrada: number | null;
  saida: number | null;
  intervalo: number;
  intervalo_inicio?: number | null;
  intervalo_fim?: number | null;
}
export interface PessoaEscala {
  colaborador_id: string;
  pendente?: boolean;
  nome: string;
  funcao: string;
  meta: number;
  dias: DiaEscala[];
}
export interface RegrasEscala {
  abertura: number;
  fechamento: number;
  sabado_abertura: number;
  sabado_fechamento: number;
  domingo_fechado: boolean;
  prioridade_completa: number[];
  todos_sabado: boolean;
  minimo_sabado: number;
  max_diario: number;
  intervalo_minimo: number;
  intervalo_apos: number;
}
export const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export function minutosDia(d: DiaEscala): number {
  if (d.folga || d.entrada === null || d.saida === null) return 0;
  return Math.max(0, d.saida - d.entrada - duracaoIntervalo(d));
}
export function duracaoIntervalo(d: DiaEscala) {
  return d.intervalo_inicio != null && d.intervalo_fim != null
    ? d.intervalo_fim - d.intervalo_inicio
    : d.intervalo;
}
export function intervaloTexto(d: DiaEscala) {
  return d.intervalo_inicio != null && d.intervalo_fim != null
    ? `${horario(d.intervalo_inicio)}–${horario(d.intervalo_fim)} · ${duracaoIntervalo(d)} min`
    : d.intervalo > 0
      ? `${d.intervalo} min · horários pendentes`
      : "Sem intervalo";
}
export function totalSemana(dias: DiaEscala[]) {
  return dias.reduce((s, d) => s + minutosDia(d), 0);
}
export function horas(min: number) {
  const n = Math.abs(min);
  return `${min < 0 ? "−" : ""}${Math.floor(n / 60)}h${n % 60 ? String(n % 60).padStart(2, "0") : ""}`;
}
export function horario(min: number | null) {
  return min === null
    ? "—"
    : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
export function inconsistencias(d: DiaEscala): boolean {
  const ini = d.intervalo_inicio ?? null;
  const fim = d.intervalo_fim ?? null;
  if ((ini === null) !== (fim === null)) return true;
  if (
    ini !== null &&
    fim !== null &&
    (d.folga ||
      d.entrada === null ||
      d.saida === null ||
      ini < d.entrada ||
      fim > d.saida ||
      fim <= ini ||
      ini % 15 !== 0 ||
      fim % 15 !== 0)
  )
    return true;
  return d.folga
    ? d.entrada !== null || d.saida !== null || d.intervalo !== 0
    : d.entrada === null ||
        d.saida === null ||
        d.entrada < 0 ||
        d.saida > 1440 ||
        d.entrada % 30 !== 0 ||
        d.saida % 30 !== 0 ||
        d.saida <= d.entrada ||
        d.intervalo < 0 ||
        duracaoIntervalo(d) >= d.saida - d.entrada;
}
export const PROPOSTA_EQUIPE = [
  { nome: "Reis", funcao: "Gerente", folgas: [6], sabado_saida: 720 },
  { nome: "Miqueias", funcao: "Técnico", folgas: [6], sabado_saida: 720 },
  { nome: "Adriano", funcao: "Auxiliar Operacional", folgas: [1, 6], sabado_saida: 780 },
  { nome: "Daniel", funcao: "Vendedor comercial", folgas: [3, 6], sabado_saida: 780 },
  { nome: "Taylor", funcao: "Auxiliar Logístico", folgas: [2, 6], sabado_saida: 720 },
  { nome: "Amaral", funcao: "Motorista entregador", folgas: [2, 6], sabado_saida: 780 },
  { nome: "Abias", funcao: "Motorista entregador", folgas: [1, 6], sabado_saida: 720 },
];
export function propostaInicial(equipe: PessoaEscala[]): PessoaEscala[] {
  return PROPOSTA_EQUIPE.map((s) => {
    const p = equipe.find(
      (x) =>
        x.nome.toLocaleLowerCase("pt-BR").includes(s.nome.toLocaleLowerCase("pt-BR")) ||
        (s.nome === "Amaral" && /weverton/i.test(x.nome)) ||
        (s.nome === "Reis" && /thiago/i.test(x.nome)),
    );
    return {
      ...(p ?? {
        colaborador_id: `pendente:${s.nome}`,
        nome: s.nome,
        funcao: s.funcao,
        meta: 2520,
        pendente: true,
      }),
      dias: DIAS.map((_, d) =>
        s.folgas.includes(d)
          ? { folga: true, entrada: null, saida: null, intervalo: 0 }
          : d === 5
            ? { folga: false, entrada: 480, saida: s.sabado_saida, intervalo: 0 }
            : {
                ...(p?.dias[d] ?? { folga: false, entrada: null, saida: null, intervalo: 0 }),
                folga: false,
              },
      ),
    };
  });
}
export function presente(d: DiaEscala, minuto: number) {
  return (
    !d.folga &&
    !inconsistencias(d) &&
    d.entrada !== null &&
    d.saida !== null &&
    minuto >= d.entrada &&
    minuto < d.saida &&
    !(
      d.intervalo_inicio != null &&
      d.intervalo_fim != null &&
      minuto >= d.intervalo_inicio &&
      minuto < d.intervalo_fim
    )
  );
}
export function cobertura(equipe: PessoaEscala[], r: RegrasEscala) {
  const falhas: { dia: number; inicio: number; fim: number; setor: string }[] = [];
  for (let dia = 0; dia < 6; dia++) {
    const setores = ["Atendimento comercial", "Daniel / Adriano", "Motoristas"];
    for (const setor of setores) {
      let inicio: number | null = null;
      const ab = dia === 5 ? r.sabado_abertura : r.abertura;
      const fe = dia === 5 ? r.sabado_fechamento : r.fechamento;
      for (let t = ab; t <= fe; t++) {
        const tem =
          t < fe &&
          equipe.some(
            (p) =>
              presente(
                p.dias[dia] ?? { folga: true, entrada: null, saida: null, intervalo: 0 },
                t,
              ) &&
              (setor === "Motoristas"
                ? /motorista/i.test(p.funcao)
                : setor === "Daniel / Adriano"
                  ? /daniel|adriano/i.test(p.nome)
                  : /venda|vendedor|atendimento|comercial/i.test(p.funcao)),
          );
        if (!tem && t < fe && inicio === null) inicio = t;
        if ((tem || t === fe) && inicio !== null) {
          falhas.push({ dia, inicio, fim: t, setor });
          inicio = null;
        }
      }
    }
  }
  return falhas;
}
export function semanaData(data: string) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function adicionarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function hojeManaus() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Manaus",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
