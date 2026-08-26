import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess, useSession } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KpiCard } from "@/routes/_authenticated/caixa";
import { RegraForm } from "@/components/comissoes/regra-form";
import {
  AjusteDialog, CancelarComissaoDialog, ComissaoDetalhes, MaoObraDialog, RecalcularDialog,
} from "@/components/comissoes/comissao-actions";
import { PagarDialog } from "@/components/comissoes/pagar-dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateITV, todayManausISO } from "@/lib/format";
import {
  STATUS_COMISSAO, TIPO_REGRA,
  type Comissao, type ComissaoPagamento, type ComissaoTecnicoResumo,
  type ComissoesIndicadores, type RegraComissao,
} from "@/lib/comissoes";

export const Route = createFileRoute("/_authenticated/comissoes")({
  head: () => ({
    meta: [
      { title: "Comissões — GESTÃO ITV Centro Técnico" },
      { name: "description", content: "Apuração, aprovação e pagamento das comissões técnicas." },
      { property: "og:title", content: "Comissões — GESTÃO ITV Centro Técnico" },
      { property: "og:description", content: "Apuração, aprovação e pagamento das comissões técnicas." },
    ],
  }),
  component: ComissoesPage,
});

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function ComissoesPage() {
  const { can, roles, isLoading } = useAccess();
  const { user } = useSession();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();
  const isTecnicoView = roles.includes("tecnico") && !can("comissoes", "visualizar");
  const podeGerenciar = can("comissoes", "visualizar");
  const podeAprovar = can("comissoes", "aprovar");
  const podeAjustar = can("comissoes", "editar");
  const podePagar = can("comissoes", "pagar");
  const podeAdministrar = can("comissoes", "administrar");

  const hoje = todayManausISO();
  const [from, setFrom] = useState(monthStart(hoje));
  const [to, setTo] = useState(hoje);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTecnico, setFiltroTecnico] = useState("");

  const [detalhe, setDetalhe] = useState<Comissao | null>(null);
  const [ajuste, setAjuste] = useState<Comissao | null>(null);
  const [cancelar, setCancelar] = useState<Comissao | null>(null);
  const [recalcular, setRecalcular] = useState<Comissao | null>(null);
  const [maoObra, setMaoObra] = useState<Comissao | null>(null);
  const [pagar, setPagar] = useState<{ tecnicoId: string; tecnicoNome: string } | null>(null);
  const [regraForm, setRegraForm] = useState<{ open: boolean; regra: RegraComissao | null }>({ open: false, regra: null });
  const [gerando, setGerando] = useState(false);

  const comissoesQuery = useQuery({
    queryKey: ["comissoes", from, to, filtroStatus, filtroTecnico, isTecnicoView, userId],
    enabled: !isLoading,
    queryFn: async () => {
      let q = supabase
        .from("comissoes")
        .select("*, tecnico:profiles!comissoes_tecnico_id_fkey(full_name)")
        .gte("data_referencia", from)
        .lte("data_referencia", to)
        .order("data_referencia", { ascending: false });
      if (filtroStatus) q = q.eq("status", filtroStatus as Comissao["status"]);
      if (isTecnicoView && userId) q = q.eq("tecnico_id", userId);
      else if (filtroTecnico) q = q.eq("tecnico_id", filtroTecnico);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Comissao[];
    },
  });
  const comissoes = comissoesQuery.data ?? [];

  const indicadoresQuery = useQuery({
    queryKey: ["comissoes-indicadores", from, to],
    enabled: podeGerenciar,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comissoes_indicadores", { p_from: from, p_to: to });
      if (error) throw error;
      return data as unknown as ComissoesIndicadores;
    },
  });
  const ind = indicadoresQuery.data;

  const porTecnicoQuery = useQuery({
    queryKey: ["comissoes-por-tecnico", from, to],
    enabled: podeGerenciar,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("comissoes_por_tecnico", { p_from: from, p_to: to });
      if (error) throw error;
      const r = data as unknown as { ok: boolean; tecnicos?: ComissaoTecnicoResumo[] };
      return (r?.tecnicos ?? []) as ComissaoTecnicoResumo[];
    },
  });

  const pagamentosQuery = useQuery({
    queryKey: ["comissoes-pagamentos", from, to],
    enabled: podeGerenciar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comissao_pagamentos")
        .select("*, tecnico:profiles!comissao_pagamentos_tecnico_id_fkey(full_name), responsavel:profiles!comissao_pagamentos_responsavel_id_fkey(full_name), forma:formas_pagamento(nome), itens:comissao_pagamento_itens(comissao_id, valor)")
        .gte("pago_em", `${from}T00:00:00`)
        .lte("pago_em", `${to}T23:59:59`)
        .order("pago_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ComissaoPagamento[];
    },
  });

  const regrasQuery = useQuery({
    queryKey: ["regras-comissao"],
    enabled: podeAdministrar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("regras_comissao")
        .select("*, tecnico:profiles!regras_comissao_tecnico_id_fkey(full_name)")
        .order("inicio_vigencia", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RegraComissao[];
    },
  });

  const tecnicosOpcoes = useMemo(() => {
    const mapa = new Map<string, string>();
    comissoes.forEach((c) => { if (c.tecnico_id && c.tecnico?.full_name) mapa.set(c.tecnico_id, c.tecnico.full_name); });
    return [...mapa.entries()];
  }, [comissoes]);

  async function gerar() {
    setGerando(true);
    try {
      const { data, error } = await supabase.rpc("comissoes_gerar", { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      const r = data as { ok: boolean; message?: string; geradas?: number };
      if (!r.ok) throw new Error(r.message ?? "Não foi possível gerar as comissões.");
      toast.success(`Apuração concluída: ${r.geradas ?? 0} comissão(ões) gerada(s).`);
      queryClient.invalidateQueries({ queryKey: ["comissoes"] });
      queryClient.invalidateQueries({ queryKey: ["comissoes-indicadores"] });
      queryClient.invalidateQueries({ queryKey: ["comissoes-por-tecnico"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar as comissões.");
    } finally {
      setGerando(false);
    }
  }

  function acoes(c: Comissao) {
    const podeEditarLinha = podeAjustar && !["paga", "cancelada"].includes(c.status);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">Ações</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDetalhe(c)}>Detalhes / Conferir</DropdownMenuItem>
          {podeEditarLinha && <DropdownMenuItem onClick={() => setAjuste(c)}>Ajustar valor</DropdownMenuItem>}
          {podeEditarLinha && <DropdownMenuItem onClick={() => setMaoObra(c)}>Mão de obra manual</DropdownMenuItem>}
          {podeEditarLinha && <DropdownMenuItem onClick={() => setRecalcular(c)}>Recalcular pela regra</DropdownMenuItem>}
          {podeAjustar && !["paga", "cancelada"].includes(c.status) && (
            <DropdownMenuItem className="text-destructive" onClick={() => setCancelar(c)}>Cancelar</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comissões Técnicas</h1>
          <p className="text-sm text-muted-foreground">
            {isTecnicoView
              ? "Acompanhe suas comissões geradas, aprovadas e pagas."
              : "Apuração sobre receita do Caixa e custos de Peças — a comissão não cria receita própria."}
          </p>
        </div>
        {podeGerenciar && (
          <Button onClick={gerar} disabled={gerando}>
            <RefreshCw className={gerando ? "animate-spin" : ""} />
            {gerando ? "Apurando…" : "Apurar Período"}
          </Button>
        )}
      </div>

      {podeGerenciar && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Comissão Gerada" value={ind ? formatCurrencyBRL(ind.comissao_gerada) : "—"} />
          <KpiCard label="Pendente" value={ind ? formatCurrencyBRL(ind.comissao_pendente) : "—"} />
          <KpiCard label="Aprovada" value={ind ? formatCurrencyBRL(ind.comissao_aprovada) : "—"} />
          <KpiCard label="Paga" value={ind ? formatCurrencyBRL(ind.comissao_paga) : "—"} />
          <KpiCard label="Técnicos" value={ind ? String(ind.tecnicos_com_comissao) : "—"} />
          <KpiCard
            label="% sobre Receita"
            value={ind?.comissao_receita_pct != null ? `${ind.comissao_receita_pct.toLocaleString("pt-BR")}%` : "—"}
          />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div>
          <label className={labelClass}>De</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Até</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select className={inputClass} value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(STATUS_COMISSAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {!isTecnicoView && tecnicosOpcoes.length > 0 && (
          <div>
            <label className={labelClass}>Técnico</label>
            <select className={inputClass} value={filtroTecnico} onChange={(e) => setFiltroTecnico(e.target.value)}>
              <option value="">Todos</option>
              {tecnicosOpcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {podeGerenciar ? (
        <Tabs defaultValue="comissoes">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="comissoes">Comissões</TabsTrigger>
            <TabsTrigger value="tecnicos">Por Técnico</TabsTrigger>
            <TabsTrigger value="pagamentos">Pagamentos</TabsTrigger>
            {podeAdministrar && <TabsTrigger value="regras">Regras</TabsTrigger>}
          </TabsList>

          <TabsContent value="comissoes" className="mt-4">
            <TabelaComissoes comissoes={comissoes} loading={comissoesQuery.isLoading} acoes={acoes} />
          </TabsContent>

          <TabsContent value="tecnicos" className="mt-4">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Técnico</TableHead>
                    <TableHead className="text-right">OS</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Custos</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                    <TableHead className="text-right">Paga</TableHead>
                    <TableHead className="text-right">Margem Contrib.</TableHead>
                    {podePagar && <TableHead />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(porTecnicoQuery.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sem dados no período.</TableCell></TableRow>
                  )}
                  {(porTecnicoQuery.data ?? []).map((t) => (
                    <TableRow key={t.tecnico_id}>
                      <TableCell className="font-medium">{t.tecnico}</TableCell>
                      <TableCell className="text-right">{t.qtd_os}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(t.receita_liquida)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(t.custos_diretos)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(t.comissao_gerada)}</TableCell>
                      <TableCell className="text-right">{formatCurrencyBRL(t.comissao_paga)}</TableCell>
                      <TableCell className={`text-right font-medium ${t.margem_contribuicao >= 0 ? "text-primary" : "text-destructive"}`}>
                        {formatCurrencyBRL(t.margem_contribuicao)}
                      </TableCell>
                      {podePagar && (
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm"
                            onClick={() => setPagar({ tecnicoId: t.tecnico_id, tecnicoNome: t.tecnico })}>
                            Pagar
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="pagamentos" className="mt-4">
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pago em</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Forma</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead className="text-right">Comissões</TableHead>
                    <TableHead className="text-right">Valor Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(pagamentosQuery.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum pagamento no período.</TableCell></TableRow>
                  )}
                  {(pagamentosQuery.data ?? []).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDateITV(p.pago_em)}</TableCell>
                      <TableCell className="font-medium">{p.tecnico?.full_name ?? "—"}</TableCell>
                      <TableCell>
                        {p.data_inicio ? `${formatDateITV(p.data_inicio)} a ${formatDateITV(p.data_fim ?? p.data_inicio)}` : "—"}
                      </TableCell>
                      <TableCell>{p.forma?.nome ?? "—"}</TableCell>
                      <TableCell>{p.responsavel?.full_name ?? "—"}</TableCell>
                      <TableCell className="text-right">{p.itens?.length ?? 0}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrencyBRL(p.valor_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {podeAdministrar && (
            <TabsContent value="regras" className="mt-4 space-y-3">
              <div className="flex justify-end">
                <Button onClick={() => setRegraForm({ open: true, regra: null })}>
                  <Plus /> Nova Regra
                </Button>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Técnico</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Percentual</TableHead>
                      <TableHead className="text-right">Valor Fixo</TableHead>
                      <TableHead>Vigência</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(regrasQuery.data ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma regra cadastrada.</TableCell></TableRow>
                    )}
                    {(regrasQuery.data ?? []).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.tecnico?.full_name ?? "—"}</TableCell>
                        <TableCell>{TIPO_REGRA[r.tipo_regra]}{r.servico_descricao ? ` — ${r.servico_descricao}` : ""}</TableCell>
                        <TableCell className="text-right">{r.percentual != null ? `${r.percentual}%` : "—"}</TableCell>
                        <TableCell className="text-right">{r.valor_fixo != null ? formatCurrencyBRL(r.valor_fixo) : "—"}</TableCell>
                        <TableCell>{formatDateITV(r.inicio_vigencia)}{r.fim_vigencia ? ` a ${formatDateITV(r.fim_vigencia)}` : " em diante"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={r.ativo ? "border-primary/20 bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
                            {r.ativo ? "Ativa" : "Inativa"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setRegraForm({ open: true, regra: r })} aria-label="Editar regra">
                            <Pencil className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          )}
        </Tabs>
      ) : (
        <TabelaComissoes comissoes={comissoes} loading={comissoesQuery.isLoading} acoes={acoes} tecnicoView />
      )}

      <ComissaoDetalhes comissao={detalhe} open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)} podeAprovar={podeAprovar} podeAjustar={podeAjustar} />
      <AjusteDialog comissao={ajuste} open={!!ajuste} onOpenChange={(o) => !o && setAjuste(null)} />
      <CancelarComissaoDialog comissao={cancelar} open={!!cancelar} onOpenChange={(o) => !o && setCancelar(null)} />
      <RecalcularDialog comissao={recalcular} open={!!recalcular} onOpenChange={(o) => !o && setRecalcular(null)} />
      <MaoObraDialog comissao={maoObra} open={!!maoObra} onOpenChange={(o) => !o && setMaoObra(null)} />
      {pagar && (
        <PagarDialog
          open
          onOpenChange={(o) => !o && setPagar(null)}
          tecnicoId={pagar.tecnicoId}
          tecnicoNome={pagar.tecnicoNome}
          comissoes={comissoes.filter((c) => c.tecnico_id === pagar.tecnicoId)}
        />
      )}
      <RegraForm open={regraForm.open} onOpenChange={(o) => setRegraForm((p) => ({ ...p, open: o }))} regra={regraForm.regra} />
    </div>
  );
}

function TabelaComissoes({
  comissoes, loading, acoes, tecnicoView = false,
}: {
  comissoes: Comissao[];
  loading: boolean;
  acoes: (c: Comissao) => React.ReactNode;
  tecnicoView?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>OS</TableHead>
            {!tecnicoView && <TableHead>Técnico</TableHead>}
            {!tecnicoView && <TableHead className="text-right">Receita</TableHead>}
            {!tecnicoView && <TableHead className="text-right">Custos</TableHead>}
            <TableHead className="text-right">Comissão</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && (
            <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Carregando…</TableCell></TableRow>
          )}
          {!loading && comissoes.length === 0 && (
            <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Nenhuma comissão no período.</TableCell></TableRow>
          )}
          {comissoes.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{formatDateITV(c.data_referencia)}</TableCell>
              <TableCell className="font-medium">{c.os}</TableCell>
              {!tecnicoView && <TableCell>{c.tecnico?.full_name ?? "—"}</TableCell>}
              {!tecnicoView && <TableCell className="text-right">{formatCurrencyBRL(c.receita_liquida)}</TableCell>}
              {!tecnicoView && <TableCell className="text-right">{formatCurrencyBRL(c.custos_diretos)}</TableCell>}
              <TableCell className="text-right font-medium">
                {c.valor_final != null ? formatCurrencyBRL(c.valor_final) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={STATUS_COMISSAO[c.status].className}>
                  {STATUS_COMISSAO[c.status].label}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{acoes(c)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
