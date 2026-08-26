import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { formatCurrencyBRL, formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { TIPO_REGRA, type RegraComissao } from "@/lib/comissoes";
import { RegraForm } from "@/components/comissoes/regra-form";
import { BotaoAcao, Carregando, PillStatus, SecaoAdmin, SemDados, TabelaAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";

type RegraRow = RegraComissao & { tecnico?: { full_name: string } | null };

export function AdminRegrasComissao() {
  const { isAdmin, can } = useAccess();
  const podeAdministrar = isAdmin || can("comissoes", "administrar") || can("admin_parametros", "administrar");
  const [form, setForm] = useState<{ open: boolean; regra: RegraComissao | null }>({ open: false, regra: null });

  const { data, isLoading } = useQuery({
    queryKey: ["regras-comissao"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("regras_comissao")
        .select("*, tecnico:profiles!regras_comissao_tecnico_id_fkey(full_name)")
        .order("inicio_vigencia", { ascending: false });
      if (error) throw error;
      return (rows ?? []) as unknown as RegraRow[];
    },
  });

  const hoje = todayManausISO();

  return (
    <SecaoAdmin
      titulo="Regras de Comissão"
      descricao="Cada alteração cria uma nova vigência. Regras anteriores permanecem no histórico e continuam válidas para os cálculos já realizados."
      acoes={
        <Button size="sm" onClick={() => setForm({ open: true, regra: null })} disabled={!podeAdministrar}>
          <Plus className="mr-2 size-4" /> Nova regra
        </Button>
      }
    >
      {isLoading ? (
        <Carregando />
      ) : (data ?? []).length === 0 ? (
        <SemDados label="Nenhuma regra cadastrada." />
      ) : (
        <TabelaAdmin cabecalho={["Técnico", "Regra", "Valor", "Vigência", "Situação", "Ações"]}>
          {(data ?? []).map((r) => {
            const vigente = r.ativo && r.inicio_vigencia <= hoje && (!r.fim_vigencia || r.fim_vigencia >= hoje);
            return (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium text-foreground">{r.tecnico?.full_name ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {TIPO_REGRA[r.tipo_regra] ?? r.tipo_regra}
                  {r.servico_descricao ? <span className="block text-xs">{r.servico_descricao}</span> : null}
                </td>
                <td className="px-3 py-2 text-foreground">
                  {r.percentual != null
                    ? `${Number(r.percentual).toLocaleString("pt-BR")}%`
                    : r.valor_fixo != null
                      ? formatCurrencyBRL(Number(r.valor_fixo))
                      : "—"}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {formatDateOnlyISO(r.inicio_vigencia)} → {r.fim_vigencia ? formatDateOnlyISO(r.fim_vigencia) : "sem fim"}
                </td>
                <td className="px-3 py-2">
                  {vigente ? (
                    <PillStatus tom="ok">Vigente</PillStatus>
                  ) : r.ativo ? (
                    <PillStatus tom="neutro">Fora de vigência</PillStatus>
                  ) : (
                    <PillStatus tom="alerta">Inativa</PillStatus>
                  )}
                </td>
                <td className="px-3 py-2">
                  <BotaoAcao disabled={!podeAdministrar} onClick={() => setForm({ open: true, regra: r })}>
                    <Pencil className="mr-1.5 size-3.5" /> Editar
                  </BotaoAcao>
                </td>
              </tr>
            );
          })}
        </TabelaAdmin>
      )}

      <RegraForm open={form.open} onOpenChange={(o) => setForm((p) => ({ ...p, open: o }))} regra={form.regra} />
    </SecaoAdmin>
  );
}
