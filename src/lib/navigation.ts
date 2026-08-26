import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Package,
  Percent,
  ScrollText,
  Settings,
  ShieldCheck,
  Target,
  Truck,
  UserCog,
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
      { moduleKey: "financeiro", label: "Financeiro", to: "/financeiro", icon: BarChart3 },
      { moduleKey: "producao", label: "Produção", to: "/producao", icon: ClipboardList },
      { moduleKey: "tecnicos", label: "Técnicos", to: "/tecnicos", icon: Wrench },
      { moduleKey: "colaboradores", label: "Colaboradores", to: "/colaboradores", icon: Users },
      { moduleKey: "metas", label: "Metas", to: "/metas", icon: Target },
      { moduleKey: "entregas", label: "Entregas", to: "/entregas", icon: Truck },
      { moduleKey: "logistica", label: "Logística", to: "/logistica", icon: Truck },
      { moduleKey: "relatorios", label: "Relatórios", to: "/relatorios", icon: BarChart3 },
      { moduleKey: "configuracoes", label: "Configurações", to: "/configuracoes", icon: Settings },
    ],
  },
  {
    title: "Administração",
    items: [
      { moduleKey: "admin-usuarios", label: "Usuários", to: "/admin/usuarios", icon: UserCog },
      { moduleKey: "admin-permissoes", label: "Permissões", to: "/admin/permissoes", icon: ShieldCheck },
      { moduleKey: "admin-auditoria", label: "Auditoria", to: "/admin/auditoria", icon: ScrollText },
    ],
  },
];
