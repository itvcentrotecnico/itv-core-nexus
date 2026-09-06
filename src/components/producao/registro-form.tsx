import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
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
import { todayManausISO } from "@/lib/format";
import { storagePathFoto, type ProducaoFoto, type ProducaoRegistro } from "@/lib/producao";
import { invalidateProducao, rpcProd, useProducaoRefs } from "./shared";
import { mensagemErro } from "@/lib/erros";

interface RpcResult {
  ok: boolean;
  code?: string;
  message?: string;
  id?: string;
}

export function RegistroProducaoDialog({
  open,
  onClose,
  registro,
}: {
  open: boolean;
  onClose: () => void;
  /** Quando informado, edita rascunho / correção solicitada. */
  registro: ProducaoRegistro | null;
}) {
  const queryClient = useQueryClient();
  const { profile } = useAccess();
  const { tipos } = useProducaoRefs();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const editando = !!registro;
  const [saving, setSaving] = useState(false);
  const [duplicidade, setDuplicidade] = useState<string | null>(null);

  const [os, setOs] = useState("");
  const [dataExecucao, setDataExecucao] = useState(todayManausISO());
  const [cliente, setCliente] = useState("");
  const [marcaTv, setMarcaTv] = useState("");
  const [modeloTv, setModeloTv] = useState("");
  const [polegadas, setPolegadas] = useState("");
  const [defeito, setDefeito] = useState("");
  const [diagnostico, setDiagnostico] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [servico, setServico] = useState("");
  const [valorServico, setValorServico] = useState<number | null>(null);
  const [valorMaoObra, setValorMaoObra] = useState<number | null>(null);
  const [pecas, setPecas] = useState("");
  const [observacao, setObservacao] = useState("");
  const [fotosNovas, setFotosNovas] = useState<File[]>([]);

  /** Pré-visualização local das fotos selecionadas (câmera ou galeria). */
  const previews = useMemo(() => fotosNovas.map((f) => URL.createObjectURL(f)), [fotosNovas]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  function adicionarFotos(list: FileList | null) {
    const novos = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (novos.length === 0) return;
    setFotosNovas((prev) => [...prev, ...novos]);
  }



  useEffect(() => {
    if (open) {
      setOs(registro?.os ?? "");
      setDataExecucao(registro?.data_execucao ?? todayManausISO());
      setCliente(registro?.cliente ?? "");
      setMarcaTv(registro?.marca_tv ?? "");
      setModeloTv(registro?.modelo_tv ?? "");
      setPolegadas(registro?.polegadas?.toString() ?? "");
      setDefeito(registro?.defeito_relatado ?? "");
      setDiagnostico(registro?.diagnostico ?? "");
      setTipoServicoId(registro?.tipo_servico_id ?? "");
      setServico(registro?.servico_executado ?? "");
      setValorServico(registro?.valor_servico ?? null);
      setValorMaoObra(registro?.valor_mao_obra ?? null);
      setPecas(registro?.pecas_descricao ?? "");
      setObservacao(registro?.observacao ?? "");
      setFotosNovas([]);
      setDuplicidade(null);
    }
  }, [open, registro]);

  async function uploadFotos(producaoId: string) {
    if (!profile || fotosNovas.length === 0) return;
    for (const file of fotosNovas) {
      const path = storagePathFoto(profile.id, producaoId, file.name);
      const { error: upErr } = await supabase.storage.from("producao").upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
      });
      if (upErr) throw new Error(`Falha ao enviar foto ${file.name}: ${upErr.message}`);
      const { error: dbErr } = await supabase.from("producao_fotos").insert({
        producao_id: producaoId,
        storage_path: path,
        tipo: "geral",
        uploaded_by: profile.id,
      } as never);
      if (dbErr) throw new Error(mensagemErro(dbErr));
    }
  }

  async function salvar(enviar: boolean, confirmarDup = false) {
    if (!os.trim()) { toast.error("Informe a OS."); return; }
    if (!servico.trim()) { toast.error("Informe o serviço executado."); return; }
    if (!dataExecucao) { toast.error("Informe a data de execução."); return; }
    setSaving(true);
    try {
      let producaoId: string;
      if (editando) {
        await rpcProd<RpcResult>("producao_atualizar", {
          p_id: registro.id,
          p_data_execucao: dataExecucao,
          p_cliente: cliente || null,
          p_marca_tv: marcaTv || null,
          p_modelo_tv: modeloTv || null,
          p_polegadas: polegadas ? Number(polegadas) : null,
          p_defeito_relatado: defeito || null,
          p_diagnostico: diagnostico || null,
          p_tipo_servico_id: tipoServicoId || null,
          p_servico_executado: servico,
          p_valor_servico: valorServico,
          p_valor_mao_obra: valorMaoObra,
          p_pecas_descricao: pecas || null,
          p_observacao: observacao || null,
          p_enviar: enviar,
        });
        producaoId = registro.id;
      } else {
        const r = await rpcProd<RpcResult>("producao_registrar", {
          p_os: os,
          p_data_execucao: dataExecucao,
          p_cliente: cliente || null,
          p_marca_tv: marcaTv || null,
          p_modelo_tv: modeloTv || null,
          p_polegadas: polegadas ? Number(polegadas) : null,
          p_defeito_relatado: defeito || null,
          p_diagnostico: diagnostico || null,
          p_tipo_servico_id: tipoServicoId || null,
          p_servico_executado: servico,
          p_valor_servico: valorServico,
          p_valor_mao_obra: valorMaoObra,
          p_pecas_descricao: pecas || null,
          p_observacao: observacao || null,
          p_enviar: enviar,
          p_confirmar_duplicidade: confirmarDup,
        });
        if (!r.ok && r.code === "DUPLICIDADE") {
          setDuplicidade(r.message ?? "OS duplicada.");
          return;
        }
        producaoId = r.id!;
      }
      await uploadFotos(producaoId);
      toast.success(
        enviar
          ? "Registro enviado para validação gerencial."
          : editando
            ? "Rascunho atualizado."
            : "Rascunho salvo. Envie para validação quando concluir.",
      );
      invalidateProducao(queryClient);
      onClose();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao salvar registro."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editando ? "Editar Registro de Produção" : "Registrar Produção Técnica"}
          </DialogTitle>
          <DialogDescription>
            Registre o serviço executado e anexe evidências. Nada gera comissão ou custo automaticamente — a gerência
            valida antes.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar(false);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pr-os" className={labelClass}>OS *</label>
              <input id="pr-os" value={os} onChange={(e) => setOs(e.target.value)} className={inputClass}
                placeholder="Número da OS no INFOR OS" required disabled={editando} />
            </div>
            <div>
              <label htmlFor="pr-data" className={labelClass}>Data de Execução *</label>
              <input id="pr-data" type="date" value={dataExecucao} max={todayManausISO()}
                onChange={(e) => setDataExecucao(e.target.value)} className={inputClass} required />
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-cliente" className={labelClass}>Cliente</label>
              <input id="pr-cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pr-marca" className={labelClass}>Marca da TV</label>
              <input id="pr-marca" value={marcaTv} onChange={(e) => setMarcaTv(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pr-modelo" className={labelClass}>Modelo</label>
              <input id="pr-modelo" value={modeloTv} onChange={(e) => setModeloTv(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pr-pol" className={labelClass}>Polegadas</label>
              <input id="pr-pol" type="number" min={1} max={120} value={polegadas}
                onChange={(e) => setPolegadas(e.target.value)} className={inputClass} placeholder='Ex.: 55' />
            </div>
            <div>
              <label htmlFor="pr-tipo" className={labelClass}>Tipo de Serviço</label>
              <select id="pr-tipo" value={tipoServicoId} onChange={(e) => setTipoServicoId(e.target.value)} className={inputClass}>
                <option value="">Selecione…</option>
                {tipos.filter((t) => t.ativo).map((t) => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-defeito" className={labelClass}>Defeito Relatado</label>
              <input id="pr-defeito" value={defeito} onChange={(e) => setDefeito(e.target.value)} className={inputClass} />
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-diag" className={labelClass}>Diagnóstico</label>
              <Textarea id="pr-diag" value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} rows={2} />
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-servico" className={labelClass}>Serviço Executado *</label>
              <Textarea id="pr-servico" value={servico} onChange={(e) => setServico(e.target.value)} rows={2} required />
            </div>
            <div>
              <label className={labelClass}>Valor do Serviço (R$)</label>
              <MoneyInput value={valorServico} onChange={setValorServico} />
            </div>
            <div>
              <label className={labelClass}>Mão de Obra (R$)</label>
              <MoneyInput value={valorMaoObra} onChange={setValorMaoObra} />
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-pecas" className={labelClass}>Peças / Materiais Utilizados</label>
              <Textarea id="pr-pecas" value={pecas} onChange={(e) => setPecas(e.target.value)} rows={2}
                placeholder="Descrição livre — custos oficiais são lançados em Peças e Custos." />
            </div>
            <div className="col-span-2">
              <label htmlFor="pr-obs" className={labelClass}>Observações</label>
              <Textarea id="pr-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
            </div>
          </div>

          <div>
            <span className={labelClass}>Fotos (evidências)</span>
            {/* Câmera traseira direta no celular; galeria como alternativa/fallback. */}
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                adicionarFotos(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                adicionarFotos(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => cameraRef.current?.click()}>
                <Camera className="mr-1.5 h-4 w-4" /> Tirar foto
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <ImagePlus className="mr-1.5 h-4 w-4" /> Escolher da galeria
              </Button>
              {fotosNovas.length > 0 && (
                <span className="text-[11px] text-muted-foreground">
                  {fotosNovas.length} foto(s) prontas para envio
                </span>
              )}
            </div>
            {fotosNovas.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {fotosNovas.map((f, i) => (
                  <figure key={`${f.name}-${i}`} className="relative overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={previews[i]}
                      alt={`Pré-visualização da foto ${i + 1}`}
                      className="h-24 w-full object-cover"
                    />
                    <div className="absolute right-1 top-1 flex gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setFotosNovas((prev) => prev.filter((_, j) => j !== i));
                          cameraRef.current?.click();
                        }}
                        className="rounded-full bg-background/90 p-1 text-muted-foreground hover:text-foreground"
                        aria-label="Tirar novamente"
                      >
                        <Camera className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setFotosNovas((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
                        aria-label="Remover foto"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </figure>
                ))}
              </div>
            )}
            {editando && <FotosExistentes producaoId={registro.id} />}
          </div>


          {duplicidade && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700">
              {duplicidade}
              <div className="mt-2">
                <Button type="button" size="sm" variant="outline" disabled={saving}
                  onClick={() => { setDuplicidade(null); void salvar(false, true); }}>
                  Registrar mesmo assim
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button type="submit" variant="outline" disabled={saving}>
              {saving ? "Salvando…" : "Salvar rascunho"}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void salvar(true)}>
              {saving ? "Enviando…" : "Salvar e enviar p/ validação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FotosExistentes({ producaoId }: { producaoId: string }) {
  const { profile } = useAccess();
  const queryClient = useQueryClient();
  const fotosQuery = useQuery({
    queryKey: ["producao", "fotos", producaoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producao_fotos")
        .select("id, producao_id, storage_path, tipo, descricao, uploaded_by, created_at")
        .eq("producao_id", producaoId)
        .order("created_at");
      if (error) throw error;
      return data as ProducaoFoto[];
    },
  });

  async function remover(foto: ProducaoFoto) {
    try {
      const { error: sErr } = await supabase.storage.from("producao").remove([foto.storage_path]);
      if (sErr) throw new Error(mensagemErro(sErr));
      const { error } = await supabase.from("producao_fotos").delete().eq("id", foto.id);
      if (error) throw error;
      toast.success("Foto removida.");
      await queryClient.invalidateQueries({ queryKey: ["producao", "fotos", producaoId] });
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao remover foto."));
    }
  }

  const fotos = fotosQuery.data ?? [];
  if (fotos.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {fotos.map((f) => (
        <span key={f.id} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px]">
          Foto anexada
          {f.uploaded_by === profile?.id && (
            <button type="button" onClick={() => void remover(f)} className="text-muted-foreground hover:text-destructive"
              aria-label="Excluir foto anexada">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
