import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MoneyInput } from "@/components/caixa/money-input";
import { inputClass, labelClass } from "@/lib/caixa";
import { TIPO_REGRA, type ComissaoTipoRegra, type RegraComissao } from "@/lib/comissoes";

interface TecnicoOption {
  id: string;
  full_name: string;
  roles: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regra?: RegraComissao | null;
}

export function RegraForm({ open, onOpenChange, regra }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [tecnicoId, setTecnicoId] = useState(regra?.tecnico_id ?? "");
  const [tipo, setTipo] = useState<ComissaoTipoRegra>(regra?.tipo_regra ?? "percentual_mao_obra");
  const [percentual, setPercentual] = useState(regra?.percentual != null ? String(regra.percentual).replace(".", ",") : "");
  const [valorFixo, setValorFixo] = useState(regra?.valor_fixo ?? 0);
  const [servico, setServico] = useState(regra?.servico_descricao ?? "");
  const [inicio, setInicio] = useState(regra?.inicio_vigencia ?? "");
  const [fim, setFim] = useState(regra?.fim_vigencia ?? "");
  const [ativo, setAtivo] = useState(regra?.ativo ?? true);
  const [observacao, setObservacao] = useState(regra?.observacao ?? "");

  const tecnicosQuery = useQuery({
    queryKey: ["usuarios-basicos"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("usuarios_basicos");
      if (error) throw error;
      return (data ?? []) as TecnicoOption[];
    },
  });
  const tecnicos = tecnicosQuery.data ?? [];

  const usaPercentual = tipo === "percentual_mao_obra" || tipo === "percentual_receita";
  const usaFixo = tipo === "fixo_os" || tipo === "fixo_servico";

  async function salvar() {
    const pct = percentual ? Number(percentual.replace(",", ".")) : null;
    if (!regra && !tecnicoId) return toast.error("Selecione o técnico.");
    if (!inicio) return toast.error("Informe o início da vigência.");
    if (fim && fim < inicio) return toast.error("O fim da vigência não pode ser anterior ao início.");
    if (usaPercentual && (!pct || pct <= 0 || pct > 100)) return toast.error("Informe um percentual entre 0 e 100.");
    if (usaFixo && (!valorFixo || valorFixo <= 0)) return toast.error("Informe o valor fixo.");

    setSaving(true);
    try {
      const payload = {
        tecnico_id: tecnicoId,
        tipo_regra: tipo,
        percentual: usaPercentual ? pct : null,
        valor_fixo: usaFixo ? valorFixo : null,
        servico_descricao: tipo === "fixo_servico" && servico.trim() ? servico.trim() : null,
        inicio_vigencia: inicio,
        fim_vigencia: fim || null,
        ativo,
        observacao: observacao.trim() || null,
      };
      if (regra) {
        const { error } = await supabase.from("regras_comissao").update(payload).eq("id", regra.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("regras_comissao").insert(payload);
        if (error) throw error;
      }
      toast.success(regra ? "Regra atualizada. Comissões históricas não são alteradas." : "Regra de comissão criada.");
      queryClient.invalidateQueries({ queryKey: ["regras-comissao"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{regra ? "Editar Regra de Comissão" : "Nova Regra de Comissão"}</DialogTitle>
          <DialogDescription>
            A vigência define qual regra vale para cada data. Alterações não recalculam comissões históricas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Técnico *</label>
            <select
              className={inputClass}
              value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}
              disabled={!!regra}
            >
              <option value="">Selecione</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} {t.roles.includes("tecnico") ? "" : "(sem perfil técnico)"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Tipo de Comissão *</label>
            <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as ComissaoTipoRegra)}>
              {Object.entries(TIPO_REGRA).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {usaPercentual && (
            <div>
              <label className={labelClass}>Percentual (%) *</label>
              <Input inputMode="decimal" placeholder="Ex.: 20" value={percentual} onChange={(e) => setPercentual(e.target.value)} />
              {tipo === "percentual_mao_obra" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Base = receita líquida da OS menos o custo de peças. Peças não são comissionadas.
                </p>
              )}
            </div>
          )}

          {usaFixo && (
            <div>
              <label className={labelClass}>Valor Fixo (R$) *</label>
              <MoneyInput value={valorFixo} onChange={setValorFixo} />
            </div>
          )}

          {tipo === "fixo_servico" && (
            <div>
              <label className={labelClass}>Serviço</label>
              <Input placeholder="Ex.: Troca de LED, Reparo de placa" value={servico} onChange={(e) => setServico(e.target.value)} />
            </div>
          )}

          {tipo === "personalizada" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              Regra personalizada: a comissão será gerada como "Pendente de Configuração" e exigirá definição manual do valor.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Início da Vigência *</label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Fim da Vigência</label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Observação</label>
            <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <span className="text-sm font-medium">Regra ativa</span>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={salvar} disabled={saving}>{saving ? "Salvando…" : "Salvar Regra"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
