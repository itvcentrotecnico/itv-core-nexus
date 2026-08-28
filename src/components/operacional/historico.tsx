import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  inicioSemanaISO,
  rpcOp,
  somaSemanasISO,
  type OperacionalSemana,
  type OperacionalTecnicoResumo,
  type SemanaHistorico,
} from "@/lib/operacional";

/** Histórico semanal, desempenho por técnico e relatório imprimível (sem dados sensíveis). */
export function HistoricoOperacional() {
  const hoje = useMemo(todayManausISO, []);
  const [semanas, setSemanas] = useState(8);
  const ref = inicioSemanaISO(hoje);

  const historico = useQuery({
    queryKey: ["operacional", "historico", semanas],
    queryFn: () => rpcOp<SemanaHistorico[]>("operacional_historico", { p_semanas: semanas }),
  });

  const porTecnico = useQuery({
    queryKey: ["operacional", "tecnicos", ref],
    queryFn: () => rpcOp<OperacionalTecnicoResumo[]>("operacional_por_tecnico", { p_ini: ref, p_fim: somaSemanasISO(ref, 1) }),
  });

  async function gerarRelatorio() {
    try {
      const semana = await rpcOp<OperacionalSemana>("operacional_semana", { p_ref: ref });
      const tecnicos = porTecnico.data ?? [];
      const janela = window.open("", "_blank");
      if (!janela) {
        toast.error("Libere as janelas pop-up do navegador para gerar o relatório.");
        return;
      }
      const linhas = tecnicos
        .map(
          (t) =>
            `<tr><td>${t.tecnico}</td><td>${t.enviados}</td><td>${t.validados}</td><td>${t.correcoes}</td><td>${t.rejeitados}</td><td>${formatCurrencyBRL(Number(t.producao_validada ?? 0))}</td></tr>`,
        )
        .join("");
      const motivos = (semana.pendentes_por_motivo ?? [])
        .map((m) => `<tr><td>${m.motivo}</td><td>${m.total}</td></tr>`)
        .join("");
      janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
        <title>Central Operacional — Semana ${semana.semana}/${semana.ano}</title>
        <style>body{font-family:system-ui,sans-serif;padding:24px;color:#1f2937}
        h1{font-size:18px}h2{font-size:14px;margin-top:20px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
        th,td{border:1px solid #d1d5db;padding:6px;text-align:left}</style></head><body>
        <h1>GESTÃO ITV — Central Operacional</h1>
        <p>Semana ${semana.semana}/${semana.ano} · ${formatDateOnlyISO(semana.inicio)} a ${formatDateOnlyISO(semana.fim)}</p>
        <h2>Fluxo de TVs</h2>
        <table><tr><th>TVs recebidas</th><th>Entregues</th><th>Saldo</th><th>Taxa de saída</th></tr>
        <tr><td>${semana.entradas_informadas ? semana.entradas : "—"}</td><td>${semana.entregas}</td><td>${semana.saldo}</td><td>${semana.taxa_saida != null ? `${semana.taxa_saida}%` : "—"}</td></tr></table>
        <h2>Motivos de permanência</h2>
        <table><tr><th>Motivo</th><th>TVs</th></tr>${motivos || "<tr><td colspan='2'>Sem pendências classificadas</td></tr>"}</table>
        <h2>Produção por técnico</h2>
        <table><tr><th>Técnico</th><th>Enviados</th><th>Validados</th><th>Correções</th><th>Rejeitados</th><th>Produção validada</th></tr>
        ${linhas || "<tr><td colspan='6'>Sem dados no período</td></tr>"}</table>
        </body></html>`);
      janela.document.close();
      janela.focus();
      janela.print();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {[4, 8, 12].map((n) => (
            <Button key={n} size="sm" variant={semanas === n ? "default" : "outline"} onClick={() => setSemanas(n)}>
              {n} semanas
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => void gerarRelatorio()}>Relatório da semana (PDF)</Button>
      </div>

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Histórico semanal de entradas e entregas</caption>
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Semana</th>
              <th className="p-3 text-right">Recebidas</th>
              <th className="p-3 text-right">Entregues</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {(historico.data ?? []).map((s) => (
              <tr key={s.inicio} className="border-t border-border">
                <td className="p-3">{formatDateOnlyISO(s.inicio)} a {formatDateOnlyISO(s.fim)}</td>
                <td className="p-3 text-right">{s.entradas}</td>
                <td className="p-3 text-right">{s.entregas}</td>
                <td className="p-3 text-right">{Math.max(0, s.entradas - s.entregas)}</td>
                <td className="p-3">{s.status === "fechado" ? "Fechada" : s.status === "reaberto" ? "Reaberta" : "Aberta"}</td>
              </tr>
            ))}
            {(historico.data ?? []).length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={5}>Sem dados de semanas anteriores.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="p-3 text-left font-display text-sm font-bold text-foreground">Desempenho por técnico (semana atual)</caption>
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Técnico</th>
              <th className="p-3 text-right">Enviados</th>
              <th className="p-3 text-right">Validados</th>
              <th className="p-3 text-right">Correções</th>
              <th className="p-3 text-right">TVs paradas</th>
              <th className="p-3 text-right">Produção validada</th>
            </tr>
          </thead>
          <tbody>
            {(porTecnico.data ?? []).map((t) => (
              <tr key={t.tecnico_id} className="border-t border-border">
                <td className="p-3">{t.tecnico}</td>
                <td className="p-3 text-right">{t.enviados}</td>
                <td className="p-3 text-right">{t.validados}</td>
                <td className="p-3 text-right">{t.correcoes}</td>
                <td className="p-3 text-right">{t.tvs_paradas}</td>
                <td className="p-3 text-right">{formatCurrencyBRL(Number(t.producao_validada ?? 0))}</td>
              </tr>
            ))}
            {(porTecnico.data ?? []).length === 0 && (
              <tr><td className="p-4 text-center text-muted-foreground" colSpan={6}>Sem produção registrada nesta semana.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
