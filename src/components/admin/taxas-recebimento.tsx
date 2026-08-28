import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { Carregando, SecaoAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import {
  MEIOS_LABEL,
  MODALIDADES_LABEL,
  useTaxasRecebimento,
  type TaxaRecebimento,
} from "@/lib/taxas-recebimento";
import { formatDateOnlyISO, todayManausISO } from "@/lib/format";

interface NovaTaxa {
  adquirente: string;
  canal: string;
  meio_pagamento: string;
  modalidade: string;
  parcelas: number;
  taxa_percentual: number;
  taxa_cliente_percentual: number;
  responsavel_taxa: string;
  vigencia_inicio: string;
  observacao: string;
}

function novaVazia(): NovaTaxa {
  return {
    adquirente: "Mercado Pago",
    canal: "Point",
    meio_pagamento: "credito",
    modalidade: "a_vista",
    parcelas: 1,
    taxa_percentual: 0,
    taxa_cliente_percentual: 0,
    responsavel_taxa: "itv",
    vigencia_inicio: todayManausISO(),
    observacao: "",
  };
}

/**
 * Tabela central de taxas de recebimento por adquirente, canal, meio e parcelas.
 * O Caixa aplica automaticamente a regra vigente; alterações aqui valem para
 * lançamentos futuros (os já registrados mantêm o retrato da taxa aplicada).
 */
export function AdminTaxasRecebimento() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeEditar = isAdmin || can("financeiro", "administrar") || can("caixa", "administrar");
  const query = useTaxasRecebimento(true);
  const [salvando, setSalvando] = useState(false);
  const [nova, setNova] = useState<NovaTaxa>(novaVazia());
  const [criando, setCriando] = useState(false);
  const [edicoes, setEdicoes] = useState<Record<string, number>>({});

  const grupos = useMemo(() => {
    const mapa = new Map<string, TaxaRecebimento[]>();
    for (const t of query.data ?? []) {
      const chave = `${t.adquirente} · ${t.canal}`;
      mapa.set(chave, [...(mapa.get(chave) ?? []), t]);
    }
    return [...mapa.entries()];
  }, [query.data]);

  async function salvarEdicoes() {
    const ids = Object.keys(edicoes);
    if (ids.length === 0) {
      toast.info("Nenhuma alteração para salvar.");
      return;
    }
    setSalvando(true);
    try {
      for (const id of ids) {
        const { error } = await supabase
          .from("taxas_recebimento")
          .update({ taxa_percentual: edicoes[id] ?? 0 })
          .eq("id", id);
        if (error) throw error;
      }
      toast.success("Taxas atualizadas.");
      setEdicoes({});
      await queryClient.invalidateQueries({ queryKey: ["taxas-recebimento"] });
    } catch {
      toast.error("Não foi possível salvar as taxas. Verifique sua permissão e tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(t: TaxaRecebimento) {
    const { error } = await supabase
      .from("taxas_recebimento")
      .update({ ativo: !t.ativo })
      .eq("id", t.id);
    if (error) {
      toast.error("Não foi possível alterar a situação desta taxa.");
      return;
    }
    toast.success(t.ativo ? "Taxa desativada." : "Taxa reativada.");
    await queryClient.invalidateQueries({ queryKey: ["taxas-recebimento"] });
  }

  async function criar() {
    if (!nova.adquirente.trim() || !nova.canal.trim()) {
      toast.error("Informe o adquirente e o canal.");
      return;
    }
    setSalvando(true);
    try {
      const { error } = await supabase.from("taxas_recebimento").insert({
        adquirente: nova.adquirente.trim(),
        canal: nova.canal.trim(),
        meio_pagamento: nova.meio_pagamento,
        modalidade: nova.modalidade,
        parcelas: Math.max(1, nova.parcelas),
        taxa_percentual: nova.taxa_percentual,
        taxa_cliente_percentual: nova.taxa_cliente_percentual,
        responsavel_taxa: nova.responsavel_taxa,
        vigencia_inicio: nova.vigencia_inicio,
        ...(nova.observacao.trim() ? { observacao: nova.observacao.trim() } : {}),
      });
      if (error) throw error;
      toast.success("Taxa cadastrada.");
      setNova(novaVazia());
      setCriando(false);
      await queryClient.invalidateQueries({ queryKey: ["taxas-recebimento"] });
    } catch {
      toast.error("Não foi possível cadastrar a taxa. Confira se já existe uma regra igual vigente.");
    } finally {
      setSalvando(false);
    }
  }

  if (query.isLoading) return <Carregando />;

  return (
    <SecaoAdmin
      titulo="Taxas de recebimento"
      descricao="Percentuais cobrados pelas adquirentes (Mercado Pago Point e Link). O Caixa aplica automaticamente a regra vigente por meio de pagamento e parcelamento."
      acoes={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!podeEditar} onClick={() => setCriando((v) => !v)}>
            <Plus className="mr-2 size-4" /> Nova taxa
          </Button>
          <Button size="sm" disabled={!podeEditar || salvando} onClick={() => void salvarEdicoes()}>
            <Save className="mr-2 size-4" /> {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      }
    >
      {criando && (
        <div className="mb-5 grid grid-cols-2 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="tx-adq">Adquirente</label>
            <input id="tx-adq" className={inputClass} value={nova.adquirente}
              onChange={(e) => setNova({ ...nova, adquirente: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-canal">Canal</label>
            <input id="tx-canal" className={inputClass} value={nova.canal}
              onChange={(e) => setNova({ ...nova, canal: e.target.value })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-meio">Meio</label>
            <select id="tx-meio" className={inputClass} value={nova.meio_pagamento}
              onChange={(e) => setNova({ ...nova, meio_pagamento: e.target.value })}>
              {Object.entries(MEIOS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-mod">Modalidade</label>
            <select id="tx-mod" className={inputClass} value={nova.modalidade}
              onChange={(e) => setNova({ ...nova, modalidade: e.target.value })}>
              {Object.entries(MODALIDADES_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-parc">Parcelas</label>
            <input id="tx-parc" type="number" min={1} max={24} className={inputClass} value={nova.parcelas}
              onChange={(e) => setNova({ ...nova, parcelas: Number(e.target.value) || 1 })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-pct">Taxa ITV (%)</label>
            <input id="tx-pct" type="number" min={0} step="0.01" className={inputClass} value={nova.taxa_percentual}
              onChange={(e) => setNova({ ...nova, taxa_percentual: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-cli">Juros do cliente (%)</label>
            <input id="tx-cli" type="number" min={0} step="0.01" className={inputClass}
              value={nova.taxa_cliente_percentual}
              onChange={(e) => setNova({ ...nova, taxa_cliente_percentual: Number(e.target.value) || 0 })} />
          </div>
          <div>
            <label className={labelClass} htmlFor="tx-vig">Vigência a partir de</label>
            <input id="tx-vig" type="date" className={inputClass} value={nova.vigencia_inicio}
              onChange={(e) => setNova({ ...nova, vigencia_inicio: e.target.value })} />
          </div>
          <div className="col-span-2 flex items-end sm:col-span-4">
            <Button size="sm" disabled={!podeEditar || salvando} onClick={() => void criar()}>
              Cadastrar taxa
            </Button>
          </div>
        </div>
      )}

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma taxa cadastrada.</p>
      ) : (
        <div className="space-y-6">
          {grupos.map(([grupo, itens]) => (
            <div key={grupo}>
              <p className={labelClass}>{grupo}</p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Meio</th>
                      <th className="px-3 py-2 text-left">Parcelas</th>
                      <th className="px-3 py-2 text-left">Taxa ITV (%)</th>
                      <th className="px-3 py-2 text-left">Juros cliente (%)</th>
                      <th className="px-3 py-2 text-left">Vigência</th>
                      <th className="px-3 py-2 text-left">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-3 py-2">{MEIOS_LABEL[t.meio_pagamento] ?? t.meio_pagamento}</td>
                        <td className="px-3 py-2">{t.parcelas}x</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            aria-label={`Taxa ITV ${grupo} ${t.parcelas}x`}
                            disabled={!podeEditar}
                            className={inputClass}
                            value={edicoes[t.id] ?? t.taxa_percentual}
                            onChange={(e) =>
                              setEdicoes((prev) => ({ ...prev, [t.id]: Number(e.target.value) || 0 }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          {t.taxa_cliente_percentual > 0
                            ? `${t.taxa_cliente_percentual.toFixed(2).replace(".", ",")}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          desde {formatDateOnlyISO(t.vigencia_inicio)}
                          {t.vigencia_fim ? ` até ${formatDateOnlyISO(t.vigencia_fim)}` : ""}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={!podeEditar}
                            onClick={() => void alternarAtivo(t)}
                            className={
                              t.ativo
                                ? "rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary"
                                : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                            }
                          >
                            {t.ativo ? "Ativa" : "Inativa"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </SecaoAdmin>
  );
}
