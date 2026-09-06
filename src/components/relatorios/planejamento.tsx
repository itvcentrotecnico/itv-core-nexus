import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Target } from "lucide-react";

import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import type { RelPlanejamento } from "@/lib/relatorios";
import { labelMes } from "@/lib/relatorios";
import { MetaFormDialog, type MetaPrefill } from "@/components/metas/meta-form";
import { KpiRel, SecaoRel, TabelaRel, rpcRel } from "@/components/relatorios/shared";
import { useAccess } from "@/hooks/use-auth";
import { toast } from "sonner";

/** Aba Planejamento: cenários do próximo mês, referências operacionais e snapshots. */
export function PlanejamentoTab({ podeExportar }: { podeExportar: boolean }) {
  void podeExportar;
  const q = useQuery({
    queryKey: ["relatorios", "planejamento"],
    queryFn: () => rpcRel<RelPlanejamento>("relatorios_planejamento"),
  });
  const { can } = useAccess();
  const podeCriarMeta = can("metas", "configurar_metas");
  const [metaDialog, setMetaDialog] = useState<MetaPrefill | null>(null);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Calculando planejamento…</p>;
  if (q.error || !q.data?.ok) {
    return (
      <p className="text-sm text-destructive">
        {q.data?.message ?? "Falha ao carregar o planejamento."}
      </p>
    );
  }

  const d = q.data;
  const { medias, projecao } = d;

  function proximaCompetencia(): MetaPrefill {
    const now = new Date();
    const ini = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const fim = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const iso = (dt: Date) =>
      `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    return {
      valor_alvo: Math.round(projecao.projecao_base),
      periodo_tipo: "mensal",
      data_inicio: iso(ini),
      data_fim: iso(fim),
      observacao: `Meta sugerida pelo relatório de planejamento. Faixa sugerida: ${formatCurrencyBRL(projecao.faixa_sugerida.min)} a ${formatCurrencyBRL(projecao.faixa_sugerida.max)} (cenários conservador/base/agressivo: ${formatCurrencyBRL(projecao.cenarios.conservador)} / ${formatCurrencyBRL(projecao.cenarios.base)} / ${formatCurrencyBRL(projecao.cenarios.agressivo)}).`,
    };
  }

  const alertaCor = {
    atencao: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    dados: "border-primary/30 bg-primary/5 text-primary",
    info: "border-border bg-muted/50 text-muted-foreground",
  } as const;

  return (
    <div className="space-y-8">
      <SecaoRel
        titulo="Cenários do próximo mês"
        descricao="Faturamento mensal é a métrica central. Base estatística: médias históricas + tendência linear (projeção, não garantia)."
        acao={
          podeCriarMeta ? (
            <button
              type="button"
              onClick={() => {
                setMetaDialog(proximaCompetencia());
                toast.info("Revise o valor da meta antes de salvar.");
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Target className="size-3.5" /> Usar como referência para nova meta
            </button>
          ) : undefined
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiRel
            titulo="Projeção base"
            valor={formatCurrencyBRL(projecao.projecao_base)}
            sub={`≈ ${projecao.projecao_servicos} serviços`}
          />
          <KpiRel
            titulo="Conservador"
            valor={formatCurrencyBRL(projecao.cenarios.conservador)}
            sub={`Fator ${projecao.cenarios.fatores.conservador}x`}
          />
          <KpiRel
            titulo="Base"
            valor={formatCurrencyBRL(projecao.cenarios.base)}
            sub={`Fator ${projecao.cenarios.fatores.base}x`}
          />
          <KpiRel
            titulo="Agressivo"
            valor={formatCurrencyBRL(projecao.cenarios.agressivo)}
            sub={`Fator ${projecao.cenarios.fatores.agressivo}x`}
          />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 text-sm">
          <p className="font-medium text-foreground">
            Faixa sugerida de meta: {formatCurrencyBRL(projecao.faixa_sugerida.min)} a{" "}
            {formatCurrencyBRL(projecao.faixa_sugerida.max)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Faixa entre o cenário conservador e a média dos 3 últimos meses — realista, porém
            desafiadora.
          </p>
        </div>
        {d.alertas.map((a, i) => (
          <p
            key={i}
            className={`rounded-lg border px-4 py-2.5 text-xs ${alertaCor[a.tipo as keyof typeof alertaCor] ?? alertaCor.info}`}
          >
            {a.texto}
          </p>
        ))}
      </SecaoRel>

      <SecaoRel
        titulo="Faturamento histórico"
        descricao="Médias dos últimos 3, 6 e 12 meses, melhor e pior mês (12 meses fechados)."
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiRel titulo="Média 3 meses" valor={formatCurrencyBRL(medias.media_3m)} />
          <KpiRel titulo="Média 6 meses" valor={formatCurrencyBRL(medias.media_6m)} />
          <KpiRel titulo="Média 12 meses" valor={formatCurrencyBRL(medias.media_12m)} />
          <KpiRel
            titulo="Crescimento médio"
            valor={`${medias.crescimento_medio_pct.toFixed(1).replace(".", ",")}%/mês`}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiRel
            titulo="Melhor mês"
            valor={medias.melhor_mes ? labelMes(medias.melhor_mes.mes) : "—"}
            sub={medias.melhor_mes ? formatCurrencyBRL(medias.melhor_mes.faturamento) : undefined}
          />
          <KpiRel
            titulo="Pior mês"
            valor={medias.pior_mes ? labelMes(medias.pior_mes.mes) : "—"}
            sub={medias.pior_mes ? formatCurrencyBRL(medias.pior_mes.faturamento) : undefined}
          />
          <KpiRel
            titulo="Mês atual (parcial)"
            valor={formatCurrencyBRL(medias.mes_atual_parcial)}
          />
        </div>
      </SecaoRel>

      <SecaoRel
        titulo="Capacidade da equipe"
        descricao="Base para referência técnica: média de produção, melhor mês e período atual."
      >
        <TabelaRel
          colunas={[
            "Técnico",
            "Média Produção (3m)",
            "Melhor Mês",
            "Atual",
            "Ticket Médio",
            "Serviços/Mês",
          ]}
          linhas={d.tecnicos.map((x) => [
            <span key="t" className="font-medium">
              {x.tecnico}
            </span>,
            formatCurrencyBRL(x.media_3m),
            formatCurrencyBRL(x.melhor_mes),
            formatCurrencyBRL(x.atual),
            formatCurrencyBRL(x.ticket_medio),
            x.servicos_media.toFixed(1).replace(".", ","),
          ])}
          minWidth={720}
        />
      </SecaoRel>

      <div className="grid gap-6 lg:grid-cols-2">
        <SecaoRel
          titulo="Referência por marca"
          descricao="Participação no mix e projeção de serviços para o próximo mês."
        >
          <TabelaRel
            colunas={["Marca", "Participação", "Média/Mês", "Projeção de Serviços"]}
            linhas={d.marcas.map((x) => [
              x.marca,
              `${x.participacao_pct.toFixed(1).replace(".", ",")}%`,
              x.media_mensal.toFixed(1).replace(".", ","),
              x.projecao_servicos,
            ])}
          />
        </SecaoRel>
        <SecaoRel
          titulo="Referência por serviço"
          descricao="Média mensal de volume (últimos 3 meses)."
        >
          <TabelaRel
            colunas={["Serviço", "Média/Mês", "Total 3m"]}
            linhas={d.servicos.map((x) => [
              x.tipo,
              x.media_mensal.toFixed(1).replace(".", ","),
              x.total_3m,
            ])}
          />
        </SecaoRel>
      </div>

      <SecaoRel
        titulo="Referência por modelo"
        descricao="Volume médio mensal por modelo (últimos 3 meses) — apoio a estoque de peças."
      >
        <TabelaRel
          colunas={["Marca", "Modelo", "Média/Mês", "Total 3m"]}
          linhas={d.modelos.map((x) => [
            x.marca,
            x.modelo,
            x.media_mensal.toFixed(1).replace(".", ","),
            x.total_3m,
          ])}
        />
      </SecaoRel>

      <SecaoRel
        titulo="Snapshots oficiais"
        descricao="Competências congeladas para análise histórica — imutáveis e auditáveis."
      >
        <TabelaRel
          colunas={[
            "Competência",
            "Faturamento",
            "Receita Líquida",
            "OS",
            "Ticket Médio",
            "Resultado",
          ]}
          linhas={d.snapshots.map((x) => [
            formatDateOnlyISO(x.competencia).slice(3),
            formatCurrencyBRL(x.faturamento),
            formatCurrencyBRL(x.receita_liquida),
            x.os,
            formatCurrencyBRL(x.ticket_medio),
            <span
              key="r"
              className={
                x.resultado < 0 ? "font-semibold text-destructive" : "font-semibold text-primary"
              }
            >
              {formatCurrencyBRL(x.resultado)}
            </span>,
          ])}
        />
        {d.snapshots.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Para gerar um snapshot, feche a competência no módulo Colaboradores e use a função de
            oficialização de números.
          </p>
        )}
      </SecaoRel>

      <MetaFormDialog
        open={metaDialog != null}
        onOpenChange={(o) => {
          if (!o) setMetaDialog(null);
        }}
        meta={null}
        prefill={metaDialog}
      />
    </div>
  );
}
