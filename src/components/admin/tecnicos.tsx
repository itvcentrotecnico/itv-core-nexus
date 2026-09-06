import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import { useAccess } from "@/hooks/use-auth";
import { formatDateOnlyISO } from "@/lib/format";
import { USUARIO_STATUS_LABEL, type AdminTecnico } from "@/lib/admin";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  BotaoAcao,
  Carregando,
  PillStatus,
  SecaoAdmin,
  SemDados,
  TabelaAdmin,
  executarAcao,
  rpcAdmin,
} from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_COLAB: Record<string, { label: string; tom: "ok" | "alerta" | "erro" | "neutro" }> = {
  ativo: { label: "Ativo", tom: "ok" },
  ferias: { label: "Férias", tom: "alerta" },
  afastado: { label: "Afastado", tom: "alerta" },
  desligado: { label: "Desligado", tom: "erro" },
};

export function AdminTecnicos() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeAdministrar = isAdmin || can("admin", "administrar");
  const [editando, setEditando] = useState<AdminTecnico | null>(null);
  const [especialidade, setEspecialidade] = useState("");
  const [observacao, setObservacao] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "tecnicos"],
    queryFn: async () => {
      const res = await rpcAdmin<{ ok: true; tecnicos: AdminTecnico[] }>("admin_tecnicos_listar");
      return res.tecnicos ?? [];
    },
  });

  return (
    <SecaoAdmin
      titulo="Técnicos"
      descricao="Visão central dos técnicos: usuário, colaborador vinculado, situação e volume de histórico. O cadastro não é duplicado — o técnico é o colaborador ligado ao usuário."
    >
      {isLoading ? (
        <Carregando />
      ) : (data ?? []).length === 0 ? (
        <SemDados label="Nenhum usuário com perfil Técnico." />
      ) : (
        <TabelaAdmin
          cabecalho={[
            "Técnico",
            "Usuário",
            "Situação",
            "Especialidade",
            "Admissão",
            "Histórico",
            "Ações",
          ]}
        >
          {(data ?? []).map((t) => {
            const st = STATUS_COLAB[t.colaborador_status ?? ""] ?? {
              label: "Sem colaborador",
              tom: "neutro" as const,
            };
            return (
              <tr key={t.user_id}>
                <td className="px-3 py-3">
                  <p className="font-medium text-foreground">{t.nome}</p>
                  <p className="text-xs text-muted-foreground">{t.email ?? "—"}</p>
                </td>
                <td className="px-3 py-3">
                  <PillStatus tom={t.usuario_status === "ativo" ? "ok" : "alerta"}>
                    {USUARIO_STATUS_LABEL[t.usuario_status]}
                  </PillStatus>
                </td>
                <td className="px-3 py-3">
                  <PillStatus tom={st.tom}>{st.label}</PillStatus>
                </td>
                <td className="px-3 py-3 text-foreground">{t.especialidade ?? "—"}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {t.data_admissao ? formatDateOnlyISO(t.data_admissao) : "—"}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {t.servicos} serviço(s) · {t.comissoes} comissão(ões)
                </td>
                <td className="px-3 py-3">
                  <BotaoAcao
                    disabled={!podeAdministrar || !t.colaborador_id}
                    onClick={() => {
                      setEditando(t);
                      setEspecialidade(t.especialidade ?? "");
                      setObservacao(t.observacao ?? "");
                    }}
                  >
                    <Pencil className="mr-1.5 size-3.5" /> Editar
                  </BotaoAcao>
                </td>
              </tr>
            );
          })}
        </TabelaAdmin>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        A situação (Ativo, Férias, Afastado, Desligado) é alterada no módulo Colaboradores, mantendo
        um único cadastro oficial. Técnicos inativos deixam de aparecer em novos lançamentos, mas o
        histórico é preservado.
      </p>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando?.nome}</DialogTitle>
            <DialogDescription>Dados complementares do técnico.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="tec-especialidade">
                Especialidade
              </label>
              <input
                id="tec-especialidade"
                className={inputClass}
                value={especialidade}
                onChange={(e) => setEspecialidade(e.target.value)}
                placeholder="Ex.: Placa Main, Fonte, BGA"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="tec-observacao">
                Observação
              </label>
              <input
                id="tec-observacao"
                className={inputClass}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!editando) return;
                const ok = await executarAcao(
                  () =>
                    rpcAdmin("admin_tecnico_atualizar", {
                      p_user_id: editando.user_id,
                      p_especialidade: especialidade || null,
                      p_observacao: observacao || null,
                    }),
                  "Técnico atualizado.",
                  () => void queryClient.invalidateQueries({ queryKey: ["admin", "tecnicos"] }),
                );
                if (ok) setEditando(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SecaoAdmin>
  );
}
