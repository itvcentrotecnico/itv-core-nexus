import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatDateOnlyISO, todayManausISO } from "@/lib/format";
import {
  diasNaItv,
  faixaDias,
  inicioSemanaISO,
  rpcOp,
  somaSemanasISO,
  type MotivoPendencia,
  type OperacionalSemana,
  type PendenciaOperacional,
} from "@/lib/operacional";
import { cn } from "@/lib/utils";

/**
 * Fechamento semanal (segunda a domingo, America/Manaus):
 * entradas informadas + entregas concluídas → saldo que precisa ser explicado por motivo.
 */
export function FechamentoSemanal({ motivoFiltro }: { motivoFiltro?: string }) {
  const queryClient = useQueryClient();
  const { can, isAdmin } = useAccess();
  const podeEditar = isAdmin || can("operacional", "editar") || can("operacional", "criar");
  const podeFechar = isAdmin || can("operacional", "fechar");
  const podeReabrir = isAdmin || can("operacional", "reabrir");

  const hoje = useMemo(todayManausISO, []);
  const [ref, setRef] = useState(() => inicioSemanaISO(todayManausISO()));
  const [entradas, setEntradas] = useState("");
  const [pendencia, setPendencia] = useState<Partial<PendenciaOperacional> | null>(null);
  const [reabrir, setReabrir] = useState(false);
  const [motivoReabertura, setMotivoReabertura] = useState("");

  const semanaQuery = useQuery({
    queryKey: ["operacional", "semana", ref],
    queryFn: () => rpcOp<OperacionalSemana>("operacional_semana", { p_ref: ref }),
  });

  const motivosQuery = useQuery({
    queryKey: ["operacional", "motivos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("motivos_pendencia").select("*").order("ordem");
      if (error) throw new Error("Não foi possível carregar os motivos.");
      return (data ?? []) as unknown as MotivoPendencia[];
    },
  });

  const semana = semanaQuery.data;

  const pendenciasQuery = useQuery({
    queryKey: ["operacional", "pendencias", semana?.fechamento_id ?? ref],
    enabled: !!semana,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pendencias_operacionais")
        .select("*, motivo:motivos_pendencia(nome), tecnico:profiles!pendencias_operacionais_tecnico_id_fkey(full_name)")
        .eq("fechamento_id", semana?.fechamento_id ?? "")
        .order("data_entrada");
      if (error) throw new Error("Não foi possível carregar as pendências.");
      return (data ?? []) as unknown as PendenciaOperacional[];
    },
  });

  const salvarEntradas = useMutation({
    mutationFn: async () => {
      const qtd = Number(entradas);
      if (!Number.isFinite(qtd) || qtd < 0) throw new Error("Informe uma quantidade válida de TVs recebidas.");
      return rpcOp<{ ok?: boolean; message?: string }>("operacional_entradas_registrar", {
        p_ref: ref,
        p_quantidade: Math.round(qtd),
        p_fonte: "manual",
      });
    },
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.message ?? "Não foi possível registrar as entradas.");
        return;
      }
      toast.success("Entradas da semana registradas.");
      setEntradas("");
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const salvarPendencia = useMutation({
    mutationFn: async () => {
      const p = pendencia;
      if (!p?.os?.trim()) throw new Error("Informe a OS.");
      if (!p.motivo_id) throw new Error("Selecione o motivo da permanência.");
      return rpcOp<{ ok?: boolean; message?: string }>("operacional_pendencia_salvar", {
        p_ref: ref,
        p_os: p.os.trim(),
        p_motivo_id: p.motivo_id,
        p_observacao: p.observacao ?? null,
        p_tecnico_id: p.tecnico_id ?? null,
        p_data_entrada: p.data_entrada ?? null,
        p_cliente: p.cliente ?? null,
        p_marca: p.marca ?? null,
        p_modelo: p.modelo ?? null,
        p_polegadas: p.polegadas ?? null,
        p_id: p.id ?? null,
      });
    },
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.message ?? "Não foi possível salvar a pendência.");
        return;
      }
      toast.success("Pendência registrada.");
      setPendencia(null);
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removerPendencia = useMutation({
    mutationFn: (id: string) => rpcOp("operacional_pendencia_remover", { p_id: id }),
    onSuccess: () => {
      toast.success("Pendência removida.");
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fechar = useMutation({
    mutationFn: () => rpcOp<{ ok?: boolean; message?: string }>("operacional_fechar_semana", { p_ref: ref }),
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.message ?? "Ainda há TVs sem explicação nesta semana.");
        return;
      }
      toast.success("Semana fechada.");
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reabrirSemana = useMutation({
    mutationFn: () => {
      if (!motivoReabertura.trim()) throw new Error("Informe o motivo da reabertura.");
      return rpcOp<{ ok?: boolean; message?: string }>("operacional_reabrir_semana", { p_ref: ref, p_motivo: motivoReabertura.trim() });
    },
    onSuccess: (res) => {
      if (res && res.ok === false) {
        toast.error(res.message ?? "Não foi possível reabrir a semana.");
        return;
      }
      toast.success("Semana reaberta.");
      setReabrir(false);
      setMotivoReabertura("");
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const motivos = motivosQuery.data ?? [];
  const pendencias = (pendenciasQuery.data ?? []).filter((p) => !motivoFiltro || p.motivo_id === motivoFiltro);

  if (semanaQuery.isLoading) return <p className="text-sm text-muted-foreground">Carregando a semana…</p>;
  if (semanaQuery.isError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {(semanaQuery.error as Error).message}
      </p>
    );
  }
  if (!semana) return null;

  const faltam = Math.max(0, semana.saldo - semana.classificadas);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4">
        <div>
          <p className="font-display text-base font-bold text-foreground">
            Semana {semana.semana}/{semana.ano} · {formatDateOnlyISO(semana.inicio)} a {formatDateOnlyISO(semana.fim)}
          </p>
          <p className="text-xs text-muted-foreground">
            {semana.status === "fechado" ? "Semana fechada" : semana.status === "reaberto" ? "Semana reaberta" : "Semana aberta"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setRef(somaSemanasISO(ref, -1))}>Semana anterior</Button>
          <Button size="sm" variant="outline" onClick={() => setRef(inicioSemanaISO(hoje))}>Semana atual</Button>
          <Button size="sm" variant="outline" onClick={() => setRef(somaSemanasISO(ref, 1))} disabled={ref >= inicioSemanaISO(hoje)}>
            Próxima
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { l: "TVs recebidas", v: semana.entradas_informadas ? String(semana.entradas) : "—" },
          { l: "Entregues", v: String(semana.entregas) },
          { l: "Saldo não entregue", v: String(semana.saldo) },
          { l: "Explicadas", v: `${semana.classificadas}/${semana.saldo}` },
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-border bg-card p-4">
            <p className="font-display text-2xl font-bold text-foreground">{k.v}</p>
            <p className="text-xs text-muted-foreground">{k.l}</p>
          </div>
        ))}
      </div>

      {semana.saidas_maiores && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          As entregas do período superaram as entradas: as TVs entregues não são necessariamente as recebidas nesta semana.
        </p>
      )}

      {podeEditar && semana.status !== "fechado" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <label className={labelClass} htmlFor="entradas">TVs recebidas na semana (informado pelo Operacional)</label>
          <div className="flex gap-2">
            <input
              id="entradas"
              type="number"
              min={0}
              className={inputClass}
              value={entradas}
              onChange={(e) => setEntradas(e.target.value)}
              placeholder={semana.entradas_informadas ? String(semana.entradas) : "Ex.: 42"}
            />
            <Button onClick={() => salvarEntradas.mutate()} disabled={salvarEntradas.isPending}>Salvar</Button>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            O sistema não integra automaticamente o INFOR OS: informe a quantidade recebida no período.
          </p>
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-bold text-foreground">Por que as TVs continuam na ITV</h3>
          {podeEditar && semana.status !== "fechado" && (
            <Button size="sm" onClick={() => setPendencia({ data_entrada: hoje })}>Adicionar TV</Button>
          )}
        </div>

        {faltam > 0 && (
          <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
            Faltam explicar {faltam} TV(s) para fechar a semana.
          </p>
        )}

        {pendencias.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma TV classificada nesta semana.</p>
        ) : (
          <ul className="space-y-2">
            {pendencias.map((p) => {
              const dias = diasNaItv(p.data_entrada, hoje);
              const faixa = faixaDias(dias);
              return (
                <li key={p.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">OS {p.os} · {p.motivo?.nome ?? "Motivo"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[p.cliente, p.marca, p.modelo, p.polegadas ? `${p.polegadas}"` : null].filter(Boolean).join(" · ") || "Sem dados da TV"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Entrada {formatDateOnlyISO(p.data_entrada)} · {dias} dia(s) na ITV · {p.tecnico?.full_name ?? "Sem técnico"}
                      </p>
                      {p.observacao && <p className="mt-1 text-xs text-muted-foreground">{p.observacao}</p>}
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", faixa.className)}>{faixa.label}</span>
                  </div>
                  {podeEditar && semana.status !== "fechado" && (
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setPendencia(p)}>Editar</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removerPendencia.mutate(p.id)}>
                        Remover
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {podeFechar && semana.status !== "fechado" && (
          <Button onClick={() => fechar.mutate()} disabled={fechar.isPending}>Fechar semana</Button>
        )}
        {podeReabrir && semana.status === "fechado" && (
          <Button variant="outline" onClick={() => setReabrir(true)}>Reabrir semana</Button>
        )}
      </div>

      <Dialog open={!!pendencia} onOpenChange={(v) => !v && setPendencia(null)}>
        <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{pendencia?.id ? "Editar TV pendente" : "Adicionar TV pendente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="p-os">OS</label>
              <input id="p-os" className={inputClass} value={pendencia?.os ?? ""} onChange={(e) => setPendencia((p) => ({ ...p, os: e.target.value }))} />
            </div>
            <div>
              <label className={labelClass} htmlFor="p-motivo">Motivo da permanência</label>
              <select id="p-motivo" className={inputClass} value={pendencia?.motivo_id ?? ""} onChange={(e) => setPendencia((p) => ({ ...p, motivo_id: e.target.value }))}>
                <option value="">Selecione</option>
                {motivos.filter((m) => m.ativo).map((m) => (
                  <option key={m.id} value={m.id}>{m.nome}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} htmlFor="p-entrada">Entrada na ITV</label>
                <input id="p-entrada" type="date" className={inputClass} value={pendencia?.data_entrada ?? hoje} onChange={(e) => setPendencia((p) => ({ ...p, data_entrada: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-cliente">Cliente</label>
                <input id="p-cliente" className={inputClass} value={pendencia?.cliente ?? ""} onChange={(e) => setPendencia((p) => ({ ...p, cliente: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-marca">Marca</label>
                <input id="p-marca" className={inputClass} value={pendencia?.marca ?? ""} onChange={(e) => setPendencia((p) => ({ ...p, marca: e.target.value }))} />
              </div>
              <div>
                <label className={labelClass} htmlFor="p-modelo">Modelo</label>
                <input id="p-modelo" className={inputClass} value={pendencia?.modelo ?? ""} onChange={(e) => setPendencia((p) => ({ ...p, modelo: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="p-obs">Observação</label>
              <textarea id="p-obs" className={`${inputClass} min-h-20`} value={pendencia?.observacao ?? ""} onChange={(e) => setPendencia((p) => ({ ...p, observacao: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendencia(null)}>Cancelar</Button>
              <Button onClick={() => salvarPendencia.mutate()} disabled={salvarPendencia.isPending}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reabrir} onOpenChange={setReabrir}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reabrir semana</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className={labelClass} htmlFor="r-motivo">Motivo da reabertura</label>
              <textarea id="r-motivo" className={`${inputClass} min-h-24`} value={motivoReabertura} onChange={(e) => setMotivoReabertura(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReabrir(false)}>Cancelar</Button>
              <Button onClick={() => reabrirSemana.mutate()} disabled={reabrirSemana.isPending}>Confirmar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
