import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Cargo, Colaborador, FolhaTipoLancamento, Setor } from "@/lib/folha";

export interface FolhaRefs {
  setores: Setor[];
  cargos: Cargo[];
  tipos: FolhaTipoLancamento[];
  colaboradores: Colaborador[];
}

/** Cadastros de apoio do módulo Colaboradores/Folha. */
export function useFolhaRefs(enabled: boolean) {
  return useQuery({
    queryKey: ["folha", "refs"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<FolhaRefs> => {
      const [setores, cargos, tipos, colaboradores] = await Promise.all([
        supabase.from("setores").select("*").order("ordem"),
        supabase.from("cargos").select("*").order("ordem"),
        supabase.from("folha_tipos_lancamento").select("*").order("ordem"),
        supabase.from("colaboradores_view").select("*").order("nome"),
      ]);
      for (const r of [setores, cargos, tipos, colaboradores]) if (r.error) throw r.error;
      return {
        setores: (setores.data ?? []) as unknown as Setor[],
        cargos: (cargos.data ?? []) as unknown as Cargo[],
        tipos: (tipos.data ?? []) as unknown as FolhaTipoLancamento[],
        colaboradores: (colaboradores.data ?? []) as unknown as Colaborador[],
      };
    },
  });
}
