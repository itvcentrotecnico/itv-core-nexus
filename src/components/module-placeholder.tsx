import { Hammer } from "lucide-react";

interface ModulePlaceholderProps {
  title: string;
  description: string;
}

/** Página padronizada para módulos ainda não implementados. */
export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent">
          <Hammer className="h-5 w-5 text-accent-foreground" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-card-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <span className="mt-6 inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          Módulo em desenvolvimento
        </span>
      </div>
    </div>
  );
}
