import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { Carregando, SecaoAdmin, executarAcao, rpcAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { GOVERNANCA_PADRAO, type GovernancaConfig } from "@/lib/governanca";
import { formatRole, type AppRole } from "@/hooks/use-auth";

interface Nivel {
  id?: string;
  nome: string;
  percentual_minimo: number;
  percentual_maximo: number | null;
  ordem: number;
  ativo: boolean;
}

interface Financeiro {
  margem_minima_pct: number;
  custo_elevado_pct: number;
  alerta_vencimento_dias: number;
  bloquear_periodo_fechado: boolean;
  exigir_motivo_reabertura: boolean;
}

interface Projecao {
  atencao: number;
  no_ritmo: number;
  acima: number;
}

const FIN_PADRAO: Financeiro = {
  margem_minima_pct: 30,
  custo_elevado_pct: 50,
  alerta_vencimento_dias: 7,
  bloquear_periodo_fechado: true,
  exigir_motivo_reabertura: true,
};

export function AdminParametros() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeConfigurar = isAdmin || can("admin_parametros", "configurar");

  const settingsQuery = useQuery({
    queryKey: ["admin", "settings-parametros"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["financeiro", "metas", "planejamento", "governanca"]);
      if (error) throw error;
      const map: Record<string, Record<string, unknown>> = {};
      for (const row of data ?? []) map[row.key] = (row.value ?? {}) as Record<string, unknown>;
      return map;
    },
  });

  const niveisQuery = useQuery({
    queryKey: ["admin", "niveis-desempenho"],
    queryFn: async () => {
      const { data, error } = await supabase.from("niveis_desempenho").select("*").order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Nivel[];
    },
  });

  const [fin, setFin] = useState<Financeiro>(FIN_PADRAO);
  const [proj, setProj] = useState<Projecao>({ atencao: 80, no_ritmo: 95, acima: 105 });
  const [niveis, setNiveis] = useState<Nivel[]>([]);
  const [gov, setGov] = useState<GovernancaConfig>(GOVERNANCA_PADRAO);

  useEffect(() => {
    const f = settingsQuery.data?.["financeiro"];
    if (f) setFin({ ...FIN_PADRAO, ...(f as Partial<Financeiro>) });
    const g = settingsQuery.data?.["governanca"];
    if (g)
      setGov({
        ...GOVERNANCA_PADRAO,
        ...(g as Partial<GovernancaConfig>),
        alcada_desconto: {
          ...GOVERNANCA_PADRAO.alcada_desconto,
          ...((g as Partial<GovernancaConfig>).alcada_desconto ?? {}),
        },
      });
    const m = settingsQuery.data?.["metas"] as { faixas_projecao?: Projecao } | undefined;
    if (m?.faixas_projecao) setProj({ ...proj, ...m.faixas_projecao });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data]);

  useEffect(() => {
    if (niveisQuery.data) setNiveis(niveisQuery.data);
  }, [niveisQuery.data]);

  if (settingsQuery.isLoading || niveisQuery.isLoading) return <Carregando />;

  return (
    <div className="space-y-6">
      <SecaoAdmin
        titulo="Parâmetros financeiros"
        descricao="Usados apenas para alertas e conferências. Alterar estes valores não recalcula registros históricos."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                async () => {
                  await rpcAdmin("admin_config_salvar", { p_key: "financeiro", p_value: fin });
                  await rpcAdmin("admin_config_salvar", {
                    p_key: "custos",
                    p_value: {
                      margem_minima_pct: fin.margem_minima_pct,
                      custo_elevado_pct: fin.custo_elevado_pct,
                    },
                  });
                },
                "Parâmetros financeiros salvos.",
                () => {
                  void queryClient.invalidateQueries({
                    queryKey: ["admin", "settings-parametros"],
                  });
                  void queryClient.invalidateQueries({ queryKey: ["settings"] });
                },
              )
            }
          >
            <Save className="mr-2 size-4" /> Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="margem">
              Margem mínima recomendada (%)
            </label>
            <input
              id="margem"
              type="number"
              className={inputClass}
              value={fin.margem_minima_pct}
              onChange={(e) => setFin((f) => ({ ...f, margem_minima_pct: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="custo-elevado">
              Custo elevado a partir de (% da receita)
            </label>
            <input
              id="custo-elevado"
              type="number"
              className={inputClass}
              value={fin.custo_elevado_pct}
              onChange={(e) => setFin((f) => ({ ...f, custo_elevado_pct: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="alerta-venc">
              Alerta de vencimento (dias)
            </label>
            <input
              id="alerta-venc"
              type="number"
              className={inputClass}
              value={fin.alerta_vencimento_dias}
              onChange={(e) =>
                setFin((f) => ({ ...f, alerta_vencimento_dias: Number(e.target.value) }))
              }
            />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm sm:col-span-2">
            <span>
              <span className="font-medium text-foreground">
                Bloquear lançamentos em período fechado
              </span>
              <span className="block text-xs text-muted-foreground">
                Caixa, financeiro e folha já fechados.
              </span>
            </span>
            <Switch
              checked={fin.bloquear_periodo_fechado}
              onCheckedChange={(v) => setFin((f) => ({ ...f, bloquear_periodo_fechado: v }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <span className="font-medium text-foreground">Exigir motivo na reabertura</span>
            <Switch
              checked={fin.exigir_motivo_reabertura}
              onCheckedChange={(v) => setFin((f) => ({ ...f, exigir_motivo_reabertura: v }))}
            />
          </label>
        </div>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Governança financeira"
        descricao="Tributos gerenciais, alçadas de desconto por perfil, conferência física do caixa e rotina de backup. Não substitui a apuração fiscal oficial."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                () => rpcAdmin("admin_config_salvar", { p_key: "governanca", p_value: gov }),
                "Governança financeira salva.",
                () => {
                  void queryClient.invalidateQueries({
                    queryKey: ["admin", "settings-parametros"],
                  });
                  void queryClient.invalidateQueries({ queryKey: ["settings"] });
                },
              )
            }
          >
            <Save className="mr-2 size-4" /> Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className={labelClass} htmlFor="gov-trib-metodo">
              Método padrão de tributo
            </label>
            <select
              id="gov-trib-metodo"
              className={inputClass}
              value={gov.tributo_metodo}
              onChange={(e) =>
                setGov((g) => ({
                  ...g,
                  tributo_metodo: e.target.value as GovernancaConfig["tributo_metodo"],
                }))
              }
            >
              <option value="percentual">Percentual sobre a receita</option>
              <option value="manual">Valor manual</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="gov-trib-pct">
              Percentual gerencial padrão (%)
            </label>
            <input
              id="gov-trib-pct"
              type="number"
              step="0.01"
              className={inputClass}
              value={gov.tributo_percentual_padrao}
              onChange={(e) =>
                setGov((g) => ({ ...g, tributo_percentual_padrao: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="gov-backup">
              Intervalo recomendado de backup (dias)
            </label>
            <input
              id="gov-backup"
              type="number"
              className={inputClass}
              value={gov.backup_intervalo_dias}
              onChange={(e) =>
                setGov((g) => ({ ...g, backup_intervalo_dias: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="gov-alerta-desc">
              Alerta de desconto acima de (%)
            </label>
            <input
              id="gov-alerta-desc"
              type="number"
              step="0.01"
              className={inputClass}
              value={gov.alerta_desconto_pct}
              onChange={(e) =>
                setGov((g) => ({ ...g, alerta_desconto_pct: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="gov-entrega">
              Reconhecer comissão de entrega quando
            </label>
            <select
              id="gov-entrega"
              className={inputClass}
              value={gov.comissao_entrega_reconhecimento}
              onChange={(e) =>
                setGov((g) => ({
                  ...g,
                  comissao_entrega_reconhecimento: e.target
                    .value as GovernancaConfig["comissao_entrega_reconhecimento"],
                }))
              }
            >
              <option value="validada">Validada</option>
              <option value="paga">Paga</option>
            </select>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            <span>
              <span className="font-medium text-foreground">
                Exigir conferência física no fechamento
              </span>
              <span className="block text-xs text-muted-foreground">
                Contagem da gaveta versus saldo esperado.
              </span>
            </span>
            <Switch
              checked={gov.exige_conferencia_fisica}
              onCheckedChange={(v) => setGov((g) => ({ ...g, exige_conferencia_fisica: v }))}
            />
          </label>
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-foreground">Alçada de desconto por perfil</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Percentual máximo de desconto liberado sem autorização. Deixe em branco para sem limite.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                "administrador",
                "adm_financeiro",
                "adm_operacional",
                "vendedor",
                "tecnico",
              ] as AppRole[]
            ).map((r) => (
              <div key={r}>
                <label className={labelClass} htmlFor={`gov-alcada-${r}`}>
                  {formatRole(r)}
                </label>
                <input
                  id={`gov-alcada-${r}`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="sem limite"
                  className={inputClass}
                  value={gov.alcada_desconto[r] ?? ""}
                  onChange={(e) =>
                    setGov((g) => ({
                      ...g,
                      alcada_desconto: {
                        ...g.alcada_desconto,
                        [r]: e.target.value === "" ? null : Number(e.target.value),
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Faixas de desempenho"
        descricao="Classificação usada em Metas, Técnicos e Modo TV. Configurável pelo ADM, sem depender de alteração no código."
        acoes={
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={!podeConfigurar}
              onClick={() =>
                setNiveis((n) => [
                  ...n,
                  {
                    nome: "",
                    percentual_minimo: 0,
                    percentual_maximo: null,
                    ordem: n.length + 1,
                    ativo: true,
                  },
                ])
              }
            >
              <Plus className="mr-2 size-4" /> Faixa
            </Button>
            <Button
              size="sm"
              disabled={!podeConfigurar}
              onClick={() =>
                void executarAcao(
                  () => rpcAdmin("admin_niveis_desempenho_salvar", { p_niveis: niveis }),
                  "Faixas de desempenho salvas.",
                  () =>
                    void queryClient.invalidateQueries({
                      queryKey: ["admin", "niveis-desempenho"],
                    }),
                )
              }
            >
              <Save className="mr-2 size-4" /> Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {niveis.map((n, i) => (
            <div
              key={n.id ?? `novo-${i}`}
              className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-5"
            >
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor={`nivel-nome-${i}`}>
                  Nome
                </label>
                <input
                  id={`nivel-nome-${i}`}
                  className={inputClass}
                  value={n.nome}
                  onChange={(e) =>
                    setNiveis((arr) =>
                      arr.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`nivel-min-${i}`}>
                  Mínimo (%)
                </label>
                <input
                  id={`nivel-min-${i}`}
                  type="number"
                  className={inputClass}
                  value={n.percentual_minimo}
                  onChange={(e) =>
                    setNiveis((arr) =>
                      arr.map((x, j) =>
                        j === i ? { ...x, percentual_minimo: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <label className={labelClass} htmlFor={`nivel-max-${i}`}>
                  Máximo (%)
                </label>
                <input
                  id={`nivel-max-${i}`}
                  type="number"
                  className={inputClass}
                  value={n.percentual_maximo ?? ""}
                  placeholder="sem limite"
                  onChange={(e) =>
                    setNiveis((arr) =>
                      arr.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              percentual_maximo:
                                e.target.value === "" ? null : Number(e.target.value),
                            }
                          : x,
                      ),
                    )
                  }
                />
              </div>
              <label className="flex items-end justify-between gap-2 pb-2 text-sm">
                <span className="text-muted-foreground">Ativa</span>
                <Switch
                  checked={n.ativo}
                  onCheckedChange={(v) =>
                    setNiveis((arr) => arr.map((x, j) => (j === i ? { ...x, ativo: v } : x)))
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Faixas de projeção de metas"
        descricao="Limites usados para classificar a projeção de fechamento (atenção, no ritmo, acima da meta)."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                () =>
                  rpcAdmin("admin_config_salvar", {
                    p_key: "metas",
                    p_value: { faixas_projecao: proj },
                  }),
                "Faixas de projeção salvas.",
                () =>
                  void queryClient.invalidateQueries({
                    queryKey: ["admin", "settings-parametros"],
                  }),
              )
            }
          >
            <Save className="mr-2 size-4" /> Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["atencao", "Atenção abaixo de (%)"],
              ["no_ritmo", "No ritmo a partir de (%)"],
              ["acima", "Acima da meta a partir de (%)"],
            ] as const
          ).map(([chave, label]) => (
            <div key={chave}>
              <label className={labelClass} htmlFor={`proj-${chave}`}>
                {label}
              </label>
              <input
                id={`proj-${chave}`}
                type="number"
                className={inputClass}
                value={proj[chave]}
                onChange={(e) => setProj((p) => ({ ...p, [chave]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>
      </SecaoAdmin>
    </div>
  );
}
