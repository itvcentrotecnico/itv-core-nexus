import { mensagemErro } from "@/lib/erros";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/lib/caixa";
import { cn } from "@/lib/utils";
import { useFinanceiroRefs } from "./shared";

interface ConfigSectionProps {
  titulo: string;
  descricao: string;
  tabela: "categorias_financeiras" | "subcategorias_financeiras" | "centros_custo";
  itens: { id: string; nome: string; ativo: boolean }[];
  podeConfigurar: boolean;
  comCategoriaPai?: { id: string; nome: string }[];
}

function ConfigSection({
  titulo,
  descricao,
  tabela,
  itens,
  podeConfigurar,
  comCategoriaPai,
}: ConfigSectionProps) {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState("");
  const [paiId, setPaiId] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["financeiro", "refs"] });

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { nome: nome.trim(), ordem: itens.length + 1 };
      if (tabela === "subcategorias_financeiras") {
        if (!paiId) {
          toast.error("Selecione a categoria.");
          setSaving(false);
          return;
        }
        payload["categoria_id"] = paiId;
      }
      const { error } = await supabase.from(tabela).insert(payload as never);
      if (error) throw error;
      toast.success("Cadastrado.");
      setNome("");
      refresh();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao cadastrar."));
    } finally {
      setSaving(false);
    }
  }

  async function alternarAtivo(id: string, ativo: boolean) {
    try {
      const { error } = await supabase
        .from(tabela)
        .update({ ativo: !ativo } as never)
        .eq("id", id);
      if (error) throw error;
      toast.success(ativo ? "Desativado." : "Reativado.");
      refresh();
    } catch (err) {
      toast.error(mensagemErro(err, "Falha ao atualizar."));
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 className="font-display text-sm font-bold text-foreground">{titulo}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>

      {podeConfigurar && (
        <form onSubmit={adicionar} className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <label htmlFor={`${tabela}-nome`} className={labelClass}>
              Nome
            </label>
            <input
              id={`${tabela}-nome`}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={inputClass}
              placeholder="Novo item…"
            />
          </div>
          {comCategoriaPai && (
            <div className="min-w-40 flex-1">
              <label htmlFor={`${tabela}-pai`} className={labelClass}>
                Categoria
              </label>
              <select
                id={`${tabela}-pai`}
                value={paiId}
                onChange={(e) => setPaiId(e.target.value)}
                className={inputClass}
              >
                <option value="">Selecione…</option>
                {comCategoriaPai.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button type="submit" size="sm" disabled={saving || !nome.trim()}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Adicionar
          </Button>
        </form>
      )}

      <ul className="mt-4 divide-y divide-border">
        {itens.length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">Nenhum item cadastrado.</li>
        )}
        {itens.map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2 text-sm">
            <span className={cn("flex-1", !item.ativo && "text-muted-foreground line-through")}>
              {item.nome}
            </span>
            {!item.ativo && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Inativo
              </span>
            )}
            {podeConfigurar && (
              <button
                type="button"
                onClick={() => alternarAtivo(item.id, item.ativo)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {item.ativo ? "Desativar" : "Reativar"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CategoriasTab({ podeConfigurar }: { podeConfigurar: boolean }) {
  const refs = useFinanceiroRefs(true);

  if (!podeConfigurar) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/60 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Somente usuários com a permissão <strong>financeiro.configurar</strong> podem gerenciar
          categorias e centros de custo. Consulte o administrador.
        </p>
      </div>
    );
  }

  const categorias = refs.data?.categorias ?? [];
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ConfigSection
        titulo="Categorias Financeiras"
        descricao="Classificação principal de despesas e obrigações."
        tabela="categorias_financeiras"
        itens={categorias}
        podeConfigurar={podeConfigurar}
      />
      <ConfigSection
        titulo="Subcategorias"
        descricao="Detalhamento vinculado a uma categoria."
        tabela="subcategorias_financeiras"
        itens={(refs.data?.subcategorias ?? []).map((s) => ({
          id: s.id,
          nome: s.nome,
          ativo: s.ativo,
        }))}
        podeConfigurar={podeConfigurar}
        comCategoriaPai={categorias.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }))}
      />
      <ConfigSection
        titulo="Centros de Custo"
        descricao="Agrupadores gerenciais da operação."
        tabela="centros_custo"
        itens={refs.data?.centros ?? []}
        podeConfigurar={podeConfigurar}
      />
    </div>
  );
}
