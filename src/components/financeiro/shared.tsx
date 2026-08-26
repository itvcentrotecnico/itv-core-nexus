import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { FormaPagamento } from "@/lib/caixa";
import type {
  CategoriaFinanceira,
  CentroCusto,
  FinanceiroRpcResult,
  SubcategoriaFinanceira,
} from "@/lib/financeiro";

export interface FinanceiroRefs {
  categorias: CategoriaFinanceira[];
  subcategorias: SubcategoriaFinanceira[];
  centros: CentroCusto[];
  fornecedores: { id: string; nome: string }[];
  formas: FormaPagamento[];
}

/** Cadastros de apoio do Financeiro (categorias, centros de custo, fornecedores, formas). */
export function useFinanceiroRefs(enabled: boolean) {
  return useQuery({
    queryKey: ["financeiro", "refs"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<FinanceiroRefs> => {
      const [cats, subs, centros, forns, formas] = await Promise.all([
        supabase.from("categorias_financeiras").select("*").order("ordem"),
        supabase.from("subcategorias_financeiras").select("*").order("ordem"),
        supabase.from("centros_custo").select("*").order("ordem"),
        supabase.from("fornecedores").select("id, nome").eq("ativo", true).order("nome"),
        supabase.from("formas_pagamento").select("*").eq("ativo", true).order("ordem"),
      ]);
      for (const r of [cats, subs, centros, forns, formas]) if (r.error) throw r.error;
      return {
        categorias: (cats.data ?? []) as CategoriaFinanceira[],
        subcategorias: (subs.data ?? []) as SubcategoriaFinanceira[],
        centros: (centros.data ?? []) as CentroCusto[],
        fornecedores: (forns.data ?? []) as { id: string; nome: string }[],
        formas: (formas.data ?? []) as FormaPagamento[],
      };
    },
  });
}

type RpcResponse = { data: unknown; error: { message: string } | null };

/** Chama RPCs do financeiro com nome dinâmico e padroniza erro. */
export async function rpcFin<T extends { ok: boolean; message?: string } = FinanceiroRpcResult>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const dynRpc = supabase.rpc as unknown as (n: string, a: Record<string, unknown>) => Promise<RpcResponse>;
  const { data, error } = await dynRpc(fn, args);
  if (error) throw new Error(error.message);
  const r = data as T;
  if (!r.ok) throw new Error(r.message ?? "Operação não concluída.");
  return r;
}
