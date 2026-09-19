import {
  BarChart3,
  Boxes,
  ClipboardList,
  LayoutDashboard,
  Package,
  Radar,
  Settings,
  Target,
  Tv,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  /** Chave do módulo — deve corresponder a public.modules.key */
  moduleKey: string;
  label: string;
  to: string;
  icon: LucideIcon;
  /** Quando informado, o item só aparece para estes perfis. */
  roles?: string[];
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/**
 * Menu principal enxuto: cada perfil enxerga o seu centro de trabalho.
 * Produção, Técnicos, Central Operacional, Terceirizados e Comissões Técnicas
 * passaram a viver dentro da Gerência Operacional.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { moduleKey: "dashboard", label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      {
        moduleKey: "operacional",
        label: "Gerência Operacional",
        to: "/gerencia-operacional",
        icon: Radar,
      },
      { moduleKey: "caixa", label: "Caixa Diário", to: "/caixa", icon: Wallet },
      {
        moduleKey: "producao",
        label: "Minha Produção",
        to: "/producao",
        icon: ClipboardList,
        roles: ["tecnico"],
      },
      { moduleKey: "estoque", label: "Estoque Técnico", to: "/estoque", icon: Boxes },
      { moduleKey: "pecas", label: "Peças e Custos", to: "/pecas", icon: Package },
      { moduleKey: "financeiro", label: "Financeiro", to: "/financeiro", icon: BarChart3 },
      { moduleKey: "colaboradores", label: "Colaboradores", to: "/colaboradores", icon: Users },
      { moduleKey: "metas", label: "Metas", to: "/metas", icon: Target },
      { moduleKey: "modo_tv", label: "Modo TV", to: "/admin/modo-tv", icon: Tv },
      { moduleKey: "relatorios", label: "Relatórios", to: "/relatorios", icon: BarChart3 },
    ],
  },
  {
    title: "Administração",
    items: [{ moduleKey: "admin", label: "Administração", to: "/admin", icon: Settings }],
  },
];

/**
 * Mapa rota → módulo. Usado para bloquear acesso por URL direta.
 * Reforço de interface: a segurança real continua sendo RLS + RPCs no banco.
 * As rotas mais específicas vêm primeiro.
 */
export const ROUTE_MODULES: { prefix: string; moduleKey: string }[] = [
  { prefix: "/gerencia-operacional/coletas", moduleKey: "coletas" },
  { prefix: "/gerencia-operacional/equipe-externa", moduleKey: "coletas" },
  { prefix: "/gerencia-operacional/comissoes", moduleKey: "comissoes" },
  { prefix: "/gerencia-operacional/producao", moduleKey: "producao" },
  { prefix: "/gerencia-operacional/validacao-tecnica", moduleKey: "producao" },
  { prefix: "/gerencia-operacional/tecnicos", moduleKey: "tecnicos" },
  { prefix: "/gerencia-operacional", moduleKey: "operacional" },
  { prefix: "/admin", moduleKey: "admin" },
  { prefix: "/operacional", moduleKey: "operacional" },
  { prefix: "/central-operacional", moduleKey: "operacional" },
  { prefix: "/caixa", moduleKey: "caixa" },
  { prefix: "/estoque", moduleKey: "estoque" },
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
  const rota = ROUTE_MODULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return rota?.moduleKey ?? null;
}
