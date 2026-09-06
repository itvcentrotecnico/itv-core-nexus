import { mensagemErro } from "@/lib/erros";
import { useState } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { formatCurrencyBRL, formatDateOnlyISO, formatDateTimeITV } from "@/lib/format";
import type {
  RelFaturamento,
  RelPlanejamento,
  RelProducao,
  RelRentabilidade,
  RelTecnicos,
} from "@/lib/relatorios";
import { labelMes } from "@/lib/relatorios";
import { rpcRel } from "@/components/relatorios/shared";
import logoMark from "@/assets/itv-logo-mark.png.asset.json";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function linhasTabela(cabecalho: string[], linhas: (string | number)[][]): string {
  return `<table><thead><tr>${cabecalho.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${linhas
    .map((l) => `<tr>${l.map((c) => `<td>${esc(String(c))}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

/** Botão que monta o Resumo Executivo (impressão → PDF) com dados reais do período. */
export function ResumoExecutivoButton({ range }: { range: { from: string; to: string } }) {
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    try {
      const [fat, prod, tec, rent, plan] = await Promise.all([
        rpcRel<RelFaturamento>("relatorios_faturamento", { p_from: range.from, p_to: range.to }),
        rpcRel<RelProducao>("relatorios_producao", { p_from: range.from, p_to: range.to }),
        rpcRel<RelTecnicos>("relatorios_tecnicos", { p_from: range.from, p_to: range.to }),
        rpcRel<RelRentabilidade>("relatorios_rentabilidade", {
          p_from: range.from,
          p_to: range.to,
        }),
        rpcRel<RelPlanejamento>("relatorios_planejamento"),
      ]);
      if (!fat.ok || !prod.ok || !tec.ok || !rent.ok || !plan.ok)
        throw new Error("Falha ao consolidar os relatórios.");

      const r = fat.resumo;
      const variacao =
        fat.anterior.faturamento_final > 0
          ? ((r.faturamento_final - fat.anterior.faturamento_final) /
              fat.anterior.faturamento_final) *
            100
          : null;

      const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Resumo Executivo — ITV</title>
<style>
  @page { margin: 18mm; }
  * { box-sizing: border-box; }
  body { font-family: "Manrope", Arial, sans-serif; color: #18181b; margin: 0; font-size: 11px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0; }
  h2 { font-size: 14px; margin: 22px 0 8px; border-bottom: 2px solid #16a34a; padding-bottom: 4px; }
  .head { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #16a34a; padding-bottom: 12px; }
  .head img { height: 42px; }
  .sub { color: #71717a; font-size: 10px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
  .kpi { border: 1px solid #e4e4e7; border-radius: 8px; padding: 8px 10px; }
  .kpi .t { font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; color: #71717a; }
  .kpi .v { font-size: 14px; font-weight: 800; margin-top: 2px; }
  .kpi .s { font-size: 8.5px; color: #71717a; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; color: #71717a; border-bottom: 1px solid #d4d4d8; padding: 4px 6px; }
  td { border-bottom: 1px solid #f4f4f5; padding: 4px 6px; }
  .alerta { border: 1px solid #fcd34d; background: #fffbeb; border-radius: 6px; padding: 6px 10px; margin-top: 6px; }
  .foot { margin-top: 24px; border-top: 1px solid #e4e4e7; padding-top: 8px; color: #a1a1aa; font-size: 8.5px; display: flex; justify-content: space-between; }
</style></head><body>
<div class="head">
  <img src="${logoMark.url}" alt="ITV Centro Técnico">
  <div style="text-align:right">
    <h1>Resumo Executivo</h1>
    <p class="sub">Período: ${formatDateOnlyISO(range.from)} a ${formatDateOnlyISO(range.to)}</p>
    <p class="sub">Gerado em ${formatDateTimeITV(new Date())} (America/Manaus)</p>
  </div>
</div>

<div class="kpis">
  <div class="kpi"><p class="t">Faturamento bruto</p><p class="v">${formatCurrencyBRL(r.faturamento_bruto)}</p></div>
  <div class="kpi"><p class="t">Receita líquida</p><p class="v">${formatCurrencyBRL(r.receita_liquida)}</p><p class="s">variação vs período anterior: ${variacao != null ? `${variacao >= 0 ? "+" : ""}${variacao.toFixed(1).replace(".", ",")}%` : "—"}</p></div>
  <div class="kpi"><p class="t">OS faturadas</p><p class="v">${r.os_faturadas}</p><p class="s">ticket médio: ${formatCurrencyBRL(r.ticket_medio_os)}</p></div>
  <div class="kpi"><p class="t">Serviços validados</p><p class="v">${prod.resumo.servicos_validados}</p><p class="s">média: ${formatCurrencyBRL(prod.resumo.valor_medio)}</p></div>
</div>

<h2>Faturamento mensal (12 meses)</h2>
${linhasTabela(
  ["Mês", "Faturamento", "Receita Líquida", "OS", "Ticket Médio", "Variação"],
  fat.por_mes.map((x) => [
    labelMes(x.mes),
    formatCurrencyBRL(x.faturamento),
    formatCurrencyBRL(x.receita_liquida),
    x.os,
    formatCurrencyBRL(x.ticket_medio),
    x.variacao_pct != null ? `${x.variacao_pct.toFixed(1).replace(".", ",")}%` : "—",
  ]),
)}
<p class="sub">Médias: 3m ${formatCurrencyBRL(fat.medias.m3)} · 6m ${formatCurrencyBRL(fat.medias.m6)} · 12m ${formatCurrencyBRL(fat.medias.m12)}</p>

<h2>Serviços executados — ranking por tipo</h2>
${linhasTabela(
  ["Serviço", "Qtd", "%", "Valor Produção", "Ticket Médio", "Receita Associada"],
  prod.por_tipo
    .slice(0, 10)
    .map((x) => [
      x.tipo,
      x.quantidade,
      `${x.pct.toFixed(1).replace(".", ",")}%`,
      formatCurrencyBRL(x.valor),
      formatCurrencyBRL(x.ticket_medio),
      formatCurrencyBRL(x.receita_associada),
    ]),
)}

<h2>Técnicos — desempenho</h2>
${linhasTabela(
  [
    "Técnico",
    "Validados",
    "Receita",
    "Ticket Médio",
    "Custos",
    "Comissão",
    "Margem",
    "Índice Validação",
  ],
  tec.tecnicos.map((x) => [
    x.tecnico,
    x.validados,
    formatCurrencyBRL(x.receita_associada),
    formatCurrencyBRL(x.ticket_medio),
    formatCurrencyBRL(x.custos),
    formatCurrencyBRL(x.comissao),
    formatCurrencyBRL(x.margem),
    x.indice_validacao != null ? `${x.indice_validacao.toFixed(1).replace(".", ",")}%` : "—",
  ]),
)}

<h2>Rentabilidade por tipo de serviço</h2>
${linhasTabela(
  ["Categoria", "OS", "Receita", "Custos", "Comissões", "Margem", "Margem %"],
  rent.por_servico.map((x) => [
    x.categoria,
    x.quantidade,
    formatCurrencyBRL(x.receita),
    formatCurrencyBRL(x.custos),
    formatCurrencyBRL(x.comissao),
    formatCurrencyBRL(x.margem),
    x.margem_pct != null ? `${x.margem_pct.toFixed(1).replace(".", ",")}%` : "—",
  ]),
)}

<h2>Planejamento do próximo mês</h2>
<div class="kpis">
  <div class="kpi"><p class="t">Projeção base</p><p class="v">${formatCurrencyBRL(plan.projecao.projecao_base)}</p></div>
  <div class="kpi"><p class="t">Conservador</p><p class="v">${formatCurrencyBRL(plan.projecao.cenarios.conservador)}</p></div>
  <div class="kpi"><p class="t">Base</p><p class="v">${formatCurrencyBRL(plan.projecao.cenarios.base)}</p></div>
  <div class="kpi"><p class="t">Agressivo</p><p class="v">${formatCurrencyBRL(plan.projecao.cenarios.agressivo)}</p></div>
</div>
<p style="margin-top:8px"><strong>Faixa sugerida de meta:</strong> ${formatCurrencyBRL(plan.projecao.faixa_sugerida.min)} a ${formatCurrencyBRL(plan.projecao.faixa_sugerida.max)}</p>
${plan.alertas.map((a) => `<div class="alerta">${esc(a.texto)}</div>`).join("")}

<div class="foot"><span>GESTÃO ITV CENTRO TÉCNICO — documento gerencial interno</span><span>Fontes: Caixa, Produção validada, Peças e Comissões</span></div>
<script>window.addEventListener("load", () => setTimeout(() => window.print(), 400));</script>
</body></html>`;

      const win = window.open("", "_blank");
      if (!win) {
        toast.error("Permita pop-ups para gerar o PDF.");
        return;
      }
      win.document.write(html);
      win.document.close();
    } catch (e) {
      toast.error(mensagemErro(e, "Falha ao gerar o resumo executivo."));
    } finally {
      setGerando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void gerar()}
      disabled={gerando}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
    >
      <FileText className="size-3.5" /> {gerando ? "Gerando…" : "Resumo Executivo (PDF)"}
    </button>
  );
}
