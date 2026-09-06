import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { STATUS_PRODUCAO, type ProducaoStatus, type TipoServico } from "@/lib/producao";
import { cn } from "@/lib/utils";
import { mensagemErro } from "@/lib/erros";

/** RPC tipada do módulo produção: lança erro do PostgREST. */
export async function rpcProd<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  return data as T;
}

export function StatusBadgeProducao({ status }: { status: ProducaoStatus }) {
  const s = STATUS_PRODUCAO[status];
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", s.className)}>
      {s.label}
    </span>
  );
}

export function invalidateProducao(queryClient: { invalidateQueries: (opts: { queryKey: unknown[] }) => unknown }) {
  void queryClient.invalidateQueries({ queryKey: ["producao"] });
}

interface UsuarioBasico {
  id: string;
  full_name: string;
  roles: string[];
}

/** Referências do módulo: tipos de serviço e técnicos (para gerência). */
export function useProducaoRefs() {
  const { isAdmin, can } = useAccess();
  const ehGerencia = isAdmin || can("producao", "validar") || can("producao", "visualizar_todos");

  const tiposQuery = useQuery({
    queryKey: ["producao", "tipos-servico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipos_servico_tecnico")
        .select("id, nome, ativo, ordem")
        .order("ordem");
      if (error) throw error;
      return data as TipoServico[];
    },
  });

  const tecnicosQuery = useQuery({
    queryKey: ["producao", "tecnicos"],
    enabled: ehGerencia,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      const todos = (data ?? []) as unknown as UsuarioBasico[];
      return todos.filter((u) => u.roles.includes("tecnico") || u.roles.includes("adm_operacional") || u.roles.includes("adm_financeiro"));
    },
  });

  return {
    ehGerencia,
    tipos: tiposQuery.data ?? [],
    tecnicos: tecnicosQuery.data ?? [],
  };
}
