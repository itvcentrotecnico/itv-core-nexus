import { mensagemErro } from "@/lib/erros";
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess, type AppRole, type PermissionAction } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { inputClass, labelClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/permissoes")({
  head: () => ({
    meta: [
      { title: "Permissões — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content: "Concessão individual de acesso por usuário, módulo e ação.",
      },
      { property: "og:title", content: "Permissões — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Concessão individual de acesso por usuário, módulo e ação.",
      },
    ],
  }),
  component: PermissoesPage,
});

const ACTIONS: { value: PermissionAction; label: string }[] = [
  { value: "visualizar", label: "Visualizar" },
  { value: "criar", label: "Criar" },
  { value: "editar", label: "Editar" },
  { value: "aprovar", label: "Aprovar" },
  { value: "pagar", label: "Pagar" },
  { value: "receber", label: "Receber" },
  { value: "cancelar", label: "Cancelar" },
  { value: "estornar", label: "Estornar" },
  { value: "fechar", label: "Fechar" },
  { value: "reabrir", label: "Reabrir" },
  { value: "desativar", label: "Desativar" },
  { value: "exportar", label: "Exportar" },
  { value: "configurar", label: "Configurar" },
  { value: "administrar", label: "Administrar" },
];

interface UsuarioBasico {
  id: string;
  full_name: string;
  email: string | null;
  roles: string[];
}

interface PermissaoRow {
  user_id: string;
  module_key: string;
  action: PermissionAction;
  allowed: boolean;
}

function PermissoesPage() {
  const { isAdmin } = useAccess();
  const queryClient = useQueryClient();
  const [usuarioId, setUsuarioId] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const usuariosQuery = useQuery({
    queryKey: ["admin", "usuarios-basicos"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      return (data ?? []) as unknown as UsuarioBasico[];
    },
  });

  const modulosQuery = useQuery({
    queryKey: ["admin", "modules"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modules")
        .select("key, label")
        .order("sort_order");
      if (error) throw error;
      return data as { key: string; label: string }[];
    },
  });

  const permissoesQuery = useQuery({
    queryKey: ["admin", "user-permissions", usuarioId],
    enabled: isAdmin && !!usuarioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permissions")
        .select("user_id, module_key, action, allowed")
        .eq("user_id", usuarioId);
      if (error) throw error;
      return (data ?? []) as PermissaoRow[];
    },
  });

  const rolePermsQuery = useQuery({
    queryKey: ["admin", "role-permissions"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, module_key, action");
      if (error) throw error;
      return (data ?? []) as { role: AppRole; module_key: string; action: PermissionAction }[];
    },
  });

  const usuarios = usuariosQuery.data ?? [];
  const modulos = modulosQuery.data ?? [];
  const usuario = usuarios.find((u) => u.id === usuarioId) ?? null;

  const permMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissoesQuery.data ?? []) map.set(`${p.module_key}:${p.action}`, p.allowed);
    return map;
  }, [permissoesQuery.data]);

  const roleMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!usuario) return map;
    for (const p of rolePermsQuery.data ?? []) {
      if ((usuario.roles as string[]).includes(p.role))
        map.set(`${p.module_key}:${p.action}`, true);
    }
    return map;
  }, [rolePermsQuery.data, usuario]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <ShieldCheck className="size-10 text-muted-foreground/40" />
        <h1 className="font-display text-xl font-bold text-foreground">Acesso restrito</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Somente administradores podem gerenciar permissões.
        </p>
      </div>
    );
  }

  async function setPermissao(moduleKey: string, action: PermissionAction, allowed: boolean) {
    if (!usuarioId) return;
    const key = `${moduleKey}:${action}`;
    setSavingKey(key);
    try {
      // Via RPC administrativa: valida permissão no servidor e grava auditoria.
      const { data, error } = await supabase.rpc(
        "admin_usuario_permissao" as never,
        {
          p_user_id: usuarioId,
          p_module: moduleKey,
          p_action: action,
          p_allowed: allowed,
        } as never,
      );
      if (error) throw error;
      const res = data as unknown as { ok: boolean; code?: string };
      if (!res?.ok)
        throw new Error(
          res?.code === "SEM_PERMISSAO"
            ? "Você não tem permissão para esta ação."
            : "Falha ao salvar permissão.",
        );

      toast.success(`Permissão ${allowed ? "concedida" : "revogada"}: ${moduleKey}.${action}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "user-permissions", usuarioId] });
      await queryClient.invalidateQueries({ queryKey: ["user-access"] });
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao salvar permissão."));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Permissões por Usuário</h1>
        <p className="text-sm text-muted-foreground">
          Concessão individual de acesso. Exceções individuais prevalecem sobre o perfil. Módulos
          como Financeiro e Folha Gerencial só ficam acessíveis quando liberados aqui.
        </p>
      </header>

      <div className="max-w-md">
        <label htmlFor="pm-usuario" className={labelClass}>
          Usuário
        </label>
        <select
          id="pm-usuario"
          value={usuarioId}
          onChange={(e) => setUsuarioId(e.target.value)}
          className={inputClass}
        >
          <option value="">Selecione o usuário…</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name} {u.email ? `(${u.email})` : ""}
            </option>
          ))}
        </select>
      </div>

      {usuario && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Perfis de <strong className="text-foreground">{usuario.full_name}</strong>:
            </p>
            {usuario.roles.length === 0 && <Badge variant="outline">Sem perfil</Badge>}
            {usuario.roles.map((r) => (
              <Badge
                key={r}
                variant="outline"
                className="border-primary/30 bg-primary/5 text-primary"
              >
                {r}
              </Badge>
            ))}
          </div>

          <div className="space-y-3">
            {modulos.map((m) => {
              const herdadas = ACTIONS.filter((a) => roleMap.get(`${m.key}:${a.value}`));
              return (
                <section key={m.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-sm font-bold text-foreground">{m.label}</h2>
                    <span className="text-[11px] text-muted-foreground">{m.key}</span>
                    {herdadas.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        · herdado do perfil: {herdadas.map((a) => a.label).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ACTIONS.map((a) => {
                      const key = `${m.key}:${a.value}`;
                      const override = permMap.get(key);
                      const herdado = roleMap.get(key) === true;
                      const efetivo = override ?? herdado;
                      return (
                        <button
                          key={a.value}
                          type="button"
                          disabled={savingKey === key}
                          onClick={() => setPermissao(m.key, a.value, !efetivo)}
                          title={
                            override !== undefined
                              ? `Exceção individual: ${override ? "permitido" : "bloqueado"}`
                              : herdado
                                ? "Herdado do perfil"
                                : "Sem acesso"
                          }
                          className={cn(
                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                            efetivo
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border bg-background text-muted-foreground hover:border-primary/30",
                            override !== undefined && "ring-1 ring-offset-1 ring-primary/40",
                            savingKey === key && "opacity-50",
                          )}
                        >
                          {a.label}
                          {override !== undefined && " *"}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            * indica exceção individual registrada para este usuário. A segurança real é aplicada no
            banco (RLS e funções); esta tela controla a liberação de acesso.
          </p>
        </div>
      )}
    </div>
  );
}
