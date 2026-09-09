import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";

import { NAV_SECTIONS, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Ordem de atalhos por tipo de perfil (o primeiro perfil encontrado vence). */
const PRIORIDADE: Record<string, string[]> = {
  tecnico: ["dashboard", "producao", "metas", "relatorios"],
  vendedor: ["dashboard", "caixa", "coletas", "relatorios"],
  motorista: ["coletas", "dashboard"],
  adm_financeiro: ["dashboard", "caixa", "financeiro", "relatorios"],
  adm_operacional: ["operacional", "dashboard", "caixa", "relatorios"],
};

const PADRAO = ["dashboard", "operacional", "caixa", "relatorios"];

const TODOS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export function BottomNav({
  roles,
  podeVer,
  onOpenMenu,
}: {
  roles: string[];
  podeVer: (moduleKey: string) => boolean;
  onOpenMenu: () => void;
}) {
  const ordem = roles.map((r) => PRIORIDADE[r]).find(Boolean) ?? PADRAO;

  const itens = ordem
    .map((key) => TODOS.find((i) => i.moduleKey === key))
    .filter((i): i is NavItem => Boolean(i) && podeVer(i!.moduleKey))
    .slice(0, 4);

  if (itens.length === 0) return null;

  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {itens.map((item) => (
        <Link
          key={item.moduleKey}
          to={item.to}
          activeOptions={{ exact: item.to === "/dashboard" }}
          activeProps={{ className: "text-primary" }}
          className={cn(
            "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium text-muted-foreground",
          )}
        >
          <item.icon className="h-5 w-5" aria-hidden="true" />
          <span className="max-w-full truncate">{item.label}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onOpenMenu}
        className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium text-muted-foreground"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
        <span>Menu</span>
      </button>
    </nav>
  );
}
