import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  labelGaveta,
  rpcEstoque,
  type EstoqueLocalizacao,
  type EstoqueMarca,
} from "@/lib/estoque";

export function MarcasCard({
  marcas,
  podeAdministrar,
}: {
  marcas: EstoqueMarca[];
  podeAdministrar: boolean;
}) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");

  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ["estoque"] });

  async function criar() {
    if (!nome.trim()) {
      toast.error("Informe o nome da marca.");
      return;
    }
    try {
      const res = await rpcEstoque<{ ok: true; existente?: boolean }>("estoque_marca_salvar", {
        p_nome: nome.trim(),
      });
      toast.success(res.existente ? "Marca já existia e está ativa." : "Marca cadastrada.");
      setNome("");
      invalidar();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: (e as Error).message });
    }
  }

  async function alternar(m: EstoqueMarca, ativo: boolean) {
    try {
      await rpcEstoque("estoque_marca_salvar", { p_id: m.id, p_nome: m.nome, p_ativo: ativo });
      toast.success(ativo ? "Marca reativada." : "Marca inativada (histórico preservado).");
      invalidar();
    } catch (e) {
      toast.error("Não foi possível salvar", { description: (e as Error).message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Marcas de TV</CardTitle>
        <CardDescription>
          Marcas com histórico nunca são excluídas — apenas inativadas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeAdministrar ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <label className={labelClass} htmlFor="nova-marca">
                Nova marca
              </label>
              <input
                id="nova-marca"
                className={inputClass}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Britânia"
              />
            </div>
            <Button className="sm:self-end" onClick={() => void criar()}>
              <Plus className="mr-2 size-4" /> Nova marca
            </Button>
          </div>
        ) : null}

        <ul className="divide-y divide-border">
          {marcas.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className={m.ativo ? "text-foreground" : "text-muted-foreground line-through"}>
                {m.nome}
              </span>
              <Switch
                checked={m.ativo}
                disabled={!podeAdministrar}
                onCheckedChange={(v) => void alternar(m, v)}
                aria-label={`Ativar ${m.nome}`}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function GavetasCard({
  localizacoes,
  podeAdministrar,
  onAbrirGaveta,
}: {
  localizacoes: EstoqueLocalizacao[];
  podeAdministrar: boolean;
  onAbrirGaveta: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [grupo, setGrupo] = useState<"LED" | "MAIN">("LED");
  const [numero, setNumero] = useState("");

  async function criar() {
    const n = Number(numero);
    if (!n || n < 1) {
      toast.error("Informe o número da gaveta.");
      return;
    }
    try {
      const res = await rpcEstoque<{ ok: true; existente?: boolean }>(
        "estoque_localizacao_salvar",
        { p_grupo: grupo, p_numero: n },
      );
      toast.success(res.existente ? "Gaveta já existia e está ativa." : "Gaveta cadastrada.");
      setNumero("");
      void queryClient.invalidateQueries({ queryKey: ["estoque"] });
    } catch (e) {
      toast.error("Não foi possível salvar", { description: (e as Error).message });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Localizações (gavetas)</CardTitle>
        <CardDescription>
          LED e MAIN são grupos independentes: LED — Gaveta 01 e MAIN — Gaveta 01 convivem sem
          conflito. Uma gaveta pode guardar vários itens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {podeAdministrar ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <div>
              <label className={labelClass} htmlFor="gaveta-grupo">
                Grupo
              </label>
              <select
                id="gaveta-grupo"
                className={inputClass}
                value={grupo}
                onChange={(e) => setGrupo(e.target.value as "LED" | "MAIN")}
              >
                <option value="LED">LED</option>
                <option value="MAIN">MAIN</option>
              </select>
            </div>
            <div className="flex-1">
              <label className={labelClass} htmlFor="gaveta-numero">
                Número
              </label>
              <input
                id="gaveta-numero"
                className={inputClass}
                type="number"
                min={1}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
            <Button className="sm:self-end" onClick={() => void criar()}>
              <Plus className="mr-2 size-4" /> Nova gaveta
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {localizacoes.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => onAbrirGaveta(l.id)}
              className="rounded-lg border border-border px-3 py-2 text-left text-sm transition hover:bg-muted"
            >
              <span className="block font-medium text-foreground">{labelGaveta(l)}</span>
              <span className="block text-xs text-muted-foreground">{l.codigo}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
