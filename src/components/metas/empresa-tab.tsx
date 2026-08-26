import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Settings2 } from "lucide-react";

import type { MetaEmpresaDetalhe, MetasPainel } from "@/lib/metas";
import { TIPO_META_EMPRESA_LABEL } from "@/lib/metas";
import { formatDateOnlyISO } from "@/lib/format";
import { MetaFormDialog, FaixasDialog, mudarStatusMeta } from "@/components/metas/meta-form";
import {
  ProgressBarMeta,
  StatusMetaBadge,
  StatusProjecaoBadge,
  formatMetaValor,
} from "@/components/metas/shared";

interface Props {
  painel: MetasPainel;
  podeCriar: boolean;
  podeEditar: boolean;
  podeEncerrar: boolean;
  podeConfigurar: boolean;
}

/** Aba Metas da Empresa: lista completa do período com ações auditáveis. */
export function EmpresaTab({ painel, podeCriar, podeEditar, podeEncerrar, podeConfigurar }: Props) {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState<MetaEmpresaDetalhe | null>(null);
  const [faixasOpen, setFaixasOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {painel.metas.length === 0
            ? "Nenhuma meta cadastrada com período dentro da competência selecionada."
            : `${painel.metas.length} meta(s) no período — valores calculados em tempo real das fontes oficiais.`}
        </p>
        <div className="flex gap-2">
          {podeConfigurar && (
            <button
              type="button"
              onClick={() => setFaixasOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              <Settings2 className="size-4" /> Faixas de projeção
            </button>
          )}
          {podeCriar && (
            <button
              type="button"
              onClick={() => {
                setEditando(null);
                setFormOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="size-4" /> Nova meta
            </button>
          )}
        </div>
      </div>

      {painel.metas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Meta</th>
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Alvo</th>
                <th className="px-4 py-3 font-medium">Realizado</th>
                <th className="px-4 py-3 font-medium">Atingimento</th>
                <th className="px-4 py-3 font-medium">Projeção</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {(podeEditar || podeEncerrar) && <th className="px-4 py-3 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {painel.metas.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{m.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {TIPO_META_EMPRESA_LABEL[m.tipo]}
                      {m.principal && <span className="ml-1 font-semibold text-primary">· Principal</span>}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateOnlyISO(m.data_inicio)} a {formatDateOnlyISO(m.data_fim)}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">{formatMetaValor(m.valor_alvo, m.unidade)}</td>
                  <td className="px-4 py-3 text-foreground">{formatMetaValor(m.realizado, m.unidade)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <ProgressBarMeta percentual={m.percentual} statusProjecao={m.status_projecao} />
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {m.percentual.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusProjecaoBadge status={m.status_projecao} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusMetaBadge status={m.status} />
                  </td>
                  {(podeEditar || podeEncerrar) && (
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {podeEditar && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditando(m);
                              setFormOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
                          >
                            <Pencil className="size-3" /> Editar
                          </button>
                        )}
                        {podeEncerrar && m.status !== "concluida" && m.status !== "cancelada" && (
                          <>
                            <button
                              type="button"
                              onClick={() => void mudarStatusMeta(qc, m.id, "concluida")}
                              className="rounded-md border border-primary/30 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/5"
                            >
                              Concluir
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const motivo = window.prompt("Motivo do cancelamento (opcional):") ?? undefined;
                                void mudarStatusMeta(qc, m.id, "cancelada", motivo);
                              }}
                              className="rounded-md border border-destructive/30 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5"
                            >
                              Cancelar
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MetaFormDialog open={formOpen} onOpenChange={setFormOpen} meta={editando} />
      {painel.faixas_projecao && (
        <FaixasDialog open={faixasOpen} onOpenChange={setFaixasOpen} faixas={painel.faixas_projecao} />
      )}
    </div>
  );
}
