import { useState } from "react";
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { NAV_SECTIONS } from "@/lib/navigation";
import { useAccess, formatRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-3 px-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        ITV
      </span>
      <span className="leading-tight">
        <span className="block font-display text-sm font-bold tracking-wide text-sidebar-foreground">
          GESTÃO ITV
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted">
          Centro Técnico
        </span>
      </span>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can, isLoading } = useAccess();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
      {NAV_SECTIONS.map((section, i) => {
        const items = section.items.filter((item) => can(item.moduleKey, "visualizar"));
        if (items.length === 0 && !isLoading) return null;
        return (
          <div key={section.title ?? i}>
            {section.title && items.length > 0 && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.moduleKey}>
                  <Link
                    to={item.to}
                    onClick={onNavigate}
                    activeOptions={{ exact: item.to === "/dashboard" }}
                    activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-muted transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarUser() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, roles } = useAccess();

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const initials = (profile?.full_name || profile?.email || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-md px-2 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
          {initials}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium text-sidebar-foreground">
            {profile?.full_name || profile?.email || "Usuário"}
          </span>
          <span className="block text-xs text-sidebar-muted">
            {roles.length > 0 ? roles.map(formatRole).join(" · ") : "Sem perfil"}
          </span>
        </span>
        <button
          type="button"
          onClick={handleSignOut}
          title="Sair"
          aria-label="Sair"
          className="rounded-md p-2 text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Estrutura principal autenticada: sidebar fixa no desktop, drawer no mobile. */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-sidebar lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-sidebar-border px-4">
          <Brand />
        </div>
        <SidebarNav />
        <SidebarUser />
      </aside>

      {/* Drawer — mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-sidebar shadow-xl">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar menu"
                className="rounded-md p-2 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
            <SidebarUser />
          </aside>
        </div>
      )}

      {/* Coluna principal */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              ITV
            </span>
            <span className="font-display text-sm font-bold text-foreground">GESTÃO ITV</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block">
              Centro Técnico · Manaus
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
