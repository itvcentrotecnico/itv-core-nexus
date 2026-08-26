/**
 * Formatação oficial do GESTÃO ITV CENTRO TÉCNICO.
 * Timezone da operação: America/Manaus. Moeda: BRL.
 */

export const ITV_TIMEZONE = "America/Manaus";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrencyBRL(value: number): string {
  return currencyFormatter.format(value);
}

export function formatDateITV(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: ITV_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatDateTimeITV(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: ITV_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Data de hoje no timezone da operação (America/Manaus), formato YYYY-MM-DD. */
export function todayManausISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ITV_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Formata colunas DATE (YYYY-MM-DD) sem deslocamento de timezone. */
export function formatDateOnlyISO(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
