import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Package,
  Bike,
  Percent,
  Settings,
  ShieldCheck,
  Target,
  Truck,
  Tv,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** Chave do módulo — deve corresponder a public.modules.key */
  moduleKey: string;
  label: string;
  to: string;
  icon: LucideIcon;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { moduleKey: "dashboard", label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { moduleKey: "caixa", label: "Caixa Diário", to: "/caixa", icon: Wallet },
      { moduleKey: "pecas", label: "Peças e Custos", to: "/pecas", icon: Package },
      { moduleKey: "comissoes", label: "Comissões", to: "/comissoes", icon: Percent },
      { moduleKey: "comissao_entrega", label: "Comissão de Entrega", to: "/comissao-entrega", icon: Bike },
      { moduleKey: "financeiro", label: "Financeiro", to: "/financeiro", icon: BarChart3 },
      { moduleKey: "coletas", label: "Coletas e Entregas", to: "/coletas", icon: Truck },
      { moduleKey: "producao", label: "Produção", to: "/producao", icon: ClipboardList },
      { moduleKey: "tecnicos", label: "Técnicos", to: "/tecnicos", icon: Wrench },
      { moduleKey: "colaboradores", label: "Colaboradores", to: "/colaboradores", icon: Users },
      { moduleKey: "metas", label: "Metas", to: "/metas", icon: Target },
      { moduleKey: "modo_tv", label: "Modo TV", to: "/admin/modo-tv", icon: Tv },
      { moduleKey: "relatorios", label: "Relatórios", to: "/relatorios", icon: BarChart3 },
    ],
  },
  {
    title: "Administração",
    items: [
      { moduleKey: "admin", label: "Administração", to: "/admin", icon: Settings },
    ],
  },
];


/**
 * Mapa rota → módulo. Usado para bloquear acesso por URL direta.
 * Reforço de interface: a segurança real continua sendo RLS + RPCs no banco.
 */
export const ROUTE_MODULES: { prefix: string; moduleKey: string }[] = [
  { prefix: "/admin", moduleKey: "admin" },
  { prefix: "/caixa", moduleKey: "caixa" },
  { prefix: "/pecas", moduleKey: "pecas" },
  { prefix: "/comissao-entrega", moduleKey: "comissao_entrega" },
  { prefix: "/comissoes", moduleKey: "comissoes" },
  { prefix: "/coletas", moduleKey: "coletas" },
  { prefix: "/financeiro", moduleKey: "financeiro" },
  { prefix: "/producao", moduleKey: "producao" },
  { prefix: "/tecnicos", moduleKey: "tecnicos" },
  { prefix: "/colaboradores", moduleKey: "colaboradores" },
  { prefix: "/metas", moduleKey: "metas" },
  { prefix: "/relatorios", moduleKey: "relatorios" },
  { prefix: "/dashboard", moduleKey: "dashboard" },
];

export function moduloDaRota(pathname: string): string | null {
  const rota = ROUTE_MODULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  return rota?.moduleKey ?? null;
}
