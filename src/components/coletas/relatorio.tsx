import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatDateOnlyISO, formatDateTimeITV, todayManausISO } from "@/lib/format";
import { rpcColetas, STATUS_COLETA, TIPO_LABEL, type ColetaStatus, type ColetaTipo } from "@/lib/coletas";
import { StatusBadgeColeta } from "./shared";

interface Detalhe {
  id: string;
  tipo: ColetaTipo;
  cliente_nome: string;
  marca_tv: string | null;
  polegadas: number | null;
  bairro: string | null;
  motorista: string | null;
  atendimento: string | null;
  status: ColetaStatus;
  horario: string;
}

interface PorMotorista {
  motorista: string;
  coletas: number;
  entregas: number;
  concluidas: number;
  pendentes: number;
  total: number;
}

interface RelatorioDia {
  data: string;
  resumo: Record<string, number>;
  detalhes: Detalhe[];
  por_motorista: PorMotorista[];
}

function hora(iso: string): string {
  return formatDateTimeITV(iso).slice(-5);
}

function tvLabel(d: Detalhe): string {
  return [d.marca_tv, d.polegadas ? `${d.polegadas}"` : null].filter(Boolean).join(" ") || "—";
}

/** Relatório diário gerado automaticamente a partir das movimentações. */
export function RelatorioColetas() {
  const [data, setData] = useState(todayManausISO());

  const query = useQuery({
    queryKey: ["coletas", "relatorio", data],
    queryFn: () => rpcColetas<RelatorioDia>("coletas_relatorio_dia", { p_data: data }),
  });

  const rel = query.data;

  function gerarPdf() {
    if (!rel) return;
    const janela = window.open("", "_blank");
    if (!janela) {
      toast.error("Permita pop-ups para gerar o PDF.");
      return;
    }
    const r = rel.resumo;
    const linhas = rel.detalhes
      .map(
        (d) => `<tr><td>${TIPO_LABEL[d.tipo]}</td><td>${d.cliente_nome}</td><td>${tvLabel(d)}</td><td>${d.bairro ?? "—"}</td>
        <td>${d.motorista ?? "—"}</td><td>${hora(d.horario)}</td><td>${STATUS_COLETA[d.status].label}</td></tr>`,
      )
      .join("");
    const motoristas = rel.por_motorista
      .map(
        (m) =>
          `<tr><td>${m.motorista}</td><td>${m.coletas}</td><td>${m.entregas}</td><td>${m.concluidas}</td><td>${m.pendentes}</td></tr>`,
      )
      .join("");

    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Relatório Diário de Movimentações — ${formatDateOnlyISO(data)}</title>
      <style>
        body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2933;padding:28px}
        h1{font-size:20px;margin:0} h2{font-size:14px;margin:22px 0 8px;color:#0f9d58}
        p.sub{color:#667085;margin:2px 0 0;font-size:12px}
        table{width:100%;border-collapse:collapse;font-size:11px}
        th,td{border-bottom:1px solid #e4e7ec;padding:6px 4px;text-align:left}
        th{background:#f7f9f8;text-transform:uppercase;font-size:10px;color:#667085}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}
        .kpi{border:1px solid #e4e7ec;border-radius:8px;padding:8px 12px;min-width:110px}
        .kpi span{display:block;font-size:10px;color:#667085;text-transform:uppercase}
        .kpi strong{font-size:18px}
      </style></head><body>
      <h1>ITV CENTRO TÉCNICO</h1>
      <p class="sub">Relatório Diário de Movimentações — ${formatDateOnlyISO(data)}</p>
      <h2>Resumo</h2>
      <div class="kpis">
        <div class="kpi"><span>Coletas</span><strong>${r["coletas_realizadas"] ?? 0}</strong></div>
        <div class="kpi"><span>Entregas</span><strong>${r["entregas_realizadas"] ?? 0}</strong></div>
        <div class="kpi"><span>Pendentes</span><strong>${r["pendentes"] ?? 0}</strong></div>
        <div class="kpi"><span>Canceladas</span><strong>${r["canceladas"] ?? 0}</strong></div>
        <div class="kpi"><span>Total</span><strong>${r["total_movimentacoes"] ?? 0}</strong></div>
      </div>
      <h2>Detalhamento</h2>
      <table><thead><tr><th>Tipo</th><th>Cliente</th><th>TV</th><th>Bairro</th><th>Motorista</th><th>Horário</th><th>Status</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="7">Sem dados</td></tr>'}</tbody></table>
      <h2>Resumo por Motorista</h2>
      <table><thead><tr><th>Motorista</th><th>Coletas</th><th>Entregas</th><th>Concluídas</th><th>Pendentes</th></tr></thead>
      <tbody>${motoristas || '<tr><td colspan="5">Sem dados</td></tr>'}</tbody></table>
      <script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));<\/script>
      </body></html>`);
    janela.document.close();
  }

  const r = rel?.resumo ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className={labelClass} htmlFor="rel-data">Data</label>
          <input id="rel-data" type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <Button variant="outline" onClick={gerarPdf} disabled={!rel}>
          <FileText className="mr-2 size-4" /> Gerar Relatório do Dia
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Solicitações geradas", r["solicitacoes_geradas"]],
          ["Cadastros preenchidos", r["cadastros_preenchidos"]],
          ["Coletas realizadas", r["coletas_realizadas"]],
          ["Entregas realizadas", r["entregas_realizadas"]],
          ["Pendentes", r["pendentes"]],
          ["Canceladas", r["canceladas"]],
          ["Total de movimentações", r["total_movimentacoes"]],
          ["TVs movimentadas", r["tvs_movimentadas"]],
        ].map(([label, valor]) => (
          <div key={String(label)} className="rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-bold text-foreground">{Number(valor ?? 0)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-display text-sm font-bold">Detalhamento do dia</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Cliente</th>
                <th className="px-3 py-2 text-left">TV</th>
                <th className="px-3 py-2 text-left">Bairro</th>
                <th className="px-3 py-2 text-left">Motorista</th>
                <th className="px-3 py-2 text-left">Horário</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {(rel?.detalhes ?? []).map((d) => (
                <tr key={d.id} className="border-t border-border/60">
                  <td className="px-3 py-2">{TIPO_LABEL[d.tipo]}</td>
                  <td className="px-3 py-2 font-medium">{d.cliente_nome}</td>
                  <td className="px-3 py-2">{tvLabel(d)}</td>
                  <td className="px-3 py-2">{d.bairro ?? "—"}</td>
                  <td className="px-3 py-2">{d.motorista ?? "—"}</td>
                  <td className="px-3 py-2">{hora(d.horario)}</td>
                  <td className="px-3 py-2"><StatusBadgeColeta status={d.status} /></td>
                </tr>
              ))}
              {(rel?.detalhes ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sem dados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-display text-sm font-bold">Produtividade por motorista</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Motorista</th>
                <th className="px-3 py-2 text-left">Coletas</th>
                <th className="px-3 py-2 text-left">Entregas</th>
                <th className="px-3 py-2 text-left">Concluídas</th>
                <th className="px-3 py-2 text-left">Pendentes</th>
              </tr>
            </thead>
            <tbody>
              {(rel?.por_motorista ?? []).map((m) => (
                <tr key={m.motorista} className="border-t border-border/60">
                  <td className="px-3 py-2 font-medium">{m.motorista}</td>
                  <td className="px-3 py-2">{m.coletas}</td>
                  <td className="px-3 py-2">{m.entregas}</td>
                  <td className="px-3 py-2">{m.concluidas}</td>
                  <td className="px-3 py-2">{m.pendentes}</td>
                </tr>
              ))}
              {(rel?.por_motorista ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Sem dados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
