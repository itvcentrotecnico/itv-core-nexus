import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { rpcColetas, STATUS_COLETA, type ColetaStatus } from "@/lib/coletas";
import { StatusBadgeColeta } from "./shared";

interface PorDia {
  dia: string;
  geradas: number;
  preenchidas: number;
  coletas: number;
  entregas: number;
  concluidas: number;
  canceladas: number;
}

interface PorStatus {
  status: ColetaStatus;
  total: number;
  coletas: number;
  entregas: number;
}

interface RelatorioPeriodo {
  inicio: string;
  fim: string;
  totais: Record<string, number>;
  por_dia: PorDia[];
  por_status: PorStatus[];
}

function diasAtras(n: number): string {
  const hoje = new Date(`${todayManausISO()}T12:00:00`);
  hoje.setDate(hoje.getDate() - n);
  return hoje.toISOString().slice(0, 10);
}

/** Resumos consolidados por data e por status, gerados a partir das movimentações. */
export function RelatorioPeriodoColetas() {
  const [inicio, setInicio] = useState(diasAtras(6));
  const [fim, setFim] = useState(todayManausISO());

  const query = useQuery({
    queryKey: ["coletas", "relatorio-periodo", inicio, fim],
    queryFn: () =>
      rpcColetas<RelatorioPeriodo>("coletas_relatorio_periodo", { p_ini: inicio, p_fim: fim }),
  });

  const rel = query.data;
  const t = rel?.totais ?? {};
  const porDia = rel?.por_dia ?? [];
  const porStatus = rel?.por_status ?? [];
  const maxDia = Math.max(1, ...porDia.map((d) => d.concluidas));
  const totalStatus = porStatus.reduce((acc, s) => acc + Number(s.total), 0);

  function gerarPdf() {
    if (!rel) return;
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("Permita pop-ups para gerar o PDF.");
      return;
    }
    const linhasDia = porDia
      .map(
        (d) =>
          `<tr><td>${formatDateOnlyISO(d.dia)}</td><td>${d.geradas}</td><td>${d.preenchidas}</td><td>${d.coletas}</td><td>${d.entregas}</td><td>${d.concluidas}</td><td>${d.canceladas}</td></tr>`,
      )
      .join("");
    const linhasStatus = porStatus
      .map(
        (s) =>
          `<tr><td>${STATUS_COLETA[s.status]?.label ?? s.status}</td><td>${s.coletas}</td><td>${s.entregas}</td><td>${s.total}</td></tr>`,
      )
      .join("");

    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Coletas — Resumo por período</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2933;padding:28px}
        h1{font-size:20px;margin:0} h2{font-size:14px;margin:22px 0 8px;color:#0f9d58}
        p.sub{color:#667085;margin:2px 0 0;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border-bottom:1px solid #e4e7ec;padding:6px 4px;text-align:left}
        th{background:#f7f9f8;text-transform:uppercase;font-size:10px;color:#667085}
      </style></head><body>
      <h1>ITV CENTRO TÉCNICO</h1>
      <p class="sub">Coletas — resumo de ${formatDateOnlyISO(rel.inicio)} a ${formatDateOnlyISO(rel.fim)}</p>
      <h2>Resumo por data</h2>
      <table><thead><tr><th>Data</th><th>Geradas</th><th>Preenchidas</th><th>Coletas</th><th>Entregas</th><th>Concluídas</th><th>Canceladas</th></tr></thead>
      <tbody>${linhasDia || '<tr><td colspan="7">Sem dados</td></tr>'}</tbody></table>
      <h2>Resumo por status</h2>
      <table><thead><tr><th>Status</th><th>Coletas</th><th>Entregas</th><th>Total</th></tr></thead>
      <tbody>${linhasStatus || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody></table>
      <script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));<\/script>
      </body></html>`);
    janela.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelClass} htmlFor="per-ini">
            De
          </label>
          <input
            id="per-ini"
            type="date"
            className={inputClass}
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="per-fim">
            Até
          </label>
          <input
            id="per-fim"
            type="date"
            className={inputClass}
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {[
            ["7 dias", 6],
            ["30 dias", 29],
          ].map(([label, n]) => (
            <Button
              key={String(label)}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setInicio(diasAtras(Number(n)));
                setFim(todayManausISO());
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        <Button variant="outline" className="ml-auto" onClick={gerarPdf} disabled={!rel}>
          <FileText className="mr-2 size-4" /> Exportar PDF
        </Button>
      </div>

      {query.isError && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          Não foi possível carregar o período informado.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Geradas", t["geradas"]],
          ["Preenchidas", t["preenchidas"]],
          ["Coletas", t["coletas"]],
          ["Entregas", t["entregas"]],
          ["Concluídas", t["concluidas"]],
          ["Canceladas", t["canceladas"]],
        ].map(([label, valor]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-bold text-foreground">{Number(valor ?? 0)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-display text-sm font-bold">
          Resumo por data
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Data</th>
                <th className="px-3 py-2 text-left">Geradas</th>
                <th className="px-3 py-2 text-left">Preenchidas</th>
                <th className="px-3 py-2 text-left">Coletas</th>
                <th className="px-3 py-2 text-left">Entregas</th>
                <th className="px-3 py-2 text-left">Concluídas</th>
                <th className="px-3 py-2 text-left">Canceladas</th>
                <th className="px-3 py-2 text-left">Volume</th>
              </tr>
            </thead>
            <tbody>
              {porDia.map((d) => (
                <tr key={d.dia} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{formatDateOnlyISO(d.dia)}</td>
                  <td className="px-3 py-2">{d.geradas}</td>
                  <td className="px-3 py-2">{d.preenchidas}</td>
                  <td className="px-3 py-2">{d.coletas}</td>
                  <td className="px-3 py-2">{d.entregas}</td>
                  <td className="px-3 py-2 font-semibold text-primary">{d.concluidas}</td>
                  <td className="px-3 py-2">{d.canceladas}</td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-24 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${Math.round((Number(d.concluidas) / maxDia) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {porDia.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                    Sem dados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-display text-sm font-bold">
          Resumo por status
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Coletas</th>
                <th className="px-3 py-2 text-left">Entregas</th>
                <th className="px-3 py-2 text-left">Total</th>
                <th className="px-3 py-2 text-left">Participação</th>
              </tr>
            </thead>
            <tbody>
              {porStatus.map((s) => (
                <tr key={s.status} className="border-t border-border/60">
                  <td className="px-3 py-2">
                    <StatusBadgeColeta status={s.status} />
                  </td>
                  <td className="px-3 py-2">{s.coletas}</td>
                  <td className="px-3 py-2">{s.entregas}</td>
                  <td className="px-3 py-2 font-semibold">{s.total}</td>
                  <td className="px-3 py-2">
                    {totalStatus ? `${Math.round((Number(s.total) / totalStatus) * 100)}%` : "0%"}
                  </td>
                </tr>
              ))}
              {porStatus.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                    Sem dados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
