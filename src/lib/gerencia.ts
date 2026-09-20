/**
 * GERÊNCIA OPERACIONAL — camada de gestão sobre os módulos existentes.
 * Não cria dados novos: apenas agrega os indicadores oficiais (Produção,
 * Comissões, Pendências, Coletas) para orientar a ação do ADM Operacional.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Bike,
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Package,
  Percent,
  Truck,
  Tv,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { diasNaItv, rpcOp, type OperacionalDashboard } from "@/lib/operacional";
import { todayManausISO } from "@/lib/format";

export const GERENCIA_BASE = "/gerencia-operacional";

export interface GerenciaItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Módulo usado para a checagem de permissão de interface. */
  moduleKey: string;
  /** Chave do contador exibido como badge. */
  badge?: keyof GerenciaContadores;
}

/** Ordem pensada para mobile: ação primeiro, relatórios por último. */
export const GERENCIA_SUBNAV: GerenciaItem[] = [
  { to: GERENCIA_BASE, label: "Visão Geral", icon: LayoutDashboard, moduleKey: "operacional" },
  {
    to: `${GERENCIA_BASE}/caixa-entrada`,
    label: "Caixa de Entrada",
    icon: Inbox,
    moduleKey: "operacional",
    badge: "total",
  },
  {
    to: `${GERENCIA_BASE}/validacao-tecnica`,
    label: "Validação Técnica",
    icon: ClipboardCheck,
    moduleKey: "producao",
    badge: "validacao",
  },
  {
    to: `${GERENCIA_BASE}/terceirizados`,
    label: "Serviços Terceirizados",
    icon: Package,
    moduleKey: "operacional",
  },
  {
    to: `${GERENCIA_BASE}/producao`,
    label: "Produção Técnica",
    icon: ClipboardList,
    moduleKey: "producao",
  },
  { to: `${GERENCIA_BASE}/tecnicos`, label: "Técnicos", icon: Wrench, moduleKey: "tecnicos" },
  {
    to: `${GERENCIA_BASE}/comissoes`,
    label: "Comissões Técnicas",
    icon: Percent,
    moduleKey: "comissoes",
    badge: "comissoes",
  },
  { to: `${GERENCIA_BASE}/fluxo`, label: "Fluxo de TVs", icon: Tv, moduleKey: "operacional" },
  {
    to: `${GERENCIA_BASE}/pendencias`,
    label: "Pendências",
    icon: Package,
    moduleKey: "operacional",
    badge: "pendencias",
  },
  {
    to: `${GERENCIA_BASE}/fechamento`,
    label: "Fechamento Semanal",
    icon: CalendarCheck,
    moduleKey: "operacional",
  },
  {
    to: `${GERENCIA_BASE}/coletas`,
    label: "Coletas e Entregas",
    icon: Truck,
    moduleKey: "coletas",
  },
  {
    to: `${GERENCIA_BASE}/equipe-externa`,
    label: "Equipe Externa",
    icon: Bike,
    moduleKey: "coletas",
  },
  {
    to: `${GERENCIA_BASE}/relatorios`,
    label: "Relatórios Operacionais",
    icon: BarChart3,
    moduleKey: "operacional",
  },
];

export const GERENCIA_ICON = Users;

export interface GerenciaContadores {
  validacao: number;
  correcoes: number;
  validadosHoje: number;
  comissoes: number;
  criticas: number;
  paradas: number;
  fechamento: number;
  semMotorista: number;
  naoRealizadas: number;
  pendencias: number;
  lotesProntos: number;
  lotesDevolvidos: number;
  solicitacoesEstoque: number;
  reservasEstoque: number;
  reservasAntigas: number;
  entregasEstoqueHoje: number;
  baixasEstoqueHoje: number;
  total: number;
}

const ATIVOS = ["pronto_coleta", "assumida", "em_rota", "no_local", "nao_realizada"];

export interface PendenciaLinha {
  id: string;
  os: string;
  cliente: string | null;
  marca: string | null;
  modelo: string | null;
  polegadas: number | null;
  observacao: string | null;
  data_entrada: string;
  ultima_movimentacao: string;
  motivo_id: string;
  motivo?: { nome: string } | null;
  tecnico?: { full_name: string } | null;
}

/** Pendências operacionais em aberto (fonte única: pendencias_operacionais). */
export function usePendenciasAbertas() {
  return useQuery({
    queryKey: ["gerencia", "pendencias-abertas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencias_operacionais")
        .select(
          "id, os, cliente, marca, modelo, polegadas, observacao, data_entrada, ultima_movimentacao, motivo_id, motivo:motivos_pendencia(nome), tecnico:profiles!pendencias_operacionais_tecnico_id_fkey(full_name)",
        )
        .eq("status", "aberta")
        .order("data_entrada")
        .limit(500);
      if (error) throw new Error("Não foi possível carregar as pendências operacionais.");
      return (data ?? []) as unknown as PendenciaLinha[];
    },
  });
}

/** Resumo consolidado da Gerência Operacional (agregações, nunca listas completas). */
export function useGerenciaResumo() {
  const dashboard = useQuery({
    queryKey: ["operacional", "dashboard"],
    queryFn: () => rpcOp<OperacionalDashboard>("operacional_dashboard"),
    refetchInterval: 120_000,
  });

  const coletas = useQuery({
    queryKey: ["gerencia", "coletas-resumo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coletas_solicitacoes")
        .select("tipo, status, motorista_id")
        .in("status", ATIVOS)
        .limit(500);
      if (error) throw new Error("Não foi possível carregar coletas e entregas.");
      const linhas = data ?? [];
      return {
        semMotorista: linhas.filter((l) => !l.motorista_id).length,
        naoRealizadas: linhas.filter((l) => l.status === "nao_realizada").length,
        emRota: linhas.filter((l) => l.status === "em_rota").length,
        coletas: linhas.filter((l) => l.tipo === "coleta").length,
        entregas: linhas.filter((l) => l.tipo === "entrega").length,
      };
    },
  });

  const pendencias = usePendenciasAbertas();

  const lotes = useQuery({
    queryKey: ["gerencia", "lotes-terceirizados"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terceirizados_lotes")
        .select("status, conta_pagar_id, devolvido_em")
        .in("status", ["confirmado", "em_validacao", "aguardando_confirmacao"])
        .eq("teste", false)
        .limit(200);
      if (error) return { prontos: 0, devolvidos: 0 };
      const linhas = data ?? [];
      return {
        prontos: linhas.filter((l) => l.status === "confirmado" && !l.conta_pagar_id).length,
        devolvidos: linhas.filter((l) => !!l.devolvido_em && !l.conta_pagar_id).length,
      };
    },
  });

  const estoque = useQuery({
    queryKey: ["estoque", "resumo"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("estoque_resumo");
      if (error) return null;
      return data as unknown as {
        ok: boolean;
        solicitacoes_pendentes?: number;
        reservas_ativas?: number;
        reservas_antigas?: number;
        entregas_hoje?: number;
        baixas_hoje?: number;
      } | null;
    },
  });

  const hoje = todayManausISO();
  const linhas = pendencias.data ?? [];
  const criticas = linhas.filter((p) => diasNaItv(p.data_entrada, hoje) >= 8).length;
  const paradas = linhas.filter(
    (p) => diasNaItv(String(p.ultima_movimentacao).slice(0, 10), hoje) >= 5,
  ).length;

  const d = dashboard.data;
  const contadores: GerenciaContadores = {
    validacao: d?.hoje.aguardando_validacao ?? 0,
    correcoes: d?.hoje.correcao_solicitada ?? 0,
    validadosHoje: d?.hoje.validados_hoje ?? 0,
    comissoes: (d?.comissoes.geradas ?? 0) + (d?.comissoes.conferidas ?? 0),
    criticas,
    paradas,
    fechamento: d && d.semana_anterior.status !== "fechado" ? 1 : 0,
    semMotorista: coletas.data?.semMotorista ?? 0,
    naoRealizadas: coletas.data?.naoRealizadas ?? 0,
    pendencias: linhas.length,
    lotesProntos: lotes.data?.prontos ?? 0,
    lotesDevolvidos: lotes.data?.devolvidos ?? 0,
    solicitacoesEstoque: estoque.data?.solicitacoes_pendentes ?? 0,
    reservasEstoque: estoque.data?.reservas_ativas ?? 0,
    reservasAntigas: estoque.data?.reservas_antigas ?? 0,
    entregasEstoqueHoje: estoque.data?.entregas_hoje ?? 0,
    baixasEstoqueHoje: estoque.data?.baixas_hoje ?? 0,
    total: 0,
  };
  contadores.total =
    contadores.validacao +
    contadores.correcoes +
    contadores.comissoes +
    contadores.criticas +
    contadores.fechamento +
    contadores.semMotorista +
    contadores.naoRealizadas +
    contadores.lotesProntos +
    contadores.lotesDevolvidos;

  return {
    contadores,
    dashboard,
    coletas,
    pendencias,
    isLoading: dashboard.isLoading || coletas.isLoading || pendencias.isLoading,
  };
}
