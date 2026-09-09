import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import {
  linhaVazia,
  paraPayload,
  parsearColagem,
  rpcTerc,
  SITUACAO_ITEM,
  
  type LinhaEntrada,
  type PreviaLote,
} from "@/lib/terceirizados";
import {
  EWERTON_COMPETENCIA,
  EWERTON_DESCRICAO,
  EWERTON_TOTAL_ESPERADO,
  linhasEwerton,
} from "@/lib/terceirizados-ewerton";
import { cn } from "@/lib/utils";

export interface PrestadorOpcao {
  id: string;
  nome: string;
}

type Etapa = "entrada" | "previa" | "resultado";

interface Resultado {
  lote_id: string;
  quantidade: number;
  total: number;
}

/**
 * Assistente de lançamento em lote: entrada → prévia validada → confirmação humana.
 * Nada é gravado antes do botão "Confirmar lançamento do lote".
 */
export function LoteDialog({
  aberto,
  prestadores,
  onFechar,
  onVerLote,
}: {
  aberto: boolean;
  prestadores: PrestadorOpcao[];
  onFechar: () => void;
  onVerLote: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [etapa, setEtapa] = useState<Etapa>("entrada");
  const [prestadorId, setPrestadorId] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [descricao, setDescricao] = useState("");
  const [origem, setOrigem] = useState("manual");
  const [totalEsperado, setTotalEsperado] = useState("");
  const [teste, setTeste] = useState(false);
  const [linhas, setLinhas] = useState<LinhaEntrada[]>([linhaVazia()]);
  const [colagem, setColagem] = useState("");
  const [previa, setPrevia] = useState<PreviaLote | null>(null);
  const [motivoDup, setMotivoDup] = useState("");
  const [revisado, setRevisado] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const idemRef = useRef<string>(crypto.randomUUID());

  const prestador = prestadores.find((p) => p.id === prestadorId);

  function reiniciar() {
    setEtapa("entrada");
    setPrestadorId("");
    setCompetencia("");
    setDescricao("");
    setOrigem("manual");
    setTotalEsperado("");
    setTeste(false);
    setLinhas([linhaVazia()]);
    setColagem("");
    setPrevia(null);
    setMotivoDup("");
    setRevisado(false);
    setResultado(null);
    idemRef.current = crypto.randomUUID();
  }

  const somaLocal = useMemo(
    () => linhas.reduce((acc, l) => acc + (Number(l.valor.replace(",", ".")) || 0), 0),
    [linhas],
  );

  const validar = useMutation({
    mutationFn: async () => {
      if (!prestadorId) throw new Error("Selecione o prestador do lote.");
      if (!competencia) throw new Error("Informe a competência do lote.");
      const uteis = linhas.filter(
        (l) => l.os.trim() || l.referencia.trim() || l.descricao_servico.trim() || l.valor.trim(),
      );
      if (uteis.length === 0) throw new Error("Informe ao menos um serviço.");
      return rpcTerc<PreviaLote>("terceirizados_lote_validar", {
        p_prestador_id: prestadorId,
        p_competencia: `${competencia}-01`,
        p_itens: paraPayload(uteis),
        p_total_esperado: totalEsperado.trim()
          ? Number(totalEsperado.replace(/\./g, "").replace(",", "."))
          : null,
      });
    },
    onSuccess: (res) => {
      if (!res?.ok) {
        toast.error(res?.message ?? "Não foi possível validar todos os serviços.");
        return;
      }
      setPrevia(res);
      setEtapa("previa");
      if (res.erros > 0)
        toast.warning("Não foi possível validar todos os serviços. Revise os itens destacados.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmar = useMutation({
    mutationFn: async () => {
      if (!previa) throw new Error("Gere a prévia antes de confirmar.");
      const uteis = linhas.filter(
        (l) => l.os.trim() || l.referencia.trim() || l.descricao_servico.trim() || l.valor.trim(),
      );
      const res = await rpcTerc<{
        ok: boolean;
        message?: string;
        lote_id?: string;
        quantidade?: number;
        total?: number;
        repetido?: boolean;
      }>("terceirizados_lote_confirmar", {
        p_prestador_id: prestadorId,
        p_competencia: `${competencia}-01`,
        p_itens: paraPayload(uteis),
        p_idempotency_key: idemRef.current,
        p_descricao: descricao.trim() || null,
        p_origem_lote: origem,
        p_total_esperado: totalEsperado.trim()
          ? Number(totalEsperado.replace(/\./g, "").replace(",", "."))
          : null,
        p_teste: teste,
        p_duplicidades: motivoDup.trim() ? { motivo: motivoDup.trim() } : {},
      });
      if (!res.ok) throw new Error(res.message ?? "Não foi possível registrar o lote.");
      return res;
    },
    onSuccess: (res) => {
      setResultado({
        lote_id: res.lote_id!,
        quantidade: res.quantidade ?? previa?.quantidade ?? 0,
        total: Number(res.total ?? previa?.total_calculado ?? 0),
      });
      setEtapa("resultado");
      void queryClient.invalidateQueries({ queryKey: ["terceirizados"] });
    },
    onError: (e: Error) =>
      toast.error(
        e.message ||
          "Não foi possível registrar o lote. Nenhum lançamento incompleto foi confirmado. Tente novamente.",
      ),
  });

  function atualizar(id: string, campo: keyof LinhaEntrada, valor: string) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
    setPrevia(null);
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o && !confirmar.isPending) {
          onFechar();
          reiniciar();
        }
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar serviços em lote</DialogTitle>
        </DialogHeader>

        {etapa === "entrada" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="lote-prestador">
                  Prestador
                </label>
                <select
                  id="lote-prestador"
                  className={inputClass}
                  value={prestadorId}
                  onChange={(e) => setPrestadorId(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {prestadores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="lote-competencia">
                  Competência
                </label>
                <input
                  id="lote-competencia"
                  type="month"
                  className={inputClass}
                  value={competencia}
                  onChange={(e) => setCompetencia(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lote-total">
                  Total esperado (opcional)
                </label>
                <input
                  id="lote-total"
                  className={inputClass}
                  value={totalEsperado}
                  onChange={(e) => setTotalEsperado(e.target.value)}
                  placeholder="Ex.: 3030,00"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="lote-origem">
                  Origem do lote
                </label>
                <select
                  id="lote-origem"
                  className={inputClass}
                  value={origem}
                  onChange={(e) => setOrigem(e.target.value)}
                >
                  <option value="manual">Manual</option>
                  <option value="planilha">Planilha</option>
                  <option value="pdf">PDF</option>
                  <option value="excel">Excel</option>
                  <option value="importacao_estruturada">Importação estruturada</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="lote-descricao">
                  Descrição do lote (opcional)
                </label>
                <input
                  id="lote-descricao"
                  className={inputClass}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex.: serviços terceirizados de agosto"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={teste}
                onChange={(e) => setTeste(e.target.checked)}
                className="size-4 accent-primary"
              />
              Este é um lote de teste (homologação)
            </label>

            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-semibold">Planilha Ewerton — Agosto/2026</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Preenche os 39 serviços do Ewerton (total esperado R$ 3.030,00) para conferência.
                Nada é gravado: depois é preciso validar, revisar a prévia e confirmar.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  const ew = prestadores.find((p) => p.nome.trim().toUpperCase() === "EWERTON");
                  if (!ew) {
                    toast.error("O prestador Ewerton não foi encontrado no cadastro.");
                    return;
                  }
                  setPrestadorId(ew.id);
                  setCompetencia(EWERTON_COMPETENCIA);
                  setDescricao(EWERTON_DESCRICAO);
                  setOrigem("planilha");
                  setTotalEsperado(EWERTON_TOTAL_ESPERADO);
                  setTeste(false);
                  setLinhas(linhasEwerton());
                  setPrevia(null);
                  toast.success("39 serviços carregados para conferência.");
                }}
              >
                Carregar planilha Ewerton — Agosto/2026
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <label className={labelClass} htmlFor="lote-colagem">
                Colar serviços (uma linha por serviço; colunas separadas por TAB ou ponto e vírgula)
              </label>
              <Textarea
                id="lote-colagem"
                rows={3}
                value={colagem}
                onChange={(e) => setColagem(e.target.value)}
                placeholder="Data; OS; Referência; Marca; Modelo; Polegadas; Serviço; Valor"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  const novas = parsearColagem(colagem);
                  if (novas.length === 0) {
                    toast.error("Nada reconhecido no texto colado.");
                    return;
                  }
                  setLinhas((atual) => [
                    ...atual.filter((l) => l.descricao_servico.trim() || l.valor.trim()),
                    ...novas,
                  ]);
                  setColagem("");
                  setPrevia(null);
                  toast.success(`${novas.length} linha(s) adicionada(s) para revisão.`);
                }}
              >
                Adicionar linhas
              </Button>
            </div>

            <div className="space-y-3">
              {linhas.map((l, i) => (
                <div key={l.id} className="rounded-xl border border-border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground">Serviço {i + 1}</p>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setLinhas((a) => (a.length === 1 ? [linhaVazia()] : a.filter((x) => x.id !== l.id)));
                        setPrevia(null);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input
                      type="date"
                      className={inputClass}
                      value={l.data_execucao}
                      onChange={(e) => atualizar(l.id, "data_execucao", e.target.value)}
                      aria-label="Data do serviço"
                    />
                    <input
                      className={inputClass}
                      value={l.os}
                      onChange={(e) => atualizar(l.id, "os", e.target.value)}
                      placeholder="OS"
                      aria-label="OS"
                    />
                    <input
                      className={inputClass}
                      value={l.referencia}
                      onChange={(e) => atualizar(l.id, "referencia", e.target.value)}
                      placeholder="Referência"
                      aria-label="Referência complementar"
                    />
                    <input
                      className={inputClass}
                      value={l.valor}
                      onChange={(e) => atualizar(l.id, "valor", e.target.value)}
                      placeholder="Valor"
                      aria-label="Valor devido ao prestador"
                    />
                    <input
                      className={inputClass}
                      value={l.marca}
                      onChange={(e) => atualizar(l.id, "marca", e.target.value)}
                      placeholder="Marca"
                      aria-label="Marca"
                    />
                    <input
                      className={inputClass}
                      value={l.modelo}
                      onChange={(e) => atualizar(l.id, "modelo", e.target.value)}
                      placeholder="Modelo"
                      aria-label="Modelo"
                    />
                    <input
                      className={inputClass}
                      value={l.polegadas}
                      onChange={(e) => atualizar(l.id, "polegadas", e.target.value)}
                      placeholder="Polegadas"
                      aria-label="Polegadas"
                    />
                    <input
                      className={inputClass}
                      value={l.tipo_servico}
                      onChange={(e) => atualizar(l.id, "tipo_servico", e.target.value)}
                      placeholder="Tipo de serviço"
                      aria-label="Tipo de serviço"
                    />
                    <input
                      className={cn(inputClass, "sm:col-span-4")}
                      value={l.descricao_servico}
                      onChange={(e) => atualizar(l.id, "descricao_servico", e.target.value)}
                      placeholder="Descrição do serviço"
                      aria-label="Descrição do serviço"
                    />
                    <input
                      className={cn(inputClass, "sm:col-span-4")}
                      value={l.observacao}
                      onChange={(e) => atualizar(l.id, "observacao", e.target.value)}
                      placeholder="Observação (opcional)"
                      aria-label="Observação"
                    />

                  </div>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLinhas((a) => [...a, linhaVazia()])}
              >
                <Plus className="mr-1 size-4" /> Adicionar serviço
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">
                Soma das linhas: <strong>{formatCurrencyBRL(somaLocal)}</strong>
              </p>
              <Button onClick={() => validar.mutate()} disabled={validar.isPending}>
                {validar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                Validar e ver prévia
              </Button>
            </div>
          </div>
        )}

        {etapa === "previa" && previa && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="font-display text-base font-bold">Revisão do lote</h3>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Prestador</dt>
                  <dd className="font-medium">{prestador?.nome ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Competência</dt>
                  <dd className="font-medium">{competencia || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Quantidade de serviços</dt>
                  <dd className="font-medium">{previa.quantidade}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Valor total calculado</dt>
                  <dd className="font-medium">{formatCurrencyBRL(Number(previa.total_calculado))}</dd>
                </div>
              </dl>
              {previa.total_esperado !== null && (
                <div
                  className={cn(
                    "mt-3 rounded-lg p-3 text-sm",
                    previa.conciliado
                      ? "bg-primary/10 text-primary"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  Total esperado: {formatCurrencyBRL(Number(previa.total_esperado))} · Calculado:{" "}
                  {formatCurrencyBRL(Number(previa.total_calculado))} · Diferença:{" "}
                  {formatCurrencyBRL(Number(previa.diferenca ?? 0))} —{" "}
                  <strong>{previa.conciliado ? "CONCILIADO" : "DIVERGENTE"}</strong>
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {previa.erros} erro(s) · {previa.atencoes} atenção(ões) · {previa.duplicidades}{" "}
                possível(is) duplicidade(s) · {previa.duplicidades_exatas} duplicidade(s) exata(s).
                Nada foi gravado ainda.
              </p>
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">OS</th>
                    <th className="px-3 py-2">Referência</th>
                    <th className="px-3 py-2">Marca</th>
                    <th className="px-3 py-2">Modelo</th>
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">Valor</th>
                    <th className="px-3 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {previa.itens.map((i) => (
                    <tr key={i.linha}>
                      <td className="px-3 py-2">
                        {i.data_execucao ? formatDateOnlyISO(i.data_execucao) : "—"}
                      </td>
                      <td className="px-3 py-2">{i.os ?? "—"}</td>
                      <td className="px-3 py-2">{i.referencia ?? "—"}</td>
                      <td className="px-3 py-2">{i.marca ?? "—"}</td>
                      <td className="px-3 py-2">{i.modelo ?? "—"}</td>
                      <td className="px-3 py-2">{i.descricao_servico ?? "—"}</td>
                      <td className="px-3 py-2">{formatCurrencyBRL(Number(i.valor ?? 0))}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            SITUACAO_ITEM[i.situacao].className,
                          )}
                        >
                          {SITUACAO_ITEM[i.situacao].label}
                        </span>
                        {i.mensagens.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {i.mensagens.join(" ")}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 md:hidden">
              {previa.itens.map((i) => (
                <article key={i.linha} className="rounded-xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {i.os ? `OS ${i.os}` : (i.referencia ?? "Sem referência")}
                      </p>
                      <p className="text-xs text-muted-foreground">{i.descricao_servico ?? "—"}</p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        SITUACAO_ITEM[i.situacao].className,
                      )}
                    >
                      {SITUACAO_ITEM[i.situacao].label}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-bold">{formatCurrencyBRL(Number(i.valor ?? 0))}</p>
                  {i.mensagens.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{i.mensagens.join(" ")}</p>
                  )}
                </article>
              ))}
            </div>

            {previa.duplicidades > 0 && (
              <div className="rounded-xl border border-orange-500/40 bg-orange-500/5 p-3">
                <p className="text-sm font-semibold text-orange-600">Possível duplicidade</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Existem serviços semelhantes já registrados. Para confirmar que são outros
                  serviços, informe um motivo curto (fica registrado na auditoria).
                </p>
                <input
                  className={cn(inputClass, "mt-2")}
                  value={motivoDup}
                  onChange={(e) => setMotivoDup(e.target.value)}
                  placeholder="Motivo da autorização"
                  aria-label="Motivo da autorização de duplicidade"
                />
              </div>
            )}

            {previa.duplicidades_exatas > 0 && (
              <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                Há serviços idênticos já registrados. Ajuste ou remova esses itens antes de
                confirmar.
              </p>
            )}

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={revisado}
                onChange={(e) => setRevisado(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              Revisei os serviços e confirmo os valores apresentados.
            </label>

            <p className="text-sm text-muted-foreground">
              Você está prestes a registrar {previa.quantidade} serviços terceirizados no valor total
              de {formatCurrencyBRL(Number(previa.total_calculado))}.
            </p>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              <Button variant="outline" onClick={() => setEtapa("entrada")} disabled={confirmar.isPending}>
                Voltar e corrigir
              </Button>
              <Button
                onClick={() => confirmar.mutate()}
                disabled={
                  confirmar.isPending ||
                  !revisado ||
                  !previa.pode_confirmar ||
                  (previa.duplicidades > 0 && motivoDup.trim().length < 3)
                }
              >
                {confirmar.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {confirmar.isPending ? "Registrando lote…" : "Confirmar lançamento do lote"}
              </Button>
            </div>
          </div>
        )}

        {etapa === "resultado" && resultado && (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
              <h3 className="font-display text-base font-bold text-primary">
                Lote registrado com sucesso
              </h3>
              <dl className="mt-2 grid gap-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Prestador</dt>
                  <dd className="font-medium">{prestador?.nome}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Serviços</dt>
                  <dd className="font-medium">{resultado.quantidade}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-medium">{formatCurrencyBRL(resultado.total)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-medium">Confirmado</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">
                O Financeiro só recebe este lote depois da liberação, feita na tela do lote.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onFechar();
                  reiniciar();
                }}
              >
                Fechar
              </Button>
              <Button
                onClick={() => {
                  const id = resultado.lote_id;
                  onFechar();
                  reiniciar();
                  onVerLote(id);
                }}
              >
                Ver lote
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
