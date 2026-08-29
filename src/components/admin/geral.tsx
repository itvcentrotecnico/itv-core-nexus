import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { inputClass, labelClass } from "@/lib/caixa";
import { Carregando, SecaoAdmin, executarAcao, rpcAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MENSAGEM_PADRAO } from "@/lib/coletas";
import logoColor from "@/assets/itv-logo-color.png.asset.json";

interface Organizacao {
  name: string;
  subtitle: string;
  razao_social: string;
  timezone: string;
  currency: string;
  formato_data: string;
}

interface Identidade {
  nome_exibicao: string;
  cor_institucional: string;
  logo_url: string;
}

const ORG_PADRAO: Organizacao = {
  name: "GESTÃO ITV",
  subtitle: "CENTRO TÉCNICO",
  razao_social: "ITV Centro Técnico",
  timezone: "America/Manaus",
  currency: "BRL",
  formato_data: "dd/MM/yyyy",
};

const IDENT_PADRAO: Identidade = {
  nome_exibicao: "GESTÃO ITV CENTRO TÉCNICO",
  cor_institucional: "#0F9D58",
  logo_url: "",
};

export function AdminGeral() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeConfigurar = isAdmin || can("admin_parametros", "configurar");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "settings-gerais"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("settings")
        .select("key, value")
        .in("key", ["organization", "identidade", "coletas_mensagem"]);
      if (error) throw error;
      const map: Record<string, Record<string, unknown>> = {};
      for (const r of rows ?? []) map[r.key] = (r.value ?? {}) as Record<string, unknown>;
      return map;
    },
  });

  const [org, setOrg] = useState<Organizacao>(ORG_PADRAO);
  const [ident, setIdent] = useState<Identidade>(IDENT_PADRAO);
  const [msg, setMsg] = useState<string>(MENSAGEM_PADRAO);

  useEffect(() => {
    if (data?.["organization"]) setOrg({ ...ORG_PADRAO, ...(data["organization"] as Partial<Organizacao>) });
    if (data?.["identidade"]) setIdent({ ...IDENT_PADRAO, ...(data["identidade"] as Partial<Identidade>) });
    const t = (data?.["coletas_mensagem"] as { template?: string } | undefined)?.template;
    if (t?.trim()) setMsg(t);
  }, [data]);

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-6">
      <SecaoAdmin
        titulo="Configurações gerais"
        descricao="Parâmetros institucionais do sistema. Timezone e moeda são padrões oficiais da operação."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                () => rpcAdmin("admin_config_salvar", { p_key: "organization", p_value: org }),
                "Configurações gerais salvas.",
                () => {
                  void queryClient.invalidateQueries({ queryKey: ["admin", "settings-gerais"] });
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
          {(
            [
              ["name", "Nome do sistema"],
              ["subtitle", "Complemento"],
              ["razao_social", "Nome da empresa"],
            ] as const
          ).map(([chave, label]) => (
            <div key={chave}>
              <label className={labelClass} htmlFor={`org-${chave}`}>
                {label}
              </label>
              <input
                id={`org-${chave}`}
                className={inputClass}
                value={org[chave]}
                onChange={(e) => setOrg((o) => ({ ...o, [chave]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className={labelClass} htmlFor="org-timezone">
              Timezone
            </label>
            <select
              id="org-timezone"
              className={inputClass}
              value={org.timezone}
              onChange={(e) => setOrg((o) => ({ ...o, timezone: e.target.value }))}
            >
              <option value="America/Manaus">America/Manaus (padrão ITV)</option>
              <option value="America/Sao_Paulo">America/Sao_Paulo</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="org-currency">
              Moeda
            </label>
            <select
              id="org-currency"
              className={inputClass}
              value={org.currency}
              onChange={(e) => setOrg((o) => ({ ...o, currency: e.target.value }))}
            >
              <option value="BRL">BRL — Real</option>
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="org-formato">
              Formato de data
            </label>
            <select
              id="org-formato"
              className={inputClass}
              value={org.formato_data}
              onChange={(e) => setOrg((o) => ({ ...o, formato_data: e.target.value }))}
            >
              <option value="dd/MM/yyyy">dd/MM/aaaa</option>
              <option value="yyyy-MM-dd">aaaa-MM-dd</option>
            </select>
          </div>
        </div>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Identidade visual"
        descricao="Ajustes limitados: nome de exibição, cor institucional e logo. A marca oficial ITV é utilizada por padrão."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                () => rpcAdmin("admin_config_salvar", { p_key: "identidade", p_value: ident }),
                "Identidade visual salva.",
                () => void queryClient.invalidateQueries({ queryKey: ["admin", "settings-gerais"] }),
              )
            }
          >
            <Save className="mr-2 size-4" /> Salvar
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="ident-nome">
              Nome de exibição
            </label>
            <input
              id="ident-nome"
              className={inputClass}
              value={ident.nome_exibicao}
              onChange={(e) => setIdent((i) => ({ ...i, nome_exibicao: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="ident-cor">
              Cor institucional
            </label>
            <div className="flex items-center gap-2">
              <input
                id="ident-cor"
                type="color"
                className="h-10 w-14 cursor-pointer rounded border border-border bg-background"
                value={ident.cor_institucional}
                onChange={(e) => setIdent((i) => ({ ...i, cor_institucional: e.target.value }))}
              />
              <input
                className={inputClass}
                value={ident.cor_institucional}
                onChange={(e) => setIdent((i) => ({ ...i, cor_institucional: e.target.value }))}
              />
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={labelClass} htmlFor="ident-logo">
              URL de logo alternativa (opcional)
            </label>
            <input
              id="ident-logo"
              className={inputClass}
              value={ident.logo_url}
              onChange={(e) => setIdent((i) => ({ ...i, logo_url: e.target.value }))}
              placeholder="Deixe em branco para usar a marca oficial ITV"
            />
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-4 sm:col-span-2 lg:col-span-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Prévia da marca</p>
            <img
              src={ident.logo_url || logoColor.url}
              alt="Marca institucional ITV Centro Técnico"
              className="h-12 w-auto"
            />
          </div>
        </div>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Mensagem do link de cadastro (WhatsApp)"
        descricao="Texto operacional exibido ao vendedor antes de abrir a conversa. O envio continua manual. Placeholders: {primeiro_nome} e {link}."
        acoes={
          <Button
            size="sm"
            disabled={!podeConfigurar}
            onClick={() =>
              void executarAcao(
                () => rpcAdmin("admin_config_salvar", { p_key: "coletas_mensagem", p_value: { template: msg } }),
                "Mensagem padrão salva.",
                () => {
                  void queryClient.invalidateQueries({ queryKey: ["admin", "settings-gerais"] });
                  void queryClient.invalidateQueries({ queryKey: ["settings", "coletas_mensagem"] });
                },
              )
            }
          >
            <Save className="mr-2 size-4" /> Salvar
          </Button>
        }
      >
        <Textarea rows={10} value={msg} onChange={(e) => setMsg(e.target.value)} disabled={!podeConfigurar} />
        <p className="mt-2 text-xs text-muted-foreground">
          Use apenas conteúdo operacional. Não incluir promoções, ofertas ou campanhas.
        </p>
      </SecaoAdmin>
    </div>
  );
}

