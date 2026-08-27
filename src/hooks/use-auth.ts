import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export type AppRole = "administrador" | "adm_financeiro" | "adm_operacional" | "vendedor" | "tecnico" | "tv_display" | "motorista";
export type PermissionAction =
  | "visualizar"
  | "criar"
  | "editar"
  | "aprovar"
  | "pagar"
  | "receber"
  | "cancelar"
  | "exportar"
  | "administrar"
  | "estornar"
  | "fechar"
  | "reabrir"
  | "desativar"
  | "configurar"
  | "visualizar_propria"
  | "editar_propria"
  | "enviar_validacao"
  | "validar"
  | "rejeitar"
  | "visualizar_todos"
  | "relatorios"
  | "configurar_metas"
  | "encerrar"
  | "visualizar_ranking"
  | "configurar_indicadores"
  | "atribuir"
  | "assumir"
  | "concluir"
  | "ver_dados_sensiveis"
  | "excluir"
  | "excluir_concluida"
  | "restaurar"
  | "localizacao_ativar"
  | "localizacao_visualizar"
  | "localizacao_historico";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  active: boolean;
  status: "ativo" | "inativo" | "bloqueado";
}

/** Sessão do usuário com recuperação segura via Supabase Auth. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, isAuthenticated: !!user };
}

interface AccessData {
  profile: UserProfile | null;
  roles: AppRole[];
  rolePermissions: { role: AppRole; module_key: string; action: PermissionAction }[];
  userPermissions: { module_key: string; action: PermissionAction; allowed: boolean }[];
}

/**
 * Perfil, papéis e permissões do usuário logado.
 * A fonte oficial é o banco: o menu usa estes dados apenas para exibição;
 * a segurança real é garantida por RLS.
 */
export function useAccess() {
  const { user } = useSession();

  const query = useQuery({
    queryKey: ["user-access", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<AccessData> => {
      const [profileRes, rolesRes, rolePermsRes, userPermsRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, avatar_url, active, status").eq("id", user!.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user!.id),
        supabase.from("role_permissions").select("role, module_key, action"),
        supabase.from("user_permissions").select("module_key, action, allowed").eq("user_id", user!.id),
      ]);

      if (profileRes.error) throw profileRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (rolePermsRes.error) throw rolePermsRes.error;
      if (userPermsRes.error) throw userPermsRes.error;

      return {
        profile: (profileRes.data as UserProfile | null) ?? null,
        roles: (rolesRes.data ?? []).map((r) => r.role as AppRole),
        rolePermissions: (rolePermsRes.data ?? []) as AccessData["rolePermissions"],
        userPermissions: (userPermsRes.data ?? []) as AccessData["userPermissions"],
      };
    },
  });

  const access = useMemo(() => {
    const data = query.data;
    const roles = data?.roles ?? [];
    const isAdmin = roles.includes("administrador");

    const can = (moduleKey: string, action: PermissionAction = "visualizar"): boolean => {
      if (!data) return false;
      if (data.profile && (!data.profile.active || data.profile.status !== "ativo")) return false;
      if (isAdmin) return true;

      // Exceção individual prevalece sobre o perfil
      const override = data.userPermissions.find(
        (p) => p.module_key === moduleKey && p.action === action,
      );
      if (override) return override.allowed;

      return data.rolePermissions.some(
        (p) => p.module_key === moduleKey && p.action === action && roles.includes(p.role),
      );
    };

    return { data, roles, isAdmin, can };
  }, [query.data]);

  const profile = access.data?.profile ?? null;
  // Segurança: perfil inativo/bloqueado perde acesso mesmo com sessão antiga.
  const bloqueado = !!profile && (!profile.active || profile.status !== "ativo");

  return {
    ...query,
    bloqueado,
    profile,
    roles: access.roles,
    isAdmin: access.isAdmin,
    can: access.can,
  };
}

const ROLE_LABELS: Record<AppRole, string> = {
  administrador: "ADM Geral",
  adm_financeiro: "ADM Financeiro",
  adm_operacional: "ADM Operacional",
  vendedor: "Vendedor",
  tecnico: "Técnico",
  tv_display: "TV Display",
  motorista: "Motorista / Coleta",
};

export function formatRole(role: AppRole): string {
  return ROLE_LABELS[role] ?? role;
}
