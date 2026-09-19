import { useNavigate } from "@tanstack/react-router";

import { GERENCIA_BASE, useGerenciaResumo } from "@/lib/gerencia";
import { cn } from "@/lib/utils";

interface Alvo {
  label: string;
  valor: number;
  destino: string;
  destaque?: boolean;
}

/**
 * Painel "Precisa da sua ação": só indicadores que exigem decisão do gerente.
 * Cada número abre a tela oficial responsável — nenhum dado é recalculado aqui.
 */
export function PrecisaDaSuaAcao({ compacto = false }: { compacto?: boolean }) {
  const navigate = useNavigate();
  const { contadores, isLoading } = useGerenciaResumo();

  const alvos: Alvo[] = [
    {
      label: "Serviços aguardando validação",
      valor: contadores.validacao,
      destino: `${GERENCIA_BASE}/validacao-tecnica`,
      destaque: true,
    },
    {
      label: "Correções técnicas",
      valor: contadores.correcoes,
      destino: `${GERENCIA_BASE}/validacao-tecnica`,
    },
    {
      label: "Comissões aguardando liberação",
      valor: contadores.comissoes,
      destino: `${GERENCIA_BASE}/comissoes`,
    },
    {
      label: "Lotes prontos para o Financeiro",
      valor: contadores.lotesProntos,
      destino: `${GERENCIA_BASE}/terceirizados`,
    },
    {
      label: "Devolvidos pelo Financeiro",
      valor: contadores.lotesDevolvidos,
      destino: `${GERENCIA_BASE}/terceirizados`,
    },
    { label: "TVs críticas", valor: contadores.criticas, destino: `${GERENCIA_BASE}/pendencias` },
    {
      label: "TVs sem movimentação",
      valor: contadores.paradas,
      destino: `${GERENCIA_BASE}/pendencias`,
    },
    {
      label: "Fechamento semanal pendente",
      valor: contadores.fechamento,
      destino: `${GERENCIA_BASE}/fechamento`,
    },
    {
      label: "Coletas sem motorista",
      valor: contadores.semMotorista,
      destino: `${GERENCIA_BASE}/coletas`,
    },
    {
      label: "Entregas não realizadas",
      valor: contadores.naoRealizadas,
      destino: `${GERENCIA_BASE}/coletas`,
    },
  ];

  const lista = compacto ? alvos.filter((a) => a.valor > 0) : alvos;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-bold text-foreground">Precisa da sua ação</h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {isLoading ? "…" : contadores.total}
        </span>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando indicadores…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nada pendente por aqui. Operação em dia.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {lista.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => void navigate({ to: a.destino })}
              className={cn(
                "rounded-lg border border-border p-3 text-left transition hover:border-primary/50 hover:bg-muted/60",
                a.destaque && a.valor > 0 ? "bg-primary/5" : "bg-background",
              )}
            >
              <p className="font-display text-2xl font-bold text-foreground">{a.valor}</p>
              <p className="text-xs font-medium text-muted-foreground">{a.label}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
