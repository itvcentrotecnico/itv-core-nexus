import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  POLEGADAS,
  TIPO_LABEL,
  labelGaveta,
  rpcEstoque,
  type DuplicidadeItem,
  type EstoqueItem,
  type EstoqueLocalizacao,
  type EstoqueMarca,
  type EstoqueTipo,
} from "@/lib/estoque";

const OUTRA = "__outra__";

interface Props {
  aberto: boolean;
  tipo: EstoqueTipo;
  item?: EstoqueItem | null;
  marcas: EstoqueMarca[];
  localizacoes: EstoqueLocalizacao[];
  onClose: () => void;
}

export function ItemEstoqueDialog({ aberto, tipo, item, marcas, localizacoes, onClose }: Props) {
  const queryClient = useQueryClient();
  const grupo = tipo === "kit_led" ? "LED" : "MAIN";
  const gavetas = useMemo(
    () => localizacoes.filter((l) => l.ativo && l.grupo === grupo),
    [localizacoes, grupo],
  );

  const [marcaId, setMarcaId] = useState("");
  const [polegada, setPolegada] = useState("");
  const [polegadaLivre, setPolegadaLivre] = useState("");
  const [modelo, setModelo] = useState("");
  const [codigoPlaca, setCodigoPlaca] = useState("");
  const [localizacaoId, setLocalizacaoId] = useState("");
  const [quantidade, setQuantidade] = useState("0");
  const [minimo, setMinimo] = useState("0");
  const [observacao, setObservacao] = useState("");
  const [compat, setCompat] = useState<string[]>([]);
  const [novoCompat, setNovoCompat] = useState("");
  const [duplicados, setDuplicados] = useState<DuplicidadeItem[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setMarcaId(item?.marca_id ?? marcas[0]?.id ?? "");
    const p = item?.polegada ?? "";
    setPolegada(p && !POLEGADAS.includes(p) ? OUTRA : p);
    setPolegadaLivre(p && !POLEGADAS.includes(p) ? p : "");
    setModelo(item?.modelo ?? "");
    setCodigoPlaca(item?.codigo_placa ?? "");
    setLocalizacaoId(item?.localizacao_id ?? gavetas[0]?.id ?? "");
    setQuantidade(String(item?.quantidade ?? 0));
    setMinimo(String(item?.estoque_minimo ?? 0));
    setObservacao(item?.observacao ?? "");
    setCompat(item?.compatibilidades ?? []);
    setNovoCompat("");
    setDuplicados([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, item]);

  const polegadaFinal = polegada === OUTRA ? polegadaLivre.trim() : polegada;

  function adicionarCompat() {
    const v = novoCompat.trim();
    if (!v) return;
    const existe = compat.some(
      (c) => c.replace(/[^a-z0-9]/gi, "").toUpperCase() === v.replace(/[^a-z0-9]/gi, "").toUpperCase(),
    );
    if (!existe) setCompat((l) => [...l, v]);
    setNovoCompat("");
  }

  async function verificarDuplicidade(): Promise<boolean> {
    try {
      const res = await rpcEstoque<{ ok: true; encontrados: DuplicidadeItem[] }>(
        "estoque_duplicidade",
        {
          p_tipo: tipo,
          p_marca_id: marcaId,
          p_polegada: tipo === "kit_led" ? polegadaFinal : null,
          p_modelo: modelo.trim(),
          p_codigo_placa: tipo === "placa_main" ? codigoPlaca.trim() : null,
          p_id: item?.id ?? null,
        },
      );
      if ((res.encontrados ?? []).length > 0) {
        setDuplicados(res.encontrados);
        return true;
      }
    } catch {
      /* a gravação seguirá e o banco continua validando */
    }
    return false;
  }

  async function salvar(ignorarDuplicidade = false) {
    const faltando = !marcaId
      ? "Selecione a marca."
      : !modelo.trim()
        ? tipo === "kit_led"
          ? "Informe o modelo."
          : "Informe o modelo da TV."
        : tipo === "kit_led" && !polegadaFinal
          ? "Informe a polegada."
          : tipo === "placa_main" && !codigoPlaca.trim()
            ? "Informe o código da placa."
            : !localizacaoId
              ? "Selecione a gaveta."
              : null;
    if (faltando) {
      toast.error(faltando);
      return;
    }

    if (!ignorarDuplicidade && (await verificarDuplicidade())) return;

    setSalvando(true);
    try {
      await rpcEstoque("estoque_item_salvar", {
        p_dados: {
          tipo,
          marca_id: marcaId,
          polegada: tipo === "kit_led" ? polegadaFinal : null,
          modelo: modelo.trim(),
          codigo_placa: tipo === "placa_main" ? codigoPlaca.trim() : null,
          localizacao_id: localizacaoId,
          quantidade: Number(quantidade || 0),
          estoque_minimo: Number(minimo || 0),
          observacao: observacao.trim(),
        },
        p_compatibilidades: compat,
        p_id: item?.id ?? null,
      });
      toast.success(item ? "Cadastro atualizado." : `${TIPO_LABEL[tipo]} cadastrado.`, {
        description: `${modelo.trim()} · ${gavetas.find((g) => g.id === localizacaoId)?.codigo ?? ""}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
      onClose();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {item ? "Editar" : "Novo"} {TIPO_LABEL[tipo].toLowerCase()}
          </DialogTitle>
          <DialogDescription>
            Campos com * são obrigatórios. A compatibilidade nunca é deduzida pelo sistema: só vale o
            que for cadastrado aqui.
          </DialogDescription>
        </DialogHeader>

        {duplicados.length > 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              {tipo === "kit_led"
                ? "Possível item já cadastrado."
                : "Código de placa já cadastrado."}
            </p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {duplicados.map((d) => (
                <li key={d.id}>
                  {d.marca_nome} {d.polegada ? `${d.polegada}" ` : ""}
                  {d.modelo}
                  {d.codigo_placa ? ` · ${d.codigo_placa}` : ""} · {d.gaveta_label} ·{" "}
                  {d.quantidade} un.
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDuplicados([])}>
                Revisar dados
              </Button>
              <Button size="sm" onClick={() => void salvar(true)} disabled={salvando}>
                Cadastrar mesmo assim
              </Button>
            </div>
          </div>
        ) : null}

        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="estoque-marca">
              Marca *
            </label>
            <select
              id="estoque-marca"
              className={inputClass}
              value={marcaId}
              onChange={(e) => setMarcaId(e.target.value)}
            >
              {marcas
                .filter((m) => m.ativo || m.id === marcaId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
            </select>
          </div>

          {tipo === "kit_led" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="estoque-polegada">
                  Polegada *
                </label>
                <select
                  id="estoque-polegada"
                  className={inputClass}
                  value={polegada}
                  onChange={(e) => setPolegada(e.target.value)}
                >
                  <option value="">Selecione</option>
                  {POLEGADAS.map((p) => (
                    <option key={p} value={p}>
                      {p}&quot;
                    </option>
                  ))}
                  <option value={OUTRA}>Outra</option>
                </select>
              </div>
              {polegada === OUTRA ? (
                <div>
                  <label className={labelClass} htmlFor="estoque-polegada-livre">
                    Qual polegada? *
                  </label>
                  <input
                    id="estoque-polegada-livre"
                    className={inputClass}
                    value={polegadaLivre}
                    onChange={(e) => setPolegadaLivre(e.target.value)}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="estoque-modelo">
              {tipo === "kit_led" ? "Modelo *" : "Modelo da TV *"}
            </label>
            <input
              id="estoque-modelo"
              className={inputClass}
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder={tipo === "kit_led" ? "UN50AU8000G" : "UN50TU8000G"}
            />
          </div>

          {tipo === "placa_main" ? (
            <div>
              <label className={labelClass} htmlFor="estoque-codigo">
                Código da placa *
              </label>
              <input
                id="estoque-codigo"
                className={inputClass}
                value={codigoPlaca}
                onChange={(e) => setCodigoPlaca(e.target.value)}
                placeholder="BN94-15770X"
              />
            </div>
          ) : null}

          <div>
            <span className={labelClass}>Compatibilidade</span>
            <div className="flex gap-2">
              <input
                className={inputClass}
                value={novoCompat}
                onChange={(e) => setNovoCompat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionarCompat();
                  }
                }}
                placeholder="Modelo compatível"
              />
              <Button type="button" variant="outline" onClick={adicionarCompat}>
                <Plus className="size-4" />
                <span className="sr-only">Adicionar compatibilidade</span>
              </Button>
            </div>
            {compat.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {compat.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setCompat((l) => l.filter((x) => x !== c))}
                      aria-label={`Remover ${c}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <label className={labelClass} htmlFor="estoque-gaveta">
              Gaveta *
            </label>
            <select
              id="estoque-gaveta"
              className={inputClass}
              value={localizacaoId}
              onChange={(e) => setLocalizacaoId(e.target.value)}
            >
              {gavetas.map((g) => (
                <option key={g.id} value={g.id}>
                  {labelGaveta(g)} ({g.codigo})
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="estoque-qtd">
                {item ? "Quantidade atual *" : "Quantidade inicial *"}
              </label>
              <input
                id="estoque-qtd"
                type="number"
                min={0}
                className={inputClass}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="estoque-min">
                Alerta de estoque baixo
              </label>
              <input
                id="estoque-min"
                type="number"
                min={0}
                className={inputClass}
                value={minimo}
                onChange={(e) => setMinimo(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="estoque-obs">
              Observação
            </label>
            <input
              id="estoque-obs"
              className={inputClass}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="ADAPTAÇÃO / VERSÃO ESPECÍFICA DE PAINEL"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void salvar()} disabled={salvando}>
            {item ? "Salvar" : tipo === "kit_led" ? "Cadastrar kit" : "Cadastrar placa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
