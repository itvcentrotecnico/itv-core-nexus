export interface DiaEscala {
  folga: boolean;
  entrada: number | null;
  saida: number | null;
  intervalo: number;
}
export interface PessoaEscala {
  colaborador_id: string;
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
  return Math.max(0, d.saida - d.entrada - d.intervalo);
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
        d.intervalo >= d.saida - d.entrada;
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
