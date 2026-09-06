import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Save, Tv } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { MODO_TV_CONFIG_PADRAO, type ModoTvConfig } from "@/lib/modo-tv";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { mensagemErro } from "@/lib/erros";

export const Route = createFileRoute("/_authenticated/admin/modo-tv")({
  head: () => ({
    meta: [
      { title: "Modo TV — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Configuração do painel de gestão à vista exibido nos monitores da ITV." },
      { property: "og:title", content: "Modo TV — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Configuração do painel de gestão à vista da ITV Centro Técnico." },
    ],
  }),
  component: ModoTvConfigPage,
});

const TOGGLES: { chave: keyof ModoTvConfig; label: string; hint: string }[] = [
  { chave: "mostrar_faturamento", label: "Faturamento do mês", hint: "Valor total faturado no período" },
  { chave: "mostrar_meta", label: "Meta da empresa", hint: "Meta principal, realizado e faltante" },
  { chave: "mostrar_projecao", label: "Projeção e ritmo", hint: "Ritmo atual, necessário e projeção de fechamento" },
  { chave: "mostrar_producao", label: "Produção dos técnicos", hint: "Serviços validados por técnico vs meta" },
  { chave: "mostrar_ranking", label: "Ranking / destaques", hint: "Top técnicos do mês" },
  { chave: "mostrar_ticket_medio", label: "Ticket médio", hint: "Exibe ticket médio junto ao faturamento" },
  { chave: "mostrar_tipos_servico", label: "Serviços mais executados", hint: "Distribuição por tipo de serviço" },
  { chave: "mostrar_marcas", label: "Marcas mais atendidas", hint: "Ranking de marcas de TV" },
  { chave: "mostrar_comparacao", label: "Comparativo mensal", hint: "Mês atual vs mesmo período do mês anterior" },
];

function ModoTvConfigPage() {
  const { can, isLoading: acessoCarregando } = useAccess();
  const podeConfigurar = can("modo_tv", "configurar") || can("modo_tv", "administrar");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "modo_tv"],
    queryFn: async () => {
      const { data: row, error } = await supabase.from("settings").select("value").eq("key", "modo_tv").maybeSingle();
      if (error) throw error;
      return (row?.value ?? {}) as Partial<ModoTvConfig>;
    },
  });

  const [form, setForm] = useState<ModoTvConfig>(MODO_TV_CONFIG_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (data) setForm({ ...MODO_TV_CONFIG_PADRAO, ...data });
  }, [data]);

  const set = <K extends keyof ModoTvConfig>(chave: K, valor: ModoTvConfig[K]) =>
    setForm((f) => ({ ...f, [chave]: valor }));

  async function salvar() {
    setSalvando(true);
    const { data: res, error } = await supabase.rpc("modo_tv_config_salvar", {
      p_config: form as unknown as never,
    });
    setSalvando(false);
    const ok = (res as { ok?: boolean } | null)?.ok;
    if (error || !ok) {
      toast.error("Não foi possível salvar", { description: mensagemErro(error, "Permissão negada.") });
      return;
    }
    toast.success("Configuração do Modo TV salva");
    void queryClient.invalidateQueries({ queryKey: ["settings", "modo_tv"] });
  }

  if (acessoCarregando || isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando configurações…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Modo TV</h1>
          <p className="text-sm text-muted-foreground">
            Painel de gestão à vista para monitores da oficina. Nenhum dado sensível (folha, despesas, comissões ou clientes) é exibido.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/modo-tv" target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" /> Abrir painel
          </Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Tv className="h-4 w-4 text-primary" /> Blocos exibidos
          </CardTitle>
          <CardDescription>Escolha quais indicadores aparecem na rotação do painel.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {TOGGLES.map((t) => (
            <div key={t.chave} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor={t.chave} className="text-sm font-medium">
                  {t.label}
                </Label>
                <p className="text-xs text-muted-foreground">{t.hint}</p>
              </div>
              <Switch
                id={t.chave}
                checked={Boolean(form[t.chave])}
                disabled={!podeConfigurar}
                onCheckedChange={(v) => set(t.chave, v as never)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exibição e rotação</CardTitle>
          <CardDescription>Tempo de cada tela e critério do destaque da semana.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="rotacao">Tempo por tela (segundos)</Label>
            <Input
              id="rotacao"
              type="number"
              min={8}
              max={180}
              value={form.rotacao_segundos}
              disabled={!podeConfigurar}
              onChange={(e) => set("rotacao_segundos", Number(e.target.value) || 25)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="refresh">Atualização de dados (segundos)</Label>
            <Input
              id="refresh"
              type="number"
              min={30}
              max={600}
              value={form.refresh_segundos}
              disabled={!podeConfigurar}
              onChange={(e) => set("refresh_segundos", Number(e.target.value) || 60)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="criterio">Critério do destaque</Label>
            <Select
              value={form.criterio_destaque}
              disabled={!podeConfigurar}
              onValueChange={(v) => set("criterio_destaque", v as ModoTvConfig["criterio_destaque"])}
            >
              <SelectTrigger id="criterio">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="producao">Maior produção validada</SelectItem>
                <SelectItem value="validacao">Melhor índice de validação</SelectItem>
                <SelectItem value="meta">Maior atingimento de meta</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagem institucional</CardTitle>
          <CardDescription>Texto motivacional ou aviso interno exibido no painel de produção.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="mostrar_mensagem" className="text-sm font-medium">
              Exibir mensagem no painel
            </Label>
            <Switch
              id="mostrar_mensagem"
              checked={form.mostrar_mensagem}
              disabled={!podeConfigurar}
              onCheckedChange={(v) => set("mostrar_mensagem", v)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="mensagem_titulo">Título</Label>
              <Input
                id="mensagem_titulo"
                value={form.mensagem_titulo}
                maxLength={40}
                disabled={!podeConfigurar}
                onChange={(e) => set("mensagem_titulo", e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="mensagem_texto">Mensagem</Label>
              <Textarea
                id="mensagem_texto"
                rows={2}
                maxLength={160}
                placeholder="Ex.: Foco em reduzir o tempo de reparo nesta semana."
                value={form.mensagem_texto}
                disabled={!podeConfigurar}
                onChange={(e) => set("mensagem_texto", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={salvar} disabled={!podeConfigurar || salvando}>
          {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar configuração
        </Button>
      </div>
      {!podeConfigurar && (
        <p className="text-sm text-muted-foreground">Você não tem permissão para alterar as configurações do Modo TV.</p>
      )}
    </div>
  );
}
