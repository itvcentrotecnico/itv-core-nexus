import { cn } from "@/lib/utils";

/** Cartão de indicador do Caixa Diário. */
export function KpiCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight ? "border-primary/30 bg-primary/5" : "border-border bg-card",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-lg font-bold text-foreground sm:text-xl">{value}</p>
      {sub && <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{sub}</p>}
    </div>
  );
}
