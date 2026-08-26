import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { Carregando, SecaoAdmin, SemDados, TabelaAdmin, executarAcao, rpcAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { CONFIG_PADRAO, type ComissaoEntregaConfig, type Entregador } from "@/lib/comissao-entrega";
import { formatCurrencyBRL } from "@/lib/format";

export function AdminComissaoEntrega() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeConfigurar = isAdmin || can("comissao_entrega", "configurar") || can("admin_parametros", "configurar");

  const [cfg, setCfg] = useState<ComissaoEntregaConfig>(CONFIG_PADRAO);

  const cfgQuery = useQuery({
    queryKey: ["admin", "comissao-entrega-config"],
    queryFn: async (): Promise<ComissaoEntregaConfig> => {
      const { data, error } = await supabase.rpc("comissao_entrega_config");
      if (error) throw error;
      return { ...CONFIG_PADRAO, ...((data ?? {}) as Partial<ComissaoEntregaConfig>) };
    },
  });

  const colabQuery = useQuery({
    queryKey: ["admin", "comissao-entrega-colaboradores"],
    queryFn: async (): Promise<Entregador[]> => {
      const { data, error } = await supabase.rpc("comissao_entrega_colaboradores");
      if (error) throw error;
      const res = data as unknown as { ok: boolean; itens?: Entregador[] };
      return res?.ok ? (res.itens ?? []) : [];
    },
  });

  useEffect(() => {
    if (cfgQuery.data) setCfg(cfgQuery.data);
  }, [cfgQuery.data]);

  if (cfgQuery.isLoading) return <Carregando />;

  const colaboradores = colabQuery.data ?? [];

  return (
    <div className="space-y-6">
      <SecaoAdmin
        titulo="Comissão de entrega"
        descricao="Incentivo operacional pago ao entregador. Não integra faturamento, receita líquida nem comissão técnica."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                () =>
                  rpcAdmin("admin_config_salvar", {
                    p_key: "comissao_entrega",
                    p_value: {
                      valor_taxa_fixa: cfg.valor_taxa_fixa,
                      valor_taxa_com_avaliacao: cfg.valor_taxa_com_avaliacao,
                      exige_validacao: cfg.exige_validacao,
                      ativo: cfg.ativo,
                    },
                  }),
                "Configuração de comissão de entrega salva.",
                () => void queryClient.invalidateQueries({ queryKey: ["comissao-entrega"] }),
              )
            }
          >
            <Save className="mr-2 size-4" /> Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="ce-fixa">
              Taxa fixa de entrega (R$)
            </label>
            <input
              id="ce-fixa"
              type="number"
              step="0.01"
              min="0"
              className={inputClass}
              value={cfg.valor_taxa_fixa}
              onChange={(e) => setCfg((c) => ({ ...c, valor_taxa_fixa: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ce-avaliacao">
              Taxa fixa + avaliação (R$)
            </label>
            <input
              id="ce-avaliacao"
              type="number"
              step="0.01"
              min="0"
              placeholder="Não definido"
              className={inputClass}
              value={cfg.valor_taxa_com_avaliacao ?? ""}
              onChange={(e) =>
                setCfg((c) => ({
                  ...c,
                  valor_taxa_com_avaliacao: e.target.value === "" ? null : Number(e.target.value),
                }))
              }
            />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span>Exigir validação gerencial antes do pagamento</span>
            <Switch
              checked={cfg.exige_validacao}
              disabled={!podeConfigurar}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, exige_validacao: v }))}
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
            <span>Comissão de entrega ativa no Caixa</span>
            <Switch
              checked={cfg.ativo}
              disabled={!podeConfigurar}
              onCheckedChange={(v) => setCfg((c) => ({ ...c, ativo: v }))}
            />
          </label>
        </div>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Colaboradores habilitados"
        descricao="Somente colaboradores ativos marcados aqui aparecem na lista de entregadores do Caixa."
      >
        {colabQuery.isLoading ? (
          <Carregando />
        ) : colaboradores.length === 0 ? (
          <SemDados label="Nenhum colaborador ativo" />
        ) : (
          <TabelaAdmin cabecalho={["Colaborador", "Cargo", "Recebe comissão de entrega"]}>
            {colaboradores.map((c) => (
              <tr key={c.id}>
                <td className="px-3 py-2 font-medium text-foreground">{c.nome}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.cargo ?? "—"}</td>
                <td className="px-3 py-2">
                  <Switch
                    checked={!!c.habilitado}
                    disabled={!podeConfigurar}
                    aria-label={`Habilitar ${c.nome} para comissão de entrega`}
                    onCheckedChange={(v) =>
                      void executarAcao(
                        () =>
                          rpcAdmin("comissao_entrega_flag_colaborador", {
                            p_colaborador_id: c.id,
                            p_habilitado: v,
                          }),
                        "Colaborador atualizado.",
                        () => {
                          void queryClient.invalidateQueries({ queryKey: ["admin", "comissao-entrega-colaboradores"] });
                          void queryClient.invalidateQueries({ queryKey: ["comissao-entrega"] });
                        },
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </TabelaAdmin>
        )}
      </SecaoAdmin>

      <p className="text-xs text-muted-foreground">
        Valor atual por entrega: <strong>{formatCurrencyBRL(cfg.valor_taxa_fixa)}</strong>
        {cfg.valor_taxa_com_avaliacao != null
          ? ` · com avaliação: ${formatCurrencyBRL(cfg.valor_taxa_com_avaliacao)}`
          : " · valor com avaliação ainda não definido"}
        .
      </p>
    </div>
  );
}
