/**
 * Presets de período do Caixa Diário (America/Manaus).
 * Alteram apenas a listagem e o resumo filtrado — nunca os cards fixos.
 */
import { cn } from "@/lib/utils";
import { todayManausISO } from "@/lib/format";

export interface Periodo {
  inicio: string;
  fim: string;
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Semana operacional: segunda a domingo. */
function inicioSemana(d: Date): Date {
  const dow = (d.getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

function inicioMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function fimMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

export type PresetKey = "hoje" | "semana" | "mes" | "mes_anterior" | "3m" | "6m" | "personalizado";

export function periodoDoPreset(key: PresetKey, refISO = todayManausISO()): Periodo | null {
  const hoje = parse(refISO);
  switch (key) {
    case "hoje":
      return { inicio: refISO, fim: refISO };
    case "semana": {
      const ini = inicioSemana(hoje);
      return { inicio: iso(ini), fim: iso(addDays(ini, 6)) };
    }
    case "mes":
      return { inicio: iso(inicioMes(hoje)), fim: iso(fimMes(hoje)) };
    case "mes_anterior": {
      const ant = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - 1, 1));
      return { inicio: iso(ant), fim: iso(fimMes(ant)) };
    }
    case "3m":
    case "6m": {
      const n = key === "3m" ? 2 : 5;
      const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - n, 1));
      return { inicio: iso(ini), fim: iso(fimMes(hoje)) };
    }
    default:
      return null;
  }
}

const OPCOES: { key: PresetKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "semana", label: "Esta semana" },
  { key: "mes", label: "Este mês" },
  { key: "mes_anterior", label: "Mês anterior" },
  { key: "3m", label: "Últimos 3 meses" },
  { key: "6m", label: "Últimos 6 meses" },
];

export function PeriodoPresets({
  periodo,
  onChange,
}: {
  periodo: Periodo;
  onChange: (p: Periodo) => void;
}) {
  const ativo = OPCOES.find((o) => {
    const p = periodoDoPreset(o.key);
    return p && p.inicio === periodo.inicio && p.fim === periodo.fim;
  })?.key;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label="Período da listagem"
    >
      {OPCOES.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={ativo === o.key}
          onClick={() => {
            const p = periodoDoPreset(o.key);
            if (p) onChange(p);
          }}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            ativo === o.key
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
      <span className="text-[11px] text-muted-foreground">
        {ativo ? "" : "Período personalizado"}
      </span>
    </div>
  );
}
