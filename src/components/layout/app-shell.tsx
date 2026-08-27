import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu, ShieldAlert, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { NAV_SECTIONS, moduloDaRota } from "@/lib/navigation";
import { useAccess, formatRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import logoColor from "@/assets/itv-logo-color.png.asset.json";
import logoMark from "@/assets/itv-logo-mark.png.asset.json";


function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center px-2" aria-label="GESTÃO ITV — Dashboard">
      <img src={logoColor.url} alt="ITV Centro Técnico" className="h-10 w-auto" />
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can, isLoading } = useAccess();

  // Menu dinâmico: um item aparece quando o perfil (ou uma exceção individual)
  // permite alguma forma de visualização daquele módulo.
  const podeVer = (moduleKey: string) =>
    can(moduleKey, "visualizar") ||
    can(moduleKey, "visualizar_propria") ||
    can(moduleKey, "visualizar_todos") ||
    can(moduleKey, "administrar");

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Navegação principal">
      {NAV_SECTIONS.map((section, i) => {
        const items = section.items.filter((item) => podeVer(item.moduleKey));
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

/** Tela de bloqueio para conta inativa/bloqueada (a sessão antiga não vale). */
function ContaBloqueada() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <img src={logoColor.url} alt="ITV Centro Técnico" className="mx-auto mb-6 h-10 w-auto" />
        <h1 className="font-display text-lg font-bold text-foreground">Acesso suspenso</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário está inativo ou bloqueado. Procure o administrador do sistema para
          reativar o acesso.
        </p>
        <button
          type="button"
          onClick={sair}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

/** Usuário autenticado mas sem perfil/role configurado pelo ADM. */
function SemPerfilConfigurado() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function sair() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <img src={logoColor.url} alt="ITV Centro Técnico" className="mx-auto mb-6 h-10 w-auto" />
        <h1 className="font-display text-lg font-bold text-foreground">Acesso não configurado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário ainda não possui perfil de acesso configurado. Procure o administrador.
        </p>
        <button
          type="button"
          onClick={sair}
          className="mt-6 w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

/** Bloqueio por URL direta: módulo sem permissão de visualização. */
function ModuloBloqueado() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <ShieldAlert className="size-10 text-muted-foreground/40" aria-hidden="true" />
      <h1 className="font-display text-xl font-bold text-foreground">Acesso restrito</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Você não tem permissão para acessar este módulo. Solicite a liberação ao administrador.
      </p>
      <Link
        to="/dashboard"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        Voltar ao Dashboard
      </Link>
    </div>
  );
}

/** Estrutura principal autenticada: sidebar fixa no desktop, drawer no mobile. */
export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { bloqueado, roles, isLoading, isAdmin, can } = useAccess();
  const somenteTv = roles.length > 0 && roles.every((r) => r === "tv_display");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (somenteTv) navigate({ to: "/modo-tv", replace: true });
  }, [somenteTv, navigate]);

  if (bloqueado) return <ContaBloqueada />;
  if (somenteTv && !isLoading) return null;
  if (!isLoading && roles.length === 0) return <SemPerfilConfigurado />;

  const moduloAtual = moduloDaRota(pathname);
  const podeVerModulo =
    isLoading ||
    !moduloAtual ||
    isAdmin ||
    can(moduloAtual, "visualizar") ||
    can(moduloAtual, "visualizar_propria") ||
    can(moduloAtual, "administrar");




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
            <img src={logoMark.url} alt="ITV Centro Técnico" className="h-6 w-auto" />
            <span className="font-display text-sm font-bold text-foreground">GESTÃO ITV</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:block">
              Centro Técnico · Manaus
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-6">
          {podeVerModulo ? <Outlet /> : <ModuloBloqueado />}
        </main>
      </div>

      <BottomNav
        roles={roles}
        podeVer={podeVerModulo2}
        onOpenMenu={() => setMobileOpen(true)}
      />
    </div>
  );
}
