import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, Lock, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess, formatRole, type AppRole, type PermissionAction } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { Button } from "@/components/ui/button";
import { Carregando, SecaoAdmin, executarAcao, rpcAdmin } from "@/components/admin/shared";
import { cn } from "@/lib/utils";

const PERFIS_EDITAVEIS: AppRole[] = ["adm_financeiro", "adm_operacional", "vendedor", "tecnico", "tv_display", "motorista"];

const ACOES: { value: PermissionAction; label: string }[] = [
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
  { value: "validar", label: "Validar" },
  { value: "exportar", label: "Exportar" },
  { value: "configurar", label: "Configurar" },
  { value: "administrar", label: "Administrar" },
];

export function AdminPerfis() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeAdministrar = isAdmin || can("admin", "administrar");
  const [perfil, setPerfil] = useState<AppRole>("adm_financeiro");
  const [salvando, setSalvando] = useState<string | null>(null);

  const modulosQuery = useQuery({
    queryKey: ["admin", "modules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("modules").select("key, label").order("sort_order");
      if (error) throw error;
      return data as { key: string; label: string }[];
    },
  });

  const permsQuery = useQuery({
    queryKey: ["admin", "role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("role, module_key, action");
      if (error) throw error;
      return (data ?? []) as { role: AppRole; module_key: string; action: PermissionAction }[];
    },
  });

  const mapa = useMemo(() => {
    const m = new Set<string>();
    for (const p of permsQuery.data ?? []) if (p.role === perfil) m.add(`${p.module_key}:${p.action}`);
    return m;
  }, [permsQuery.data, perfil]);

  async function alternar(moduleKey: string, action: PermissionAction, atual: boolean) {
    const chave = `${moduleKey}:${action}`;
    setSalvando(chave);
    await executarAcao(
      () =>
        rpcAdmin("admin_role_permissao", {
          p_role: perfil,
          p_module: moduleKey,
          p_action: action,
          p_allowed: !atual,
        }),
      "Permissão do perfil atualizada.",
      () => {
        void queryClient.invalidateQueries({ queryKey: ["admin", "role-permissions"] });
        void queryClient.invalidateQueries({ queryKey: ["user-access"] });
      },
    );
    setSalvando(null);
  }

  const modulos = modulosQuery.data ?? [];

  return (
    <SecaoAdmin
      titulo="Perfis e Permissões"
      descricao="O perfil define o acesso padrão. Ajustes individuais são exceções aplicadas por cima do perfil."
      acoes={
        <Link to="/admin/permissoes">
          <Button size="sm" variant="outline">
            <ShieldCheck className="mr-2 size-4" /> Exceções por usuário
          </Button>
        </Link>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-64">
          <label className={labelClass} htmlFor="perfil-sel">
            Perfil
          </label>
          <select
            id="perfil-sel"
            className={inputClass}
            value={perfil}
            onChange={(e) => setPerfil(e.target.value as AppRole)}
          >
            {PERFIS_EDITAVEIS.map((p) => (
              <option key={p} value={p}>
                {formatRole(p)}
              </option>
            ))}
          </select>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="size-3.5" /> O perfil Administrador possui acesso total e não é editável.
        </p>
      </div>

      {modulosQuery.isLoading || permsQuery.isLoading ? (
        <Carregando />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="sticky left-0 bg-card px-3 py-2 text-left font-medium">Módulo</th>
                {ACOES.map((a) => (
                  <th key={a.value} className="px-2 py-2 text-center font-medium">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {modulos.map((m) => (
                <tr key={m.key}>
                  <td className="sticky left-0 bg-card px-3 py-2 font-medium text-foreground">{m.label}</td>
                  {ACOES.map((a) => {
                    const chave = `${m.key}:${a.value}`;
                    const ativo = mapa.has(chave);
                    return (
                      <td key={a.value} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          disabled={!podeAdministrar || salvando === chave}
                          onClick={() => void alternar(m.key, a.value, ativo)}
                          aria-label={`${a.label} em ${m.label}`}
                          className={cn(
                            "inline-flex size-6 items-center justify-center rounded border transition",
                            ativo
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-transparent hover:border-primary/50",
                            !podeAdministrar && "cursor-not-allowed opacity-50",
                          )}
                        >
                          <Check className="size-3.5" />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SecaoAdmin>
  );
}
