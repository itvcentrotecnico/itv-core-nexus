import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateTimeITV } from "@/lib/format";
import { mensagemErro, rpcColetas, TIPO_LABEL, type ColetaTipo } from "@/lib/coletas";

interface ItemLixeira {
  id: string;
  tipo: ColetaTipo;
  cliente_nome: string;
  bairro: string | null;
  status: string;
  deleted_at: string;
  delete_reason: string | null;
  excluido_por: string | null;
}

/** Registros excluídos logicamente — restauração exclusiva do ADM Geral. */
export function LixeiraColetas() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["coletas", "lixeira"],
    queryFn: () => rpcColetas<ItemLixeira[]>("coletas_lixeira"),
  });

  async function restaurar(id: string) {
    try {
      await rpcColetas("coletas_restaurar", { p_id: id });
      await queryClient.invalidateQueries({ queryKey: ["coletas"] });
      toast.success("Registro restaurado.");
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível restaurar o registro."));
    }
  }

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (query.isError) {
    return (
      <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
        {mensagemErro(query.error, "Não foi possível carregar a lixeira.")}
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const itens = query.data ?? [];
  if (itens.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhum registro excluído.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Tipo</th>
            <th className="px-3 py-2 text-left">Cliente</th>
            <th className="px-3 py-2 text-left">Bairro</th>
            <th className="px-3 py-2 text-left">Excluído em</th>
            <th className="px-3 py-2 text-left">Por</th>
            <th className="px-3 py-2 text-left">Motivo</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id} className="border-t border-border/60">
              <td className="px-3 py-2">{TIPO_LABEL[i.tipo]}</td>
              <td className="px-3 py-2 font-medium text-foreground">{i.cliente_nome}</td>
              <td className="px-3 py-2">{i.bairro ?? "—"}</td>
              <td className="px-3 py-2">{formatDateTimeITV(i.deleted_at)}</td>
              <td className="px-3 py-2">{i.excluido_por ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{i.delete_reason ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <Button size="sm" variant="outline" onClick={() => void restaurar(i.id)}>
                  <RotateCcw className="mr-1.5 size-3.5" aria-hidden="true" /> Restaurar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
