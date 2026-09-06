import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { labelStatus, STATUS_COLETA, type ColetaStatus, type ColetaTipo } from "@/lib/coletas";

export function StatusBadgeColeta({
  status,
  tipo = "coleta",
}: {
  status: ColetaStatus;
  tipo?: ColetaTipo;
}) {
  const s = STATUS_COLETA[status];
  return (
    <span
      className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", s.className)}
    >
      {labelStatus(tipo, status)}
    </span>
  );
}

interface UsuarioBasico {
  id: string;
  full_name: string;
  roles: string[];
}

/** Motoristas disponíveis para atribuição manual (perfil Motorista / Coleta ou ADM Operacional). */
export function useMotoristas(enabled = true) {
  return useQuery({
    queryKey: ["coletas", "motoristas"],
    enabled,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      const todos = (data ?? []) as unknown as UsuarioBasico[];
      return todos.filter(
        (u) => u.roles.includes("motorista") || u.roles.includes("adm_operacional"),
      );
    },
  });
}

/** Mapa id → nome, para exibir motorista e atendimento sem consultas extras. */
export function useUsuariosMap(enabled = true) {
  const query = useQuery({
    queryKey: ["coletas", "usuarios-map"],
    enabled,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const u of (data ?? []) as unknown as UsuarioBasico[]) map[u.id] = u.full_name;
      return map;
    },
  });
  return query.data ?? {};
}
