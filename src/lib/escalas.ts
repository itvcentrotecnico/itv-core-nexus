import { supabase } from "@/integrations/supabase/client";
import type { PessoaEscala, RegrasEscala } from "./escalas-calculo";
export interface AvisoEscala {
  tipo: string;
  texto: string;
}
export interface AcessoEscala {
  colaborador_id: string;
  nome: string;
  usuario: string | null;
  vinculado: boolean;
  ativo: boolean;
  pode_consultar: boolean;
}
export function acessoPronto(a: AcessoEscala | undefined) {
  return !!a && a.vinculado && a.ativo && a.pode_consultar;
}
export async function lerAcessosEscala(): Promise<AcessoEscala[]> {
  const { data, error } = await supabase.rpc("escalas_acessos");
  if (error) throw error;
  return data as unknown as AcessoEscala[];
}
export interface ValidacaoEscala {
  erros: string[];
  alertas: AvisoEscala[];
}
export interface SemanaEscala {
  id: string;
  inicio: string;
  estado: "rascunho" | "validada" | "publicada";
  revisao: number;
  equipe: PessoaEscala[];
  regras: RegrasEscala;
  validacao: ValidacaoEscala | null;
  updated_at: string;
}
export interface ColaboradorEscala {
  id: string;
  nome: string;
  funcao: string;
  meta: number;
  folgas: number[];
  selecionado: boolean;
}
export interface VersaoEscala {
  id: string;
  versao: number;
  publicado_em: string;
  equipe: PessoaEscala[];
  validacao: ValidacaoEscala;
}
export interface LeituraEscala {
  semana: SemanaEscala | null;
  regras: RegrasEscala;
  colaboradores: ColaboradorEscala[];
  versoes: VersaoEscala[];
}
export interface MinhaEscala {
  vinculado: boolean;
  publicacao: {
    inicio: string;
    versao: number;
    publicado_em: string;
    equipe: PessoaEscala[];
  } | null;
}
export async function lerEscala(inicio: string): Promise<LeituraEscala> {
  const { data, error } = await supabase.rpc("escalas_ler", { p_inicio: inicio, p_minha: false });
  if (error) throw error;
  return data as unknown as LeituraEscala;
}
export async function lerMinhaEscala(inicio: string): Promise<MinhaEscala> {
  const { data, error } = await supabase.rpc("escalas_ler", { p_inicio: inicio, p_minha: true });
  if (error) throw error;
  return data as unknown as MinhaEscala;
}
export async function gravarEscala(
  acao: string,
  inicio: string,
  revisao?: number,
  equipe?: PessoaEscala[],
  regras?: RegrasEscala,
  confirmado = false,
) {
  const { data, error } = await supabase.rpc("escalas_gravar", {
    p_acao: acao,
    p_inicio: inicio,
    ...(revisao === undefined ? {} : { p_revisao: revisao }),
    ...(equipe === undefined ? {} : { p_equipe: equipe as never }),
    ...(regras === undefined ? {} : { p_regras: regras as never }),
    p_confirmado: confirmado,
  });
  if (error) throw error;
  return data as unknown as { ok: boolean; inicio: string };
}
