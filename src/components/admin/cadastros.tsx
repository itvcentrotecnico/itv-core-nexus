import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAccess } from "@/hooks/use-auth";
import { CADASTROS, type CadastroConfig, type CampoCadastro } from "@/lib/admin";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  BotaoAcao,
  Carregando,
  ConfirmarAcao,
  PillStatus,
  SecaoAdmin,
  SemDados,
  TabelaAdmin,
  executarAcao,
  rpcAdmin,
} from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Registro = Record<string, unknown> & { id: string; ativo?: boolean };

function valorPadrao(campo: CampoCadastro): unknown {
  if (campo.padrao !== undefined) return campo.padrao;
  return campo.tipo === "booleano" ? false : campo.tipo === "numero" ? 0 : "";
}

function novoFormulario(config: CadastroConfig, registro?: Registro): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const c of config.campos)
    base[c.nome] = registro ? (registro[c.nome] ?? valorPadrao(c)) : valorPadrao(c);
  return base;
}

export function AdminCadastros() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeAdministrar = isAdmin || can("admin_parametros", "administrar");
  const chaves = Object.keys(CADASTROS);
  const [tabela, setTabela] = useState(chaves[0]!);
  const config = CADASTROS[tabela]!;

  const [dialogAberto, setDialogAberto] = useState(false);
  const [editando, setEditando] = useState<Registro | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>(() => novoFormulario(config));
  const [alvoDesativar, setAlvoDesativar] = useState<Registro | null>(null);
  const [dependencias, setDependencias] = useState<{
    total: number;
    detalhes: { tabela: string; registros: number }[];
  } | null>(null);

  useEffect(() => {
    setForm(novoFormulario(config));
    setEditando(null);
  }, [config]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "cadastro", tabela],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from(tabela as never)
        .select("*")
        .order(config.ordenar ?? "ordem", { ascending: true });
      if (error) throw error;
      return (rows ?? []) as unknown as Registro[];
    },
  });

  const colunas = useMemo(() => config.campos.filter((c) => c.colunaLista), [config]);
  const invalidar = () =>
    void queryClient.invalidateQueries({ queryKey: ["admin", "cadastro", tabela] });

  function abrirNovo() {
    setEditando(null);
    setForm(novoFormulario(config));
    setDialogAberto(true);
  }

  function abrirEdicao(registro: Registro) {
    setEditando(registro);
    setForm(novoFormulario(config, registro));
    setDialogAberto(true);
  }

  async function salvar() {
    const faltando = config.campos.find((c) => c.obrigatorio && !String(form[c.nome] ?? "").trim());
    if (faltando) {
      await executarAcao(() => Promise.reject(new Error(`Informe: ${faltando.label}`)), "");
      return;
    }
    const ok = await executarAcao(
      () =>
        rpcAdmin("admin_cadastro_salvar", {
          p_tabela: tabela,
          p_dados: form,
          p_id: editando?.id ?? null,
        }),
      editando ? "Cadastro atualizado." : "Cadastro criado.",
      invalidar,
    );
    if (ok) setDialogAberto(false);
  }

  async function abrirDesativacao(registro: Registro) {
    setAlvoDesativar(registro);
    setDependencias(null);
    try {
      const res = await rpcAdmin<{
        ok: true;
        total: number;
        detalhes: { tabela: string; registros: number }[];
      }>("admin_cadastro_dependencias", { p_tabela: tabela, p_id: registro.id });
      setDependencias({ total: res.total, detalhes: res.detalhes ?? [] });
    } catch {
      setDependencias({ total: 0, detalhes: [] });
    }
  }

  return (
    <SecaoAdmin
      titulo="Cadastros mestres"
      descricao="Tudo o que muda operacionalmente fica aqui, não no código. Cadastros com histórico são desativados, nunca apagados."
      acoes={
        <Button size="sm" onClick={abrirNovo} disabled={!podeAdministrar}>
          <Plus className="mr-2 size-4" /> Novo
        </Button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {chaves.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTabela(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              k === tabela
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {CADASTROS[k]!.titulo}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{config.descricao}</p>

      {isLoading ? (
        <Carregando />
      ) : (data ?? []).length === 0 ? (
        <SemDados label="Nenhum registro cadastrado." />
      ) : (
        <TabelaAdmin cabecalho={[...colunas.map((c) => c.label), "Situação", "Ações"]}>
          {(data ?? []).map((r) => (
            <tr key={r.id}>
              {colunas.map((c) => (
                <td key={c.nome} className="px-3 py-2 text-foreground">
                  {c.tipo === "booleano"
                    ? r[c.nome]
                      ? "Sim"
                      : "Não"
                    : c.tipo === "select"
                      ? (c.opcoes?.find((o) => o.value === r[c.nome])?.label ??
                        String(r[c.nome] ?? "—"))
                      : String(r[c.nome] ?? "—")}
                </td>
              ))}
              <td className="px-3 py-2">
                {r.ativo === false ? (
                  <PillStatus tom="alerta">Inativo</PillStatus>
                ) : (
                  <PillStatus tom="ok">Ativo</PillStatus>
                )}
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <BotaoAcao onClick={() => abrirEdicao(r)} disabled={!podeAdministrar}>
                    <Pencil className="mr-1.5 size-3.5" /> Editar
                  </BotaoAcao>
                  {r.ativo === false ? (
                    <BotaoAcao
                      disabled={!podeAdministrar}
                      onClick={() =>
                        void executarAcao(
                          () =>
                            rpcAdmin("admin_cadastro_ativo", {
                              p_tabela: tabela,
                              p_id: r.id,
                              p_ativo: true,
                            }),
                          "Cadastro reativado.",
                          invalidar,
                        )
                      }
                    >
                      Reativar
                    </BotaoAcao>
                  ) : (
                    <BotaoAcao
                      variant="destructive"
                      disabled={!podeAdministrar}
                      onClick={() => void abrirDesativacao(r)}
                    >
                      Desativar
                    </BotaoAcao>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </TabelaAdmin>
      )}

      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando ? "Editar" : "Novo"} — {config.titulo}
            </DialogTitle>
            <DialogDescription>{config.descricao}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {config.campos.map((c) => (
              <div key={c.nome}>
                {c.tipo === "booleano" ? (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <span className="font-medium text-foreground">{c.label}</span>
                      {c.hint ? (
                        <span className="block text-xs text-muted-foreground">{c.hint}</span>
                      ) : null}
                    </span>
                    <Switch
                      checked={!!form[c.nome]}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, [c.nome]: v }))}
                    />
                  </label>
                ) : (
                  <>
                    <label className={labelClass} htmlFor={`campo-${c.nome}`}>
                      {c.label}
                      {c.obrigatorio ? " *" : ""}
                    </label>
                    {c.tipo === "select" ? (
                      <select
                        id={`campo-${c.nome}`}
                        className={inputClass}
                        value={String(form[c.nome] ?? "")}
                        onChange={(e) => setForm((f) => ({ ...f, [c.nome]: e.target.value }))}
                      >
                        {c.opcoes?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={`campo-${c.nome}`}
                        className={inputClass}
                        type={c.tipo === "numero" ? "number" : "text"}
                        step={c.tipo === "numero" ? "0.01" : undefined}
                        value={String(form[c.nome] ?? "")}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            [c.nome]:
                              c.tipo === "numero" ? Number(e.target.value || 0) : e.target.value,
                          }))
                        }
                      />
                    )}
                    {c.hint ? <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p> : null}
                  </>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={!podeAdministrar}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmarAcao
        aberto={!!alvoDesativar}
        titulo="Desativar cadastro"
        descricao="O registro deixa de aparecer em novos lançamentos. Todo o histórico permanece intacto."
        aviso={
          dependencias === null
            ? "Verificando dependências…"
            : dependencias.total === 0
              ? "Nenhum registro histórico vinculado."
              : `Este cadastro possui ${dependencias.total.toLocaleString("pt-BR")} registro(s) histórico(s): ${dependencias.detalhes
                  .map((d) => `${d.tabela} (${d.registros})`)
                  .join(", ")}.`
        }
        pedirMotivo
        confirmarLabel="Desativar"
        onCancel={() => setAlvoDesativar(null)}
        onConfirm={async (motivo) => {
          if (!alvoDesativar) return;
          await executarAcao(
            () =>
              rpcAdmin("admin_cadastro_ativo", {
                p_tabela: tabela,
                p_id: alvoDesativar.id,
                p_ativo: false,
                p_motivo: motivo,
              }),
            "Cadastro desativado.",
            invalidar,
          );
          setAlvoDesativar(null);
        }}
      />
    </SecaoAdmin>
  );
}
