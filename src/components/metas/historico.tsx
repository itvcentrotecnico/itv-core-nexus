import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { MetasHistorico, MetasPainel, TecnicoDesempenho } from "@/lib/metas";
import { TIPO_META_EMPRESA_LABEL } from "@/lib/metas";
import {
  StatusMetaBadge,
  StatusProjecaoBadge,
  formatMetaValor,
  rpcMetas,
  useTecnicosDesempenho,
} from "@/components/metas/shared";

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function baixarCSV(nome: string, linhas: string[][]) {
  const conteudo = linhas.map((l) => l.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([`﻿${conteudo}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Aba Histórico e Relatórios: metas encerradas/anteriores + exportações. */
export function HistoricoTab({
  painel,
  range,
  mes,
}: {
  painel: MetasPainel;
  range: { from: string; to: string };
  mes: string;
}) {
  const [anos, setAnos] = useState(1);
  const tecnicos = useTecnicosDesempenho(range);

  const historico = useQuery({
    queryKey: ["metas", "historico", anos],
    queryFn: async () => {
      const r = await rpcMetas<MetasHistorico>("metas_historico", { p_meses: anos * 12 });
      if (!r.ok) throw new Error("Falha ao carregar histórico.");
      return r.metas;
    },
  });

  function exportarCSV() {
    const dados = historico.data ?? [];
    if (dados.length === 0) {
      toast.error("Sem metas no histórico para exportar.");
      return;
    }
    baixarCSV(`metas-historico-${mes}.csv`, [
      ["Meta", "Tipo", "Início", "Fim", "Alvo", "Realizado", "Atingimento %", "Projeção %", "Status"],
      ...dados.map((m) => [
        m.nome,
        TIPO_META_EMPRESA_LABEL[m.tipo] ?? m.tipo,
        formatDateOnlyISO(m.data_inicio),
        formatDateOnlyISO(m.data_fim),
        String(m.valor_alvo).replace(".", ","),
        String(m.realizado).replace(".", ","),
        m.percentual.toFixed(1).replace(".", ","),
        m.projecao_percentual != null ? m.projecao_percentual.toFixed(1).replace(".", ",") : "",
        m.status,
      ]),
    ]);
    toast.success("CSV exportado.");
  }

  function imprimirPDF() {
    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Permita pop-ups para gerar o relatório em PDF.");
      return;
    }
    const linhasMetas = painel.metas
      .map(
        (m) => `<tr><td>${m.nome}</td><td>${TIPO_META_EMPRESA_LABEL[m.tipo] ?? m.tipo}</td>
        <td>${formatMetaValor(m.valor_alvo, m.unidade)}</td><td>${formatMetaValor(m.realizado, m.unidade)}</td>
        <td>${m.percentual.toFixed(1)}%</td><td>${m.projecao != null ? formatMetaValor(m.projecao, m.unidade) : "—"}</td>
        <td>${m.status_projecao ?? "—"}</td></tr>`,
      )
      .join("");
    const linhasTecnicos = (tecnicos.data ?? [])
      .map(
        (t: TecnicoDesempenho) => `<tr><td>${t.tecnico}</td><td>${t.validados}</td>
        <td>${formatCurrencyBRL(t.producao_validada)}</td><td>${formatCurrencyBRL(t.margem_contribuicao)}</td>
        <td>${t.meta?.percentual != null ? t.meta.percentual.toFixed(0) + "%" : "—"}</td>
        <td>${t.meta?.nivel ?? "—"}</td></tr>`,
      )
      .join("");
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
      <title>Relatório de Metas — ${mes}</title>
      <style>body{font-family:Arial,sans-serif;color:#1a1a1a;padding:32px;font-size:12px}
      h1{font-size:20px;margin:0}h2{font-size:14px;margin:24px 0 8px}
      .sub{color:#666;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:8px}
      th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f3f4f6}
      .kpis{display:flex;gap:16px;flex-wrap:wrap;margin-top:16px}
      .kpi{border:1px solid #ddd;border-radius:8px;padding:10px 14px}
      .kpi b{display:block;font-size:16px;margin-top:2px}</style></head><body>
      <h1>GESTÃO ITV CENTRO TÉCNICO — Relatório de Metas e Desempenho</h1>
      <p class="sub">Competência: ${mes} · Período ${formatDateOnlyISO(range.from)} a ${formatDateOnlyISO(range.to)} · Gerado em ${new Date().toLocaleString("pt-BR")}</p>
      <div class="kpis">
        <div class="kpi">Faturamento<b>${formatCurrencyBRL(painel.atual.faturamento)}</b></div>
        <div class="kpi">Receita Líquida<b>${formatCurrencyBRL(painel.atual.receita_liquida)}</b></div>
        <div class="kpi">Margem de Contribuição<b>${formatCurrencyBRL(painel.atual.margem_contribuicao)}</b></div>
        <div class="kpi">Resultado Operacional<b>${formatCurrencyBRL(painel.atual.resultado_operacional)}</b></div>
      </div>
      <h2>Metas da Empresa</h2>
      <table><tr><th>Meta</th><th>Tipo</th><th>Alvo</th><th>Realizado</th><th>%</th><th>Projeção</th><th>Status Projeção</th></tr>${linhasMetas || '<tr><td colspan="7">Sem metas no período.</td></tr>'}</table>
      <h2>Desempenho dos Técnicos</h2>
      <table><tr><th>Técnico</th><th>Validados</th><th>Produção</th><th>Margem</th><th>% Meta</th><th>Nível</th></tr>${linhasTecnicos || '<tr><td colspan="6">Sem produção no período.</td></tr>'}</table>
      </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label htmlFor="hist-anos" className="text-sm text-muted-foreground">Últimos</label>
          <select
            id="hist-anos"
            value={anos}
            onChange={(e) => setAnos(Number(e.target.value))}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          >
            <option value={1}>12 meses</option>
            <option value={2}>24 meses</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportarCSV}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            <Download className="size-4" /> Exportar CSV
          </button>
          <button
            type="button"
            onClick={imprimirPDF}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Printer className="size-4" /> Relatório PDF
          </button>
        </div>
      </div>

      {historico.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : !historico.data || historico.data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma meta registrada no histórico.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Meta</th>
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Alvo</th>
                <th className="px-4 py-3 font-medium">Realizado</th>
                <th className="px-4 py-3 font-medium">Atingimento</th>
                <th className="px-4 py-3 font-medium">Projeção</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {historico.data.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{m.nome}</p>
                    <p className="text-xs text-muted-foreground">{TIPO_META_EMPRESA_LABEL[m.tipo] ?? m.tipo}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateOnlyISO(m.data_inicio)} a {formatDateOnlyISO(m.data_fim)}
                  </td>
                  <td className="px-4 py-3 text-foreground">{formatMetaValor(m.valor_alvo, m.unidade)}</td>
                  <td className="px-4 py-3 text-foreground">{formatMetaValor(m.realizado, m.unidade)}</td>
                  <td className="px-4 py-3 font-semibold text-foreground">{m.percentual.toFixed(1).replace(".", ",")}%</td>
                  <td className="px-4 py-3">
                    <StatusProjecaoBadge status={m.status_projecao} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusMetaBadge status={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
