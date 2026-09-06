/**
 * ORIGEM DO CLIENTE (canal de aquisição) — GESTÃO ITV CENTRO TÉCNICO.
 *
 * Conceitos distintos e propositalmente separados:
 * - ORIGEM DE AQUISIÇÃO: "Como você conheceu a ITV?" (Google, Instagram, ...).
 * - CANAL DE CONTATO: por onde o cliente falou com a ITV (WhatsApp, telefone, ...).
 *
 * A origem é dimensão analítica: nunca altera valor, taxa, comissão ou receita líquida.
 */
import { mensagemErro } from "@/lib/erros";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export interface Origem {
  id: string;
  nome: string;
  ordem: number;
  requer_detalhe: boolean;
}

export const CANAIS_CONTATO = [
  "WhatsApp",
  "Telefone",
  "Instagram",
  "Presencial",
  "Site",
  "Outro",
] as const;

export type CanalContato = (typeof CANAIS_CONTATO)[number];

export interface OrigemValor {
  origem_id: string | null;
  origem_nome: string | null;
  detalhe: string;
  indicado_nome: string;
  indicado_telefone: string;
  canal: string;
}

export const ORIGEM_VAZIA: OrigemValor = {
  origem_id: null,
  origem_nome: null,
  detalhe: "",
  indicado_nome: "",
  indicado_telefone: "",
  canal: "WhatsApp",
};

export const ORIGEM_NAO_INFORMADA = "Não informado";

export async function rpcOrigens<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  return data as T;
}

/** Lista de origens ativas (funciona também para o formulário público). */
export function useOrigens() {
  return useQuery({
    queryKey: ["origens-cliente"],
    queryFn: () => rpcOrigens<Origem[]>("origens_listar"),
    staleTime: 10 * 60 * 1000,
  });
}

/** Valida o preenchimento antes de enviar. Retorna a mensagem amigável ou null. */
export function validarOrigem(valor: OrigemValor, origens: Origem[] | undefined): string | null {
  if (!valor.origem_id) return "Informe como o cliente conheceu a ITV.";
  const o = origens?.find((x) => x.id === valor.origem_id);
  if (o?.requer_detalhe && !valor.detalhe.trim()) return "Informe qual foi a origem.";
  return null;
}

export function ehIndicacao(valor: OrigemValor, origens: Origem[] | undefined): boolean {
  const o = origens?.find((x) => x.id === valor.origem_id);
  return (o?.nome ?? "").toLowerCase().startsWith("indica");
}

export function requerDetalhe(valor: OrigemValor, origens: Origem[] | undefined): boolean {
  return origens?.find((x) => x.id === valor.origem_id)?.requer_detalhe ?? false;
}

/** Normalização usada para relacionar cliente do Caixa com o atendimento. */
export function normNomeCliente(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Mapa derivado (nome normalizado do cliente -> origem) usado apenas para
 * FILTRAR o Caixa. Não altera nenhum valor financeiro.
 */
export function useOrigemMapCaixa(): Map<string, string> {
  const query = useQuery({
    queryKey: ["caixa-origem-map"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_origem_map");
      if (error) throw error;
      return (data as unknown as { cliente: string; origem: string }[]) ?? [];
    },
  });
  return useMemo(() => new Map((query.data ?? []).map((r) => [r.cliente, r.origem])), [query.data]);
}
