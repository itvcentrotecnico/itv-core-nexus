import { Link } from "@tanstack/react-router";

import { HistoricoOperacional } from "@/components/operacional/historico";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import { GERENCIA_BASE, useGerenciaResumo } from "@/lib/gerencia";

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-display text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
    </div>
  );
}

/** Relatórios Operacionais: resumo da semana + histórico + atalhos analíticos. */
export function RelatoriosOperacionais() {
  const { dashboard, coletas, contadores } = useGerenciaResumo();
  const d = dashboard.data;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">
          Relatório Operacional da Semana
          {d ? ` — ${formatDateOnlyISO(d.semana.inicio)} a ${formatDateOnlyISO(d.semana.fim)}` : ""}
        </h2>
        {dashboard.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando o resumo da semana…</p>
        ) : !d ? (
          <p className="text-sm text-muted-foreground">Sem dados para o período.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Linha label="Entradas" value={String(d.semana.entradas)} />
            <Linha label="Entregas" value={String(d.semana.entregas)} />
            <Linha label="Saldo" value={String(d.semana.saldo)} />
            <Linha
              label="Taxa de saída"
              value={d.semana.taxa_saida != null ? `${d.semana.taxa_saida}%` : "—"}
            />
            <Linha label="Pendências em aberto" value={String(contadores.pendencias)} />
            <Linha label="Serviços validados hoje" value={String(d.hoje.validados_hoje)} />
            <Linha label="Comissões liberadas" value={String(d.comissoes.liberadas)} />
            <Linha
              label="Valor liberado"
              value={formatCurrencyBRL(Number(d.comissoes.valor_liberado ?? 0))}
            />
            <Linha label="Coletas em aberto" value={String(coletas.data?.coletas ?? 0)} />
            <Linha label="Entregas em aberto" value={String(coletas.data?.entregas ?? 0)} />
            <Linha label="Em rota" value={String(coletas.data?.emRota ?? 0)} />
            <Linha label="Não realizadas" value={String(contadores.naoRealizadas)} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">
          Histórico operacional
        </h2>
        <HistoricoOperacional />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Aprofundar análise</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            to={`${GERENCIA_BASE}/pendencias`}
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Pendências por motivo e dias na ITV
          </Link>
          <Link
            to={`${GERENCIA_BASE}/terceirizados`}
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Serviços terceirizados
          </Link>
          <Link
            to={`${GERENCIA_BASE}/tecnicos`}
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Produção por técnico
          </Link>
          <Link
            to="/relatorios"
            className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Relatórios gerenciais completos
          </Link>
        </div>
      </section>
    </div>
  );
}
