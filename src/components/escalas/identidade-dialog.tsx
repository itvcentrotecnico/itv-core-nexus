import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { inputClass } from "@/lib/caixa";
import { mensagemErro } from "@/lib/erros";
import type { ColaboradorEscala } from "@/lib/escalas";
export function IdentidadeDialog({
  pessoa,
  colaboradores,
  concluir,
  fechar,
}: {
  pessoa: string;
  colaboradores: ColaboradorEscala[];
  concluir: (id: string, nome: string) => void;
  fechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [existente, setExistente] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = useQuery({
    queryKey: ["escalas-cargos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("cargos").select("id,nome").eq("ativo", true);
      if (error) throw error;
      return data;
    },
  });
  async function salvar() {
    if (!confirmado) return;
    if (existente) {
      const c = colaboradores.find((c) => c.id === existente);
      if (c) concluir(c.id, c.nome);
      return;
    }
    setBusy(true);
    try {
      if (nome.trim().split(/\s+/).length < 2 || !cargo)
        throw new Error("Confirme o nome completo e a função.");
      if (colaboradores.some((c) => c.nome.toLocaleLowerCase() === nome.trim().toLocaleLowerCase()))
        throw new Error("Existe um cadastro com este nome. Selecione o vínculo existente.");
      const { data, error } = await supabase.rpc("colaboradores_registrar", {
        p_nome: nome.trim(),
        p_nome_exibicao: pessoa,
        p_cargo_id: cargo,
        ...(email.trim() ? { p_email: email.trim() } : {}),
        p_recebe_comissao_entrega: false,
      });
      if (error) throw error;
      const r = data as { ok: boolean; id?: string; message?: string };
      if (!r.ok || !r.id) throw new Error(r.message || "Cadastro não concluído.");
      concluir(r.id, pessoa);
      toast.success(
        "Cadastro confirmado. Convide o colaborador para liberar a consulta individual.",
      );
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível confirmar o cadastro."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) fechar();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogTitle>Confirmar identidade · {pessoa}</DialogTitle>
        <DialogDescription>
          {pessoa === "Adriano" ? "Auxiliar Operacional" : "Auxiliar Logístico"} · sem cadastro
          equivalente identificado
        </DialogDescription>
        <label className="grid gap-1 text-sm">
          Vincular cadastro existente
          <select
            className={inputClass}
            value={existente}
            onChange={(e) => setExistente(e.target.value)}
          >
            <option value="">Criar após confirmação</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {c.funcao}
              </option>
            ))}
          </select>
        </label>
        {!existente && (
          <>
            <label className="grid gap-1 text-sm">
              Nome completo
              <input
                className={inputClass}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              E-mail (opcional)
              <input
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Função confirmada
              <select
                className={inputClass}
                value={cargo}
                onChange={(e) => setCargo(e.target.value)}
              >
                <option value="">Selecione a função existente</option>
                {refs.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
          />
          Conferi a identidade e confirmei que não é outro colaborador já cadastrado.
        </label>
        <Button
          disabled={!confirmado || busy || (!existente && (!nome.trim() || !cargo))}
          onClick={salvar}
        >
          Confirmar cadastro / vínculo
        </Button>
        <Button variant="outline" asChild>
          <Link to="/admin" search={{ aba: "usuarios" }}>
            Convites e acessos
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
