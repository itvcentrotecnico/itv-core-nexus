import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface MoneyInputProps {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}

/**
 * Campo de valor monetário BRL com máscara de centavos:
 * o usuário digita apenas números (1234 → 12,34).
 */
export function MoneyInput({
  id,
  value,
  onChange,
  disabled,
  className,
  placeholder,
  autoFocus,
  "aria-label": ariaLabel,
}: MoneyInputProps) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder ?? "0,00"}
      value={value == null ? "" : nf.format(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        if (!digits) {
          onChange(null);
          return;
        }
        onChange(Number(digits) / 100);
      }}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:opacity-60",
        className,
      )}
    />
  );
}
