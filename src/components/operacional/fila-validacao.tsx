import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { rpcOp } from "@/lib/operacional";
import { STATUS_PRODUCAO, type ProducaoRegistro, type ProducaoStatus } from "@/lib/producao";
import { rpcProd, StatusBadgeProducao, useProducaoRefs } from "@/components/producao/shared";
import { DetalheProducaoDialog } from "@/components/producao/detalhe-dialog";

type Acao = "validar" | "correcao" | "rejeitar" | "tecnico" | "tipo";

const STATUS_FILA: ProducaoStatus[] = [
  "enviado_validacao",
  "correcao_solicitada",
  "validado",
  "rejeitado",
  "rascunho",
];

/** Fila de validação técnica — autoridade do Gerente Operacional. */
export function FilaValidacao() {
  const queryClient = useQueryClient();
  const { can, isAdmin } = useAccess();
  const { tipos, tecnicos } = useProducaoRefs();
  const podeValidar = isAdmin || can("operacional", "validar") || can("producao", "validar");
  const podeAlterarTecnico = isAdmin || can("operacional", "atribuir");
  const podeEditar = isAdmin || can("operacional", "editar") || can("producao", "editar");

  const [status, setStatus] = useState<ProducaoStatus | "">("enviado_validacao");
  const [tecnicoId, setTecnicoId] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [busca, setBusca] = useState("");
  const [detalhe, setDetalhe] = useState<ProducaoRegistro | null>(null);
  const [acao, setAcao] = useState<{ tipo: Acao; registro: ProducaoRegistro } | null>(null);
  const [texto, setTexto] = useState("");
  const [novoTecnico, setNovoTecnico] = useState("");
  const [novoTipo, setNovoTipo] = useState("");

  const hoje = useMemo(todayManausISO, []);

  const listaQuery = useQuery({
    queryKey: ["operacional", "fila", status, tecnicoId, tipoId, busca],
    queryFn: async () => {
      let q = supabase
        .from("producao_tecnica")
        .select(
          "*, tecnico:profiles!producao_tecnica_tecnico_id_fkey(full_name), tipo_servico:tipos_servico_tecnico(nome)",
        )
        .order("enviado_em", { ascending: true, nullsFirst: false })
        .limit(200);
      if (status) q = q.eq("status", status);
      if (tecnicoId) q = q.eq("tecnico_id", tecnicoId);
      if (tipoId) q = q.eq("tipo_servico_id", tipoId);
      if (busca.trim()) {
        const t = busca.trim();
        q = q.or(
          `os.ilike.%${t}%,cliente.ilike.%${t}%,marca_tv.ilike.%${t}%,modelo_tv.ilike.%${t}%`,
        );
      }
      const { data, error } = await q;
      if (error) throw new Error("Não foi possível carregar a fila de validação agora.");
      return (data ?? []) as unknown as ProducaoRegistro[];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const alvo = acao;
      if (!alvo) return;
      const r = alvo.registro;
      if (alvo.tipo === "validar") {
        if (!r.tipo_servico_id) throw new Error("Defina o tipo de serviço antes de validar.");
        return rpcProd<{ ok?: boolean; message?: string }>("producao_validar", {
          p_id: r.id,
          p_observacao: texto || null,
        });
      }
      if (alvo.tipo === "correcao") {
        if (!texto.trim()) throw new Error("Descreva o que precisa ser corrigido.");
        return rpcProd("producao_solicitar_correcao", { p_id: r.id, p_comentario: texto.trim() });
      }
      if (alvo.tipo === "rejeitar") {
        if (!texto.trim()) throw new Error("Informe o motivo da rejeição.");
        return rpcProd("producao_rejeitar", { p_id: r.id, p_motivo: texto.trim() });
      }
      if (alvo.tipo === "tecnico") {
        if (!novoTecnico) throw new Error("Selecione o técnico responsável.");
        if (!texto.trim()) throw new Error("Informe o motivo da alteração de técnico.");
        return rpcOp("operacional_alterar_tecnico", {
          p_producao_id: r.id,
          p_tecnico_id: novoTecnico,
          p_motivo: texto.trim(),
        });
      }
      if (!novoTipo) throw new Error("Selecione o tipo de serviço.");
      return rpcProd("producao_atualizar", {
        p_id: r.id,
        p_data_execucao: r.data_execucao,
        p_cliente: r.cliente,
        p_marca_tv: r.marca_tv,
        p_modelo_tv: r.modelo_tv,
        p_polegadas: r.polegadas,
        p_defeito_relatado: r.defeito_relatado,
        p_diagnostico: r.diagnostico,
        p_tipo_servico_id: novoTipo,
        p_servico_executado: r.servico_executado,
        p_valor_servico: r.valor_servico,
        p_valor_mao_obra: r.valor_mao_obra,
        p_pecas_descricao: r.pecas_descricao,
        p_observacao: r.observacao,
        p_enviar: false,
      });
    },
    onSuccess: (res) => {
      const r = res as { ok?: boolean; message?: string } | undefined;
      if (r && r.ok === false) {
        toast.error(r.message ?? "Não foi possível concluir a ação.");
        return;
      }
      const alvo = acao;
      const reg = alvo?.registro;
      const quem = reg?.tecnico?.full_name ?? "Técnico";
      const os = reg?.os ? `OS ${reg.os}` : "Serviço";
      if (alvo?.tipo === "validar") {
        toast.success("✅ Serviço validado", {
          description: `${os} — ${quem}. O serviço agora faz parte da produção oficial. Próxima etapa: cálculo e liberação da comissão.`,
          duration: 7000,
        });
      } else if (alvo?.tipo === "correcao") {
        toast.success("Correção solicitada", {
          description: `${os} — ${quem}. Próximo responsável: o técnico deve corrigir e reenviar.`,
        });
      } else if (alvo?.tipo === "rejeitar") {
        toast.success("Serviço rejeitado", {
          description: `${os} — ${quem}. O registro sai da fila de validação.`,
        });
      } else if (alvo?.tipo === "tecnico") {
        toast.success("Técnico responsável alterado", {
          description: `${os}. A alteração foi registrada no histórico.`,
        });
      } else {
        toast.success("Tipo de serviço definido", { description: `${os}. Já pode ser validado.` });
      }
      setAcao(null);
      setTexto("");
      setNovoTecnico("");
      setNovoTipo("");
      void queryClient.invalidateQueries({ queryKey: ["operacional"] });
      void queryClient.invalidateQueries({ queryKey: ["producao"] });
      void queryClient.invalidateQueries({ queryKey: ["gerencia"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = listaQuery.data ?? [];

  function abrir(tipo: Acao, registro: ProducaoRegistro) {
    setAcao({ tipo, registro });
    setTexto("");
    setNovoTecnico(registro.tecnico_id ?? "");
    setNovoTipo(registro.tipo_servico_id ?? "");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="fila-status">
            Status
          </label>
          <select
            id="fila-status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProducaoStatus | "")}
          >
            <option value="">Todos</option>
            {STATUS_FILA.map((s) => (
              <option key={s} value={s}>
                {STATUS_PRODUCAO[s].label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="fila-tecnico">
            Técnico
          </label>
          <select
            id="fila-tecnico"
            className={inputClass}
            value={tecnicoId}
            onChange={(e) => setTecnicoId(e.target.value)}
          >
            <option value="">Todos</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="fila-tipo">
            Tipo de serviço
          </label>
          <select
            id="fila-tipo"
            className={inputClass}
            value={tipoId}
            onChange={(e) => setTipoId(e.target.value)}
          >
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="fila-busca">
            Buscar
          </label>
          <input
            id="fila-busca"
            className={inputClass}
            placeholder="OS, cliente, marca ou modelo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {listaQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Carregando serviços…</p>
      )}
      {listaQuery.isError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {(listaQuery.error as Error).message}
        </p>
      )}
      {!listaQuery.isLoading && registros.length === 0 && (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum serviço aguardando validação.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {registros.map((r) => (
          <article key={r.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-display text-base font-bold text-foreground">OS {r.os}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateOnlyISO(r.data_execucao)} ·{" "}
                  {r.tecnico?.full_name ?? "Sem técnico definido"}
                </p>
              </div>
              <StatusBadgeProducao status={r.status} />
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <div>
                <dt className="inline font-medium">TV: </dt>
                <dd className="inline">
                  {[r.marca_tv, r.modelo_tv, r.polegadas ? `${r.polegadas}"` : null]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Tipo: </dt>
                <dd className="inline">
                  {r.tipo_servico?.nome ?? <span className="text-destructive">não definido</span>}
                </dd>
              </div>
              <div>
                <dt className="inline font-medium">Valor: </dt>
                <dd className="inline">{formatCurrencyBRL(Number(r.valor_servico ?? 0))}</dd>
              </div>
              <div>
                <dt className="inline font-medium">Mão de obra: </dt>
                <dd className="inline">{formatCurrencyBRL(Number(r.valor_mao_obra ?? 0))}</dd>
              </div>
            </dl>
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.servico_executado}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDetalhe(r)}>
                Detalhes e fotos
              </Button>
              {podeValidar && r.status !== "validado" && (
                <Button size="sm" onClick={() => abrir("validar", r)}>
                  Validar
                </Button>
              )}
              {podeValidar && r.status !== "validado" && (
                <Button size="sm" variant="outline" onClick={() => abrir("correcao", r)}>
                  Solicitar correção
                </Button>
              )}
              {podeAlterarTecnico && r.status !== "validado" && (
                <Button size="sm" variant="outline" onClick={() => abrir("tecnico", r)}>
                  Alterar técnico
                </Button>
              )}
              {podeEditar && r.status !== "validado" && (
                <Button size="sm" variant="outline" onClick={() => abrir("tipo", r)}>
                  Tipo de serviço
                </Button>
              )}
              {podeValidar && r.status !== "validado" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => abrir("rejeitar", r)}
                >
                  Rejeitar
                </Button>
              )}
            </div>
            {r.status === "enviado_validacao" && r.enviado_em && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                Na fila desde {formatDateOnlyISO(r.enviado_em.slice(0, 10))} · hoje{" "}
                {formatDateOnlyISO(hoje)}
              </p>
            )}
          </article>
        ))}
      </div>

      {detalhe && (
        <DetalheProducaoDialog
          registro={detalhe}
          onClose={() => setDetalhe(null)}
          onEditar={() => setDetalhe(null)}
        />
      )}

      <Dialog open={!!acao} onOpenChange={(v) => !v && setAcao(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao?.tipo === "validar" && "Validar serviço"}
              {acao?.tipo === "correcao" && "Solicitar correção"}
              {acao?.tipo === "rejeitar" && "Rejeitar serviço"}
              {acao?.tipo === "tecnico" && "Alterar técnico responsável"}
              {acao?.tipo === "tipo" && "Confirmar tipo de serviço"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">OS {acao?.registro.os}</p>

            {acao?.tipo === "tecnico" && (
              <div>
                <label className={labelClass} htmlFor="acao-tecnico">
                  Técnico que executou
                </label>
                <select
                  id="acao-tecnico"
                  className={inputClass}
                  value={novoTecnico}
                  onChange={(e) => setNovoTecnico(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {acao?.tipo === "tipo" && (
              <div>
                <label className={labelClass} htmlFor="acao-tipo">
                  Tipo de serviço
                </label>
                <select
                  id="acao-tipo"
                  className={inputClass}
                  value={novoTipo}
                  onChange={(e) => setNovoTipo(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {tipos
                    .filter((t) => t.ativo)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {acao?.tipo !== "tipo" && (
              <div>
                <label className={labelClass} htmlFor="acao-texto">
                  {acao?.tipo === "validar" ? "Observação (opcional)" : "Motivo (obrigatório)"}
                </label>
                <textarea
                  id="acao-texto"
                  className={`${inputClass} min-h-24`}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                />
              </div>
            )}

            {acao?.tipo === "validar" && !acao.registro.tipo_servico_id && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700">
                Este serviço está sem tipo definido. Confirme o tipo antes de validar.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAcao(null)}>
                Cancelar
              </Button>
              <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
