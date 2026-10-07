import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Carregando, PillStatus, SecaoAdmin, SemDados, TabelaAdmin } from "@/components/admin/shared";
import { inputClass, labelClass } from "@/lib/caixa";
import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import {
  AVALIACAO_STATUS,
  FORMAS_CONFERENCIA,
  taxaConversao,
  type ComissaoEntrega,
  type ComissaoEntregaResumo,
} from "@/lib/comissao-entrega";

const BUCKET = "comissao-entrega-comprovantes";

function fmtDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Manaus",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function pct(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

interface Props {
  itens: ComissaoEntrega[];
  resumo: ComissaoEntregaResumo[];
  carregando: boolean;
  podeConferir: boolean;
}

export function ConferenciaAvaliacoes({ itens, resumo, carregando, podeConferir }: Props) {
  const queryClient = useQueryClient();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<"aguardando" | "todas">("aguardando");
  const [dialogo, setDialogo] = useState<{ ids: string[]; aprovar: boolean } | null>(null);
  const [forma, setForma] = useState<string>(FORMAS_CONFERENCIA[0]);
  const [obs, setObs] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  const comAvaliacao = useMemo(
    () =>
      itens.filter(
        (i) =>
          i.tipo === "entrega_avaliacao" &&
          i.status !== "cancelada" &&
          (filtro === "todas" || i.avaliacao_status === "aguardando"),
      ),
    [itens, filtro],
  );

  const total = useMemo(() => {
    const t = resumo.reduce(
      (a, r) => ({
        entregas: a.entregas + Number(r.entregas),
        informadas: a.informadas + Number(r.com_avaliacao),
        validadas: a.validadas + Number(r.avaliacoes_confirmadas),
        naoValidadas: a.naoValidadas + Number(r.avaliacoes_nao_validadas ?? 0),
        aguardando: a.aguardando + Number(r.avaliacoes_aguardando ?? 0),
        base: a.base + Number(r.comissao_base ?? 0),
        bonus: a.bonus + Number(r.bonificacao_validada ?? 0),
        pagar: a.pagar + Number(r.valor_gerado) - Number(r.valor_pago),
      }),
      { entregas: 0, informadas: 0, validadas: 0, naoValidadas: 0, aguardando: 0, base: 0, bonus: 0, pagar: 0 },
    );
    return t;
  }, [resumo]);

  function abrir(ids: string[], aprovar: boolean) {
    setForma(FORMAS_CONFERENCIA[0]);
    setObs("");
    setArquivo(null);
    setDialogo({ ids, aprovar });
  }

  async function verAnexo(path: string) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
    if (error || !data) return toast.error("Não foi possível abrir o comprovante.");
    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function confirmar() {
    if (!dialogo) return;
    if (!dialogo.aprovar && !obs.trim()) return toast.error("Informe o motivo da não validação.");
    setSalvando(true);
    let anexo: string | null = null;
    if (arquivo) {
      const ext = arquivo.name.split(".").pop() ?? "jpg";
      const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, arquivo);
      if (up.error) {
        setSalvando(false);
        return toast.error("Não foi possível enviar o comprovante.");
      }
      anexo = path;
    }
    const { data, error } = await supabase.rpc("comissao_entrega_conferir", {
      p_ids: dialogo.ids,
      p_aprovar: dialogo.aprovar,
      ...(dialogo.aprovar ? { p_forma: forma } : {}),
      ...(obs.trim() ? { p_obs: obs.trim() } : {}),
      ...(anexo ? { p_anexo: anexo } : {}),
    });
    setSalvando(false);
    const res = data as unknown as { ok: boolean; message?: string; conferidas?: number };
    if (error || !res?.ok) return toast.error(res?.message ?? "Não foi possível registrar a conferência.");
    toast.success(
      dialogo.aprovar
        ? `${res.conferidas} avaliação(ões) validada(s).`
        : `${res.conferidas} avaliação(ões) não validada(s). Comissão-base preservada.`,
    );
    setDialogo(null);
    setSelecionados(new Set());
    void queryClient.invalidateQueries({ queryKey: ["comissao-entrega"] });
  }

  const pendentesVisiveis = comAvaliacao.filter((i) => i.avaliacao_status === "aguardando");
  const todosMarcados =
    pendentesVisiveis.length > 0 && pendentesVisiveis.every((i) => selecionados.has(i.id));

  const cards: [string, string][] = [
    ["Entregas realizadas", String(total.entregas)],
    ["Avaliações informadas", String(total.informadas)],
    ["Avaliações validadas", String(total.validadas)],
    ["Não validadas", String(total.naoValidadas)],
    ["Aguardando conferência", String(total.aguardando)],
    ["Comissão-base", formatCurrencyBRL(total.base)],
    ["Bonificações validadas", formatCurrencyBRL(total.bonus)],
    ["Total a pagar (validado)", formatCurrencyBRL(total.pagar)],
    ["Conversão em avaliações", pct(taxaConversao(total.validadas, total.entregas))],
  ];

  return (
    <div className="space-y-6">
      <SecaoAdmin
        titulo="Painel de conferência"
        descricao="O motorista informa, a Gerência confere, o sistema calcula. O Financeiro paga somente o valor validado."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map(([l, v]) => (
            <div key={l} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="mt-1 font-semibold text-foreground">{v}</p>
            </div>
          ))}
        </div>
        {resumo.length > 0 ? (
          <div className="mt-4">
            <TabelaAdmin
              cabecalho={["Motorista", "Entregas", "Informadas", "Validadas", "Não validadas", "Aguardando", "Base", "Bonificação", "Conversão"]}
            >
              {resumo.map((r) => (
                <tr key={r.entregador_id}>
                  <td className="px-3 py-2 font-medium text-foreground">{r.entregador}</td>
                  <td className="px-3 py-2">{r.entregas}</td>
                  <td className="px-3 py-2">{r.com_avaliacao}</td>
                  <td className="px-3 py-2">{r.avaliacoes_confirmadas}</td>
                  <td className="px-3 py-2">{r.avaliacoes_nao_validadas}</td>
                  <td className="px-3 py-2">{r.avaliacoes_aguardando}</td>
                  <td className="px-3 py-2">{formatCurrencyBRL(Number(r.comissao_base))}</td>
                  <td className="px-3 py-2">{formatCurrencyBRL(Number(r.bonificacao_validada))}</td>
                  <td className="px-3 py-2 font-semibold">
                    {pct(taxaConversao(Number(r.avaliacoes_confirmadas), Number(r.entregas)))}
                  </td>
                </tr>
              ))}
            </TabelaAdmin>
          </div>
        ) : null}
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Conferência de avaliações"
        descricao="A bonificação de avaliação só entra no pagamento depois de aprovada aqui."
        acoes={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={filtro === "aguardando" ? "default" : "outline"} onClick={() => setFiltro("aguardando")}>
              Aguardando
            </Button>
            <Button size="sm" variant={filtro === "todas" ? "default" : "outline"} onClick={() => setFiltro("todas")}>
              Todas
            </Button>
          </div>
        }
      >
        {podeConferir && selecionados.size > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-muted p-2 text-sm">
            <span>{selecionados.size} selecionada(s)</span>
            <Button size="sm" onClick={() => abrir([...selecionados], true)}>Aprovar avaliação</Button>
            <Button size="sm" variant="outline" onClick={() => abrir([...selecionados], false)}>Não validar</Button>
          </div>
        ) : null}
        {carregando ? (
          <Carregando />
        ) : comAvaliacao.length === 0 ? (
          <SemDados label={filtro === "aguardando" ? "Nenhuma avaliação aguardando conferência" : "Nenhuma entrega com avaliação no período"} />
        ) : (
          <TabelaAdmin
            cabecalho={[
              podeConferir ? (
                <input
                  key="all"
                  type="checkbox"
                  aria-label="Selecionar todas"
                  checked={todosMarcados}
                  onChange={(e) =>
                    setSelecionados(e.target.checked ? new Set(pendentesVisiveis.map((i) => i.id)) : new Set())
                  }
                />
              ) : "",
              "OS", "Cliente", "Data", "Motorista", "Base", "Bonificação", "Total solicitado",
              "Comprovação", "Situação", "Conferido por", "Ações",
            ] as unknown as string[]}
          >
            {comAvaliacao.map((i) => {
              const st = AVALIACAO_STATUS[i.avaliacao_status];
              const aguardando = i.avaliacao_status === "aguardando";
              return (
                <tr key={i.id}>
                  <td className="px-3 py-2">
                    {podeConferir && aguardando ? (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar OS ${i.os ?? ""}`}
                        checked={selecionados.has(i.id)}
                        onChange={(e) =>
                          setSelecionados((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(i.id);
                            else n.delete(i.id);
                            return n;
                          })
                        }
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{i.os ?? "—"}</td>
                  <td className="px-3 py-2">{i.cliente ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateOnlyISO(i.data)}</td>
                  <td className="px-3 py-2 font-medium text-foreground">{i.entregador}</td>
                  <td className="px-3 py-2">{formatCurrencyBRL(Number(i.valor_base))}</td>
                  <td className="px-3 py-2">{formatCurrencyBRL(Number(i.bonificacao_solicitada))}</td>
                  <td className="px-3 py-2">
                    {formatCurrencyBRL(Number(i.valor_base) + Number(i.bonificacao_solicitada))}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {i.conferencia_forma ?? i.avaliacao_observacao ?? "—"}
                    {i.conferencia_obs ? <span className="block">{i.conferencia_obs}</span> : null}
                    {i.conferencia_anexo_path ? (
                      <button type="button" className="block text-primary underline" onClick={() => void verAnexo(i.conferencia_anexo_path!)}>
                        Ver anexo
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2"><PillStatus tom={st.tom}>{st.label}</PillStatus></td>
                  <td className="px-3 py-2 text-xs">
                    {i.conferido_por ?? "—"}
                    <span className="block text-muted-foreground">{fmtDataHora(i.conferido_em)}</span>
                  </td>
                  <td className="px-3 py-2">
                    {podeConferir && aguardando ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => abrir([i.id], true)}>Aprovar</Button>
                        <Button size="sm" variant="outline" onClick={() => abrir([i.id], false)}>Não validar</Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </TabelaAdmin>
        )}
      </SecaoAdmin>

      <Dialog open={!!dialogo} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogo?.aprovar ? "Aprovar avaliação" : "Não validar avaliação"} ({dialogo?.ids.length})
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {dialogo?.aprovar
              ? "Entrega R$ 5,00 + bonificação R$ 2,50 = comissão final R$ 7,50 (Validado)."
              : "Entrega R$ 5,00 preservada · bonificação R$ 0,00 (Avaliação não validada)."}
          </p>
          <div className="space-y-3">
            {dialogo?.aprovar ? (
              <div>
                <label className={labelClass} htmlFor="conf-forma">Forma de comprovação *</label>
                <select id="conf-forma" className={inputClass} value={forma} onChange={(e) => setForma(e.target.value)}>
                  {FORMAS_CONFERENCIA.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
            ) : null}
            <div>
              <label className={labelClass} htmlFor="conf-obs">
                {dialogo?.aprovar ? "Observação (opcional)" : "Motivo *"}
              </label>
              <input id="conf-obs" className={inputClass} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="conf-anexo">Anexo (print/foto, opcional)</label>
              <input id="conf-anexo" type="file" accept="image/*,application/pdf" className="text-sm"
                onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>Voltar</Button>
            <Button disabled={salvando} onClick={() => void confirmar()}>
              {salvando ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
