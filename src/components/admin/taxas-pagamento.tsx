import { mensagemErro } from "@/lib/erros";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass, type FormaPagamento, type FormaPagamentoTaxa } from "@/lib/caixa";
import { Carregando, SecaoAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";

type Mapa = Record<string, Record<number, number>>;

/** Configuração das taxas por parcelamento (Crédito 1x–6x, Bemol etc.). */
export function AdminTaxasPagamento() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeConfigurar = isAdmin || can("caixa", "administrar");
  const [salvando, setSalvando] = useState(false);
  const [mapa, setMapa] = useState<Mapa>({});

  const query = useQuery({
    queryKey: ["admin", "formas-pagamento-taxas"],
    queryFn: async () => {
      const [formas, taxas] = await Promise.all([
        supabase
          .from("formas_pagamento")
          .select(
            "id, nome, ativo, ordem, eh_dinheiro, taxa_padrao_percentual, permite_parcelamento, max_parcelas, liquidacao_imediata, prazo_liquidacao_dias",
          )
          .eq("ativo", true)
          .order("ordem"),
        supabase
          .from("formas_pagamento_taxas")
          .select("id, forma_pagamento_id, parcelas, taxa_percentual"),
      ]);
      if (formas.error) throw formas.error;
      if (taxas.error) throw taxas.error;
      return {
        formas: (formas.data ?? []) as FormaPagamento[],
        taxas: (taxas.data ?? []) as FormaPagamentoTaxa[],
      };
    },
  });

  const parceladas = useMemo(
    () => (query.data?.formas ?? []).filter((f) => f.permite_parcelamento),
    [query.data],
  );

  useEffect(() => {
    if (!query.data) return;
    const next: Mapa = {};
    for (const f of query.data.formas.filter((x) => x.permite_parcelamento)) {
      next[f.id] = {};
      for (let n = 1; n <= Math.max(1, f.max_parcelas ?? 1); n += 1) {
        const t = query.data.taxas.find((x) => x.forma_pagamento_id === f.id && x.parcelas === n);
        next[f.id]![n] = Number(t?.taxa_percentual ?? f.taxa_padrao_percentual ?? 0);
      }
    }
    setMapa(next);
  }, [query.data]);

  async function salvar() {
    setSalvando(true);
    try {
      const linhas = Object.entries(mapa).flatMap(([formaId, porParcela]) =>
        Object.entries(porParcela).map(([parcelas, taxa]) => ({
          forma_pagamento_id: formaId,
          parcelas: Number(parcelas),
          taxa_percentual: Number(taxa) || 0,
        })),
      );
      const { error } = await supabase
        .from("formas_pagamento_taxas")
        .upsert(linhas, { onConflict: "forma_pagamento_id,parcelas" });
      if (error) throw error;
      toast.success("Taxas por parcelamento salvas.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "formas-pagamento-taxas"] });
      await queryClient.invalidateQueries({ queryKey: ["caixa", "formas-pagamento-taxas"] });
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao salvar as taxas."));
    } finally {
      setSalvando(false);
    }
  }

  if (query.isLoading) return <Carregando />;

  return (
    <SecaoAdmin
      titulo="Taxas por parcelamento"
      descricao="Percentual de taxa aplicado automaticamente no Caixa conforme a forma e o número de parcelas."
      acoes={
        <Button size="sm" disabled={!podeConfigurar || salvando} onClick={() => void salvar()}>
          <Save className="mr-2 size-4" /> {salvando ? "Salvando…" : "Salvar"}
        </Button>
      }
    >
      {parceladas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma forma de pagamento com parcelamento ativa.
        </p>
      ) : (
        <div className="space-y-5">
          {parceladas.map((f) => (
            <div key={f.id}>
              <p className={labelClass}>
                {f.nome} — até {f.max_parcelas ?? 1}x
                {f.liquidacao_imediata === false && (
                  <span className="ml-2 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700">
                    a receber em {f.prazo_liquidacao_dias ?? 0} dia(s)
                  </span>
                )}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                {Array.from({ length: Math.max(1, f.max_parcelas ?? 1) }, (_, i) => i + 1).map(
                  (n) => (
                    <div key={n}>
                      <label
                        className="mb-1 block text-xs text-muted-foreground"
                        htmlFor={`taxa-${f.id}-${n}`}
                      >
                        {n}x (%)
                      </label>
                      <input
                        id={`taxa-${f.id}-${n}`}
                        type="number"
                        min={0}
                        step="0.01"
                        className={inputClass}
                        disabled={!podeConfigurar}
                        value={mapa[f.id]?.[n] ?? 0}
                        onChange={(e) =>
                          setMapa((prev) => ({
                            ...prev,
                            [f.id]: { ...(prev[f.id] ?? {}), [n]: Number(e.target.value) },
                          }))
                        }
                      />
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SecaoAdmin>
  );
}
