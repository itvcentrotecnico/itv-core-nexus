import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/caixa/money-input";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { rpcFin } from "@/components/financeiro/shared";
import {
  BENEFICIO_TIPOS,
  competenciaISO,
  type Colaborador,
  type ColaboradorAdiantamento,
  type ColaboradorBeneficio,
} from "@/lib/folha";
import { invalidateFolha } from "./colaborador-form";

/* ============================= BENEFÍCIOS ============================= */

export function BeneficiosDialog({ colaborador, onClose }: { colaborador: Colaborador; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<ColaboradorBeneficio["tipo"]>("vale_transporte");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [inicio, setInicio] = useState(todayManausISO());
  const [saving, setSaving] = useState(false);

  const beneficiosQuery = useQuery({
    queryKey: ["folha", "beneficios", colaborador.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("colaborador_beneficios")
        .select("*")
        .eq("colaborador_id", colaborador.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ColaboradorBeneficio[];
    },
  });
  const beneficios = beneficiosQuery.data ?? [];

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("colaborador_beneficios").insert({
        colaborador_id: colaborador.id,
        tipo,
        descricao: descricao || null,
        valor,
        inicio_vigencia: inicio,
      } as never);
      if (error) throw error;
      toast.success("Benefício cadastrado. Entra na folha a partir da vigência.");
      setValor(null);
      setDescricao("");
      invalidateFolha(queryClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao cadastrar benefício.");
    } finally {
      setSaving(false);
    }
  }

  async function alternar(b: ColaboradorBeneficio) {
    const { error } = await supabase
      .from("colaborador_beneficios")
      .update({ ativo: !b.ativo, fim_vigencia: b.ativo ? todayManausISO() : null } as never)
      .eq("id", b.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(b.ativo ? "Benefício desativado." : "Benefício reativado.");
    invalidateFolha(queryClient);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Benefícios — {colaborador.nome_exibicao || colaborador.nome}</DialogTitle>
          <DialogDescription>
            Benefícios recorrentes entram automaticamente na geração da folha enquanto estiverem ativos e vigentes.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={adicionar} className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <div>
            <label htmlFor="bn-tipo" className={labelClass}>Tipo *</label>
            <select
              id="bn-tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as ColaboradorBeneficio["tipo"])}
              className={inputClass}
            >
              {BENEFICIO_TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bn-valor" className={labelClass}>Valor Mensal *</label>
            <MoneyInput id="bn-valor" value={valor} onChange={setValor} />
          </div>
          <div>
            <label htmlFor="bn-ini" className={labelClass}>Início da Vigência *</label>
            <input id="bn-ini" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="bn-desc" className={labelClass}>Descrição</label>
            <input id="bn-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} className={inputClass} />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="submit" size="sm" disabled={saving || valor == null || !inicio}>
              {saving ? "Salvando…" : "Adicionar benefício"}
            </Button>
          </div>
        </form>

        <ul className="divide-y divide-border">
          {beneficios.length === 0 && (
            <li className="py-3 text-sm text-muted-foreground">Nenhum benefício cadastrado.</li>
          )}
          {beneficios.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className={cn("font-medium", !b.ativo && "text-muted-foreground line-through")}>
                {BENEFICIO_TIPOS.find((t) => t.value === b.tipo)?.label ?? b.tipo}
              </span>
              <span className="text-muted-foreground">{formatCurrencyBRL(b.valor)}/mês</span>
              <span className="text-xs text-muted-foreground">
                desde {formatDateOnlyISO(b.inicio_vigencia)}
                {b.fim_vigencia ? ` até ${formatDateOnlyISO(b.fim_vigencia)}` : ""}
              </span>
              {!b.ativo && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inativo</span>
              )}
              <button
                type="button"
                onClick={() => alternar(b)}
                className="ml-auto rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {b.ativo ? "Desativar" : "Reativar"}
              </button>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= ADIANTAMENTOS ============================= */

export function AdiantamentoForm({
  open,
  onClose,
  colaborador,
}: {
  open: boolean;
  onClose: () => void;
  colaborador: Colaborador;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(todayManausISO());
  const [valor, setValor] = useState<number | null>(null);
  const [competencia, setCompetencia] = useState(todayManausISO().slice(0, 7));
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setData(todayManausISO());
      setValor(null);
      setCompetencia(todayManausISO().slice(0, 7));
      setMotivo("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase.from("colaborador_adiantamentos").insert({
        colaborador_id: colaborador.id,
        data,
        valor,
        competencia_desconto: competenciaISO(competencia),
        motivo: motivo.trim(),
      } as never);
      if (error) throw error;
      toast.success("Adiantamento registrado. Será sugerido como desconto na folha da competência.");
      invalidateFolha(queryClient);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar adiantamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adiantamento — {colaborador.nome_exibicao || colaborador.nome}</DialogTitle>
          <DialogDescription>
            O valor será descontado automaticamente na folha da competência de desconto informada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ad-data" className={labelClass}>Data *</label>
              <input id="ad-data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="ad-valor" className={labelClass}>Valor *</label>
              <MoneyInput id="ad-valor" value={valor} onChange={setValor} />
            </div>
          </div>
          <div>
            <label htmlFor="ad-comp" className={labelClass}>Competência do Desconto *</label>
            <input id="ad-comp" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="ad-motivo" className={labelClass}>Motivo *</label>
            <Textarea id="ad-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} required />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving || !valor || !motivo.trim() || !competencia}>
              {saving ? "Registrando…" : "Registrar adiantamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ============================= HISTÓRICO DO COLABORADOR ============================= */

interface HistoricoData {
  ok: boolean;
  salarios: { inicio_vigencia: string; fim_vigencia: string | null; valor: number; motivo: string | null; responsavel: string | null }[];
  competencias: { competencia: string; status: string; proventos: number; descontos: number; total: number; pago: number }[];
  pagamentos: { data: string; valor: number; observacao: string | null; competencia: string }[];
}

export function HistoricoColaboradorDialog({ colaborador, onClose }: { colaborador: Colaborador; onClose: () => void }) {
  const historicoQuery = useQuery({
    queryKey: ["folha", "historico", colaborador.id],
    queryFn: () => rpcFin<HistoricoData & { message?: string }>("folha_historico_colaborador", { p_colaborador_id: colaborador.id }),
  });
  const h = historicoQuery.data;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico — {colaborador.nome}</DialogTitle>
          <DialogDescription>Salários, competências e pagamentos registrados.</DialogDescription>
        </DialogHeader>
        {historicoQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {h && (
          <div className="space-y-5">
            <section>
              <h4 className="mb-2 font-display text-sm font-bold text-foreground">Histórico Salarial</h4>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {h.salarios.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Sem registros.</li>}
                {h.salarios.map((s, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-semibold text-foreground">{formatCurrencyBRL(s.valor)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateOnlyISO(s.inicio_vigencia)} → {s.fim_vigencia ? formatDateOnlyISO(s.fim_vigencia) : "vigente"}
                    </span>
                    {s.motivo && <span className="w-full text-xs text-muted-foreground">{s.motivo}</span>}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="mb-2 font-display text-sm font-bold text-foreground">Competências</h4>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {h.competencias.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhuma folha.</li>}
                {h.competencias.map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-foreground">{formatDateOnlyISO(c.competencia).slice(3)}</span>
                    <span className="text-xs text-muted-foreground">
                      Proventos {formatCurrencyBRL(c.proventos)} · Descontos {formatCurrencyBRL(c.descontos)}
                    </span>
                    <span className="ml-auto font-semibold text-foreground">{formatCurrencyBRL(c.total)}</span>
                    <span className="text-xs text-muted-foreground">Pago: {formatCurrencyBRL(c.pago)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="mb-2 font-display text-sm font-bold text-foreground">Pagamentos</h4>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {h.pagamentos.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum pagamento.</li>}
                {h.pagamentos.map((p, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="text-xs text-muted-foreground">{formatDateOnlyISO(p.data)}</span>
                    <span className="font-semibold text-primary">{formatCurrencyBRL(p.valor)}</span>
                    {p.observacao && <span className="text-xs text-muted-foreground">{p.observacao}</span>}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
