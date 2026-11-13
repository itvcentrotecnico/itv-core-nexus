import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CheckCheck,
  Copy,
  Pencil,
  Plus,
  Printer,
  Save,
  Settings,
  Upload,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAccess } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { inputClass } from "@/lib/caixa";
import { mensagemErro } from "@/lib/erros";
import {
  lerEscala,
  gravarEscala,
  lerAcessosEscala,
  acessoPronto,
  type SemanaEscala,
} from "@/lib/escalas";
import {
  DIAS,
  adicionarDias,
  hojeManaus,
  semanaData,
  horario,
  horas,
  totalSemana,
  inconsistencias,
  propostaInicial,
  cobertura,
  intervaloTexto,
  duracaoIntervalo,
  type DiaEscala,
  type PessoaEscala,
  type RegrasEscala,
} from "@/lib/escalas-calculo";
import { GradeEscala } from "./grade";
import { IdentidadeDialog } from "./identidade-dialog";

export const HORARIOS = Array.from({ length: 48 }, (_, i) => i * 30);
export function CampoHorario({
  label,
  value,
  onChange,
  passo = 30,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  passo?: number;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select
        className={inputClass}
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">Não informado</option>
        {Array.from({ length: 1440 / passo }, (_, i) => i * passo).map((n) => (
          <option key={n} value={n}>
            {horario(n)}
          </option>
        ))}
      </select>
    </label>
  );
}
export function EscolherSemana({
  inicio,
  onChange,
}: {
  inicio: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        title="Semana anterior"
        aria-label="Semana anterior"
        onClick={() => onChange(adicionarDias(inicio, -7))}
      >
        <ChevronLeft />
      </Button>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Semana de
        <input
          aria-label="Semana de"
          type="date"
          className={inputClass}
          value={inicio}
          onChange={(e) => {
            if (e.target.value) onChange(semanaData(e.target.value));
          }}
        />
      </label>
      <Button
        variant="outline"
        size="icon"
        title="Próxima semana"
        aria-label="Próxima semana"
        onClick={() => onChange(adicionarDias(inicio, 7))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
export function EscalasPage() {
  const { can, isAdmin } = useAccess();
  const autorizado = can("escalas", "administrar");
  const qc = useQueryClient();
  const [inicio, setInicio] = useState(() => semanaData(hojeManaus()));
  const [local, setLocal] = useState<SemanaEscala | null>(null);
  const [sujo, setSujo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nova, setNova] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [config, setConfig] = useState(false);
  const [regras, setRegras] = useState<RegrasEscala | null>(null);
  const [publicar, setPublicar] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [identidade, setIdentidade] = useState<string | null>(null);
  const [conferencia, setConferencia] = useState(false);
  const [versao, setVersao] = useState("");
  const [edit, setEdit] = useState<{ p: number; d: number; dia: DiaEscala } | null>(null);
  const [pessoa, setPessoa] = useState<{
    i: number;
    nome: string;
    funcao: string;
    meta: number;
    folgas: number[];
  } | null>(null);
  const query = useQuery({
    queryKey: ["escalas", inicio],
    queryFn: () => lerEscala(inicio),
    enabled: autorizado,
  });
  const acessos = useQuery({
    queryKey: ["escalas-acessos"],
    queryFn: lerAcessosEscala,
    enabled: autorizado,
  });
  useEffect(() => {
    if (query.data) {
      setLocal(query.data.semana);
      setRegras(query.data.regras);
      setSujo(false);
      setVersao("");
    }
  }, [query.data]);
  function mudarSemana(v: string) {
    if (sujo && !window.confirm("Descartar alterações não salvas?")) return;
    setInicio(v);
    setLocal(null);
    setSujo(false);
    setVersao("");
  }
  async function acao(a: string, equipe?: PessoaEscala[], r?: RegrasEscala) {
    setBusy(true);
    try {
      const res = await gravarEscala(
        a,
        inicio,
        local?.revisao,
        equipe,
        r,
        confirmado,
        justificativa,
      );
      if (a === "validar") setConferencia(true);
      setNova(false);
      setConfig(false);
      setPublicar(false);
      setConfirmado(false);
      setSujo(false);
      if (res.inicio !== inicio) mudarSemana(res.inicio);
      await qc.invalidateQueries({ queryKey: ["escalas"] });
      await qc.invalidateQueries({ queryKey: ["minha-escala"] });
      toast.success(
        a === "publicar"
          ? "Escala publicada."
          : a === "validar"
            ? "Conferência concluída."
            : "Alteração salva.",
      );
    } catch (err) {
      toast.error(mensagemErro(err, "Não foi possível salvar a escala."));
    } finally {
      setBusy(false);
    }
  }
  if (!autorizado)
    return (
      <div className="py-16 text-center">
        <h1 className="font-display text-xl font-bold">Acesso restrito</h1>
      </div>
    );
  const historica = query.data?.versoes.find((v) => v.id === versao);
  const equipe = historica?.equipe ?? local?.equipe ?? [];
  const pendenciasAcesso = equipe.filter(
    (p) => !acessoPronto(acessos.data?.find((a) => a.colaborador_id === p.colaborador_id)),
  );
  const editavel = !!local && local.estado !== "publicada" && !historica;
  const valid = historica?.validacao ?? local?.validacao;
  const falhas = regras ? cobertura(equipe, regras) : [];
  function aplicarProposta() {
    if (
      !local ||
      !window.confirm(
        "Aplicar folgas e sábado da proposta inicial? Horários preenchidos dos dias úteis serão preservados; os demais continuarão pendentes.",
      )
    )
      return;
    const cadastrados = (query.data?.colaboradores ?? []).map(
      (c) =>
        local.equipe.find((p) => p.colaborador_id === c.id) ?? {
          colaborador_id: c.id,
          nome: c.nome,
          funcao: c.funcao,
          meta: c.meta,
          dias: DIAS.map(() => ({ folga: false, entrada: null, saida: null, intervalo: 0 })),
        },
    );
    setLocal({
      ...local,
      estado: "rascunho",
      validacao: null,
      equipe: propostaInicial(cadastrados),
    });
    setSujo(true);
  }
  function abrirNova() {
    setIds(query.data?.colaboradores.filter((c) => c.selecionado).map((c) => c.id) ?? []);
    setNova(true);
  }
  function criar() {
    const e = (query.data?.colaboradores ?? [])
      .filter((c) => ids.includes(c.id))
      .map((c) => ({
        colaborador_id: c.id,
        nome: c.nome,
        funcao: c.funcao,
        meta: c.meta,
        dias: DIAS.map((_, d) => ({
          folga: c.folgas.includes(d),
          entrada: null,
          saida: null,
          intervalo: 0,
        })),
      }));
    void acao("criar", e);
  }
  function ajustarDia() {
    if (!edit || !local) return;
    if (inconsistencias(edit.dia)) {
      toast.error("Preencha horários válidos e intervalo menor que a jornada.");
      return;
    }
    setLocal({
      ...local,
      estado: "rascunho",
      validacao: null,
      equipe: local.equipe.map((p, i) =>
        i === edit.p ? { ...p, dias: p.dias.map((d, di) => (di === edit.d ? edit.dia : d)) } : p,
      ),
    });
    setSujo(true);
    setEdit(null);
  }
  function ajustarPessoa() {
    if (!pessoa || !local) return;
    if (!pessoa.funcao.trim() || pessoa.meta <= 0 || pessoa.meta > 168) {
      toast.error("Informe função e meta entre 0 e 168 horas.");
      return;
    }
    setLocal({
      ...local,
      estado: "rascunho",
      validacao: null,
      equipe: local.equipe.map((p, i) =>
        i === pessoa.i
          ? {
              ...p,
              funcao: pessoa.funcao,
              meta: Math.round(pessoa.meta * 60),
              dias: p.dias.map((d, di) =>
                pessoa.folgas.includes(di)
                  ? { folga: true, entrada: null, saida: null, intervalo: 0 }
                  : d.folga
                    ? { folga: false, entrada: null, saida: null, intervalo: 0 }
                    : d,
              ),
            }
          : p,
      ),
    });
    setSujo(true);
    setPessoa(null);
  }
  return (
    <div className="escala-impressao min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Gestão de Equipe</p>
          <h1 className="font-display text-2xl font-bold" style={{ letterSpacing: 0 }}>
            Escalas e Jornadas
          </h1>
        </div>
        {isAdmin && (
          <Button
            className="print:hidden"
            variant="outline"
            onClick={() => setConfig(true)}
            disabled={busy || !regras}
          >
            <Settings />
            Parâmetros
          </Button>
        )}
      </header>
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <EscolherSemana inicio={inicio} onChange={mudarSemana} />
        <span className="text-sm text-muted-foreground">
          {adicionarDias(inicio, 6).split("-").reverse().join("/")} ·{" "}
          {historica
            ? `Versão ${historica.versao}`
            : local?.estado === "publicada"
              ? "Publicada"
              : local?.estado === "validada"
                ? "Validada"
                : "Rascunho"}
          {sujo ? " · Alterações não salvas" : ""}
        </span>
      </div>
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível carregar a escala.{" "}
          <Button variant="link" onClick={() => query.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {query.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {query.data && (
        <>
          <div className="print:hidden flex flex-wrap gap-2">
            {!local && (
              <Button onClick={abrirNova} disabled={busy}>
                <Plus />
                Nova escala
              </Button>
            )}
            {local && !historica && (
              <>
                <Button variant="outline" disabled={busy || sujo} onClick={() => acao("editar")}>
                  <Pencil />
                  Editar
                </Button>
                <Button disabled={busy || !sujo} onClick={() => acao("salvar", local.equipe)}>
                  <Save />
                  Salvar
                </Button>
                {editavel && (
                  <Button variant="outline" onClick={aplicarProposta} disabled={busy}>
                    <CalendarDays />
                    Proposta inicial · 7 colaboradores
                  </Button>
                )}
                <Button variant="outline" disabled={busy || sujo} onClick={() => acao("duplicar")}>
                  <Copy />
                  Duplicar semana
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || sujo || local.estado === "publicada"}
                  onClick={() => acao("validar")}
                >
                  <CheckCheck />
                  Validar
                </Button>
                <Button
                  disabled={
                    busy ||
                    sujo ||
                    local.estado !== "validada" ||
                    !acessos.isSuccess ||
                    pendenciasAcesso.length > 0
                  }
                  onClick={() => {
                    setConfirmado(false);
                    setPublicar(true);
                  }}
                >
                  <Upload />
                  Publicar
                </Button>
              </>
            )}
            {equipe.length > 0 && (
              <Button variant="outline" onClick={() => window.print()}>
                <Printer />
                Imprimir / PDF
              </Button>
            )}
            {query.data.versoes.length > 0 && (
              <select
                aria-label="Histórico de versões"
                className={`${inputClass} sm:w-52`}
                value={versao}
                onChange={(e) => {
                  if (!sujo) setVersao(e.target.value);
                  else toast.error("Salve as alterações primeiro.");
                }}
              >
                <option value="">Escala atual</option>
                {query.data.versoes.map((v) => (
                  <option value={v.id} key={v.id}>
                    Versão {v.versao} ·{" "}
                    {new Date(v.publicado_em).toLocaleDateString("pt-BR", {
                      timeZone: "America/Manaus",
                    })}
                  </option>
                ))}
              </select>
            )}
          </div>
          <section className="space-y-3 border-y border-border py-4">
            <h2 className="font-display font-semibold">Cadastros e acessos da escala</h2>
            {acessos.isPending && (
              <p className="text-sm text-muted-foreground">Conferindo acessos…</p>
            )}
            {acessos.isError && (
              <p role="alert" className="text-sm text-destructive">
                Não foi possível conferir os acessos. Publicação bloqueada.
              </p>
            )}
            <ul className="divide-y divide-border text-sm">
              {(equipe.length
                ? equipe
                : query.data.colaboradores
                    .filter((c) => c.selecionado)
                    .map((c) => ({ nome: c.nome, colaborador_id: c.id }))
              ).map((p) => {
                const a = acessos.data?.find((x) => x.colaborador_id === p.colaborador_id);
                return (
                  <li key={p.colaborador_id} className="flex flex-wrap justify-between gap-2 py-2">
                    <strong>{p.nome}</strong>
                    <span className={acessoPronto(a) ? "text-primary" : "text-destructive"}>
                      {!a
                        ? "Conferência pendente"
                        : !a.vinculado
                          ? "Sem acesso vinculado"
                          : !a.ativo
                            ? "Acesso inativo"
                            : !a.pode_consultar
                              ? "Sem permissão para Minha Escala"
                              : `Vinculado · ${a.usuario}`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {pendenciasAcesso.length > 0 && (
              <p role="alert" className="text-sm text-destructive">
                Publicação bloqueada: {pendenciasAcesso.map((p) => p.nome).join(", ")}.
              </p>
            )}
            {isAdmin &&
              ["Adriano", "Taylor"]
                .filter(
                  (nome) =>
                    !query.data.colaboradores.some((c) =>
                      c.nome.toLowerCase().includes(nome.toLowerCase()),
                    ),
                )
                .map((nome) => (
                  <div
                    key={nome}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {nome} · {nome === "Adriano" ? "Auxiliar Operacional" : "Auxiliar Logístico"}{" "}
                      · identidade pendente
                    </span>
                    <Button variant="outline" onClick={() => setIdentidade(nome)}>
                      Confirmar identidade
                    </Button>
                  </div>
                ))}
          </section>
          {!local ? (
            <div className="border-y border-border py-16 text-center">
              <CalendarDays className="mx-auto mb-3 size-8 text-primary" />
              <p className="text-muted-foreground">Nenhuma escala nesta semana.</p>
            </div>
          ) : (
            <GradeEscala
              equipe={equipe}
              inicio={inicio}
              editar={
                editavel
                  ? (p, d) => {
                      const dia = equipe[p]?.dias[d];
                      if (dia) setEdit({ p, d, dia: { ...dia } });
                    }
                  : undefined
              }
              editarPessoa={
                editavel
                  ? (i) => {
                      const p = equipe[i];
                      if (p)
                        setPessoa({
                          i,
                          nome: p.nome,
                          funcao: p.funcao,
                          meta: p.meta / 60,
                          folgas: p.dias.flatMap((d, di) => (d.folga ? [di] : [])),
                        });
                    }
                  : undefined
              }
            />
          )}
        </>
      )}
      {valid && (
        <section className="space-y-3 border-t border-border pt-4">
          <h2 className="font-display font-semibold">Conferência da jornada</h2>
          {valid.erros.length === 0 && (
            <p className="text-sm text-primary">Sem inconsistências de preenchimento.</p>
          )}
          {valid.erros.map((e, i) => (
            <p key={i} className="text-sm text-destructive">
              {e}
            </p>
          ))}
          {["operacional", "trabalhista", "jornada"].map((tipo) => {
            const a = valid.alertas.filter((x) => x.tipo === tipo);
            return a.length ? (
              <div key={tipo}>
                <h3 className="mb-1 text-sm font-semibold">
                  {tipo === "operacional"
                    ? "Cobertura operacional"
                    : tipo === "trabalhista"
                      ? "Revisão trabalhista pela administração"
                      : "Diferenças de meta"}
                </h3>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {a.map((x, i) => (
                    <li key={i}>{x.texto}</li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </section>
      )}
      {identidade && (
        <IdentidadeDialog
          pessoa={identidade}
          colaboradores={query.data?.colaboradores ?? []}
          fechar={() => setIdentidade(null)}
          concluir={(id, nome) => {
            if (local) {
              setLocal({
                ...local,
                estado: "rascunho",
                validacao: null,
                equipe: local.equipe.map((p) =>
                  p.colaborador_id === `pendente:${identidade}`
                    ? { ...p, colaborador_id: id, nome, pendente: false }
                    : p,
                ),
              });
              setSujo(true);
            }
            setIdentidade(null);
            void qc.invalidateQueries({ queryKey: ["escalas-acessos"] });
          }}
        />
      )}
      <Dialog open={conferencia} onOpenChange={setConferencia}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogTitle>Conferência final da escala</DialogTitle>
          <DialogDescription>Semana de {inicio.split("-").reverse().join("/")}</DialogDescription>
          {equipe.map((p) => (
            <section
              key={p.colaborador_id}
              className="space-y-1 border-b border-border pb-3 text-sm"
            >
              <strong>
                {p.nome} · {horas(totalSemana(p.dias))}
              </strong>
              <p>
                Meta {horas(p.meta)} · diferença {horas(totalSemana(p.dias) - p.meta)} ·{" "}
                {p.dias.filter((d) => !d.folga).length} dias trabalhados
              </p>
              <p>
                Folgas:{" "}
                {p.dias.flatMap((d, i) => (d.folga ? [DIAS[i]] : [])).join(", ") || "Nenhuma"}
              </p>
              <p>
                Intervalos:{" "}
                {p.dias
                  .flatMap((d, i) => (!d.folga ? [`${DIAS[i]} ${intervaloTexto(d)}`] : []))
                  .join("; ")}
              </p>
              <p
                className={
                  pendenciasAcesso.some((x) => x.colaborador_id === p.colaborador_id)
                    ? "text-destructive"
                    : "text-primary"
                }
              >
                {pendenciasAcesso.some((x) => x.colaborador_id === p.colaborador_id)
                  ? "Acesso pendente — publicação bloqueada"
                  : "Acesso individual conferido"}
              </p>
            </section>
          ))}
          {valid?.erros.map((e, i) => (
            <p key={i} className="text-sm text-destructive">
              {e}
            </p>
          ))}
          {falhas.map((f, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {DIAS[f.dia]} {horario(f.inicio)}–{horario(f.fim)} · {f.setor} sem cobertura
            </p>
          ))}
          {valid?.alertas
            .filter((a) => a.tipo !== "operacional")
            .map((a, i) => (
              <p key={i} className="text-sm text-muted-foreground">
                {a.texto}
              </p>
            ))}
          <Button onClick={() => setConferencia(false)}>Concluir conferência</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={nova} onOpenChange={setNova}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Nova escala</DialogTitle>
          <DialogDescription>Semana de {inicio.split("-").reverse().join("/")}</DialogDescription>
          {query.data?.colaboradores.map((c) => (
            <label key={c.id} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={ids.includes(c.id)}
                onChange={(e) =>
                  setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))
                }
              />
              <span>
                {c.nome}
                <span className="block text-xs text-muted-foreground">
                  {c.funcao} · Meta {horas(c.meta)}
                </span>
              </span>
            </label>
          ))}
          <Button disabled={busy || ids.length === 0} onClick={criar}>
            Criar rascunho
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(o) => {
          if (!o) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {edit ? `${equipe[edit.p]?.nome} · ${DIAS[edit.d]}` : "Horário"}
          </DialogTitle>
          <DialogDescription>Jornada prevista</DialogDescription>
          {edit && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.dia.folga}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      dia: e.target.checked
                        ? { folga: true, entrada: null, saida: null, intervalo: 0 }
                        : { folga: false, entrada: null, saida: null, intervalo: 0 },
                    })
                  }
                />
                Folga
              </label>
              {!edit.dia.folga && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <CampoHorario
                      label="Entrada"
                      value={edit.dia.entrada}
                      onChange={(v) => setEdit({ ...edit, dia: { ...edit.dia, entrada: v } })}
                    />
                    <CampoHorario
                      label="Saída"
                      value={edit.dia.saida}
                      onChange={(v) => setEdit({ ...edit, dia: { ...edit.dia, saida: v } })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <CampoHorario
                      label="Início do intervalo"
                      passo={15}
                      value={edit.dia.intervalo_inicio ?? null}
                      onChange={(v) => {
                        const fim = edit.dia.intervalo_fim ?? null;
                        setEdit({
                          ...edit,
                          dia: {
                            ...edit.dia,
                            intervalo_inicio: v,
                            intervalo: v !== null && fim !== null ? fim - v : 0,
                          },
                        });
                      }}
                    />
                    <CampoHorario
                      label="Fim do intervalo"
                      passo={15}
                      value={edit.dia.intervalo_fim ?? null}
                      onChange={(v) => {
                        const ini = edit.dia.intervalo_inicio ?? null;
                        setEdit({
                          ...edit,
                          dia: {
                            ...edit.dia,
                            intervalo_fim: v,
                            intervalo: v !== null && ini !== null ? v - ini : 0,
                          },
                        });
                      }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Intervalo calculado: {duracaoIntervalo(edit.dia)} min
                  </p>
                </>
              )}
              <p className="text-sm">Total do dia: {horas(totalSemana([edit.dia]))}</p>
              <Button onClick={ajustarDia}>Aplicar horário</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!pessoa}
        onOpenChange={(o) => {
          if (!o) setPessoa(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{pessoa?.nome}</DialogTitle>
          <DialogDescription>Função e jornada desta escala</DialogDescription>
          {pessoa && (
            <>
              <label className="grid gap-1 text-sm">
                Função
                <input
                  className={inputClass}
                  value={pessoa.funcao}
                  onChange={(e) => setPessoa({ ...pessoa, funcao: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Meta semanal (horas)
                <input
                  className={inputClass}
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="168"
                  value={pessoa.meta}
                  onChange={(e) => setPessoa({ ...pessoa, meta: Number(e.target.value) })}
                />
              </label>
              <fieldset>
                <legend className="mb-2 text-sm">Folgas</legend>
                <div className="grid grid-cols-2 gap-2">
                  {DIAS.map((d, i) => (
                    <label key={d} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={pessoa.folgas.includes(i)}
                        onChange={(e) =>
                          setPessoa({
                            ...pessoa,
                            folgas: e.target.checked
                              ? [...pessoa.folgas, i]
                              : pessoa.folgas.filter((x) => x !== i),
                          })
                        }
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button onClick={ajustarPessoa}>Aplicar configuração</Button>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={publicar} onOpenChange={setPublicar}>
        <DialogContent>
          <DialogTitle>Publicar escala</DialogTitle>
          <DialogDescription>
            Esta versão ficará disponível aos colaboradores vinculados.
          </DialogDescription>
          <p className="text-sm">
            {valid?.alertas.length ?? 0} avisos para conferência administrativa.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => setConfirmado(e.target.checked)}
            />
            Conferi as metas, a cobertura e os possíveis alertas trabalhistas e autorizo a
            publicação.
          </label>
          {!!valid?.alertas.length && (
            <label className="grid gap-1 text-sm">
              Decisão administrativa sobre os alertas
              <textarea
                className={inputClass}
                value={justificativa}
                onChange={(e) => setJustificativa(e.target.value)}
              />
            </label>
          )}
          <Button
            disabled={
              !confirmado ||
              busy ||
              !acessos.isSuccess ||
              pendenciasAcesso.length > 0 ||
              (!!valid?.alertas.length && justificativa.trim().length < 10)
            }
            onClick={() => acao("publicar")}
          >
            Confirmar publicação
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={config} onOpenChange={setConfig}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogTitle>Parâmetros administrativos</DialogTitle>
          <DialogDescription>
            Limites sujeitos à revisão trabalhista da administração.
          </DialogDescription>
          {regras && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["abertura", "Seg–Sex: entrada"],
                    ["fechamento", "Seg–Sex: saída"],
                    ["sabado_abertura", "Sábado: entrada"],
                    ["sabado_fechamento", "Sábado: saída"],
                  ] as const
                ).map(([k, l]) => (
                  <CampoHorario
                    key={k}
                    label={l}
                    value={regras[k]}
                    onChange={(v) => {
                      if (v !== null) setRegras({ ...regras, [k]: v });
                    }}
                  />
                ))}
              </div>
              {(
                [
                  ["max_diario", "Limite diário (min)"],
                  ["intervalo_apos", "Exigir intervalo após (min)"],
                  ["intervalo_minimo", "Intervalo mínimo (min)"],
                  ["minimo_sabado", "Equipe mínima no sábado"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="grid gap-1 text-sm">
                  {l}
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    value={regras[k]}
                    onChange={(e) => setRegras({ ...regras, [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
              {(
                [
                  ["domingo_fechado", "Domingo fechado"],
                  ["todos_sabado", "Todos trabalham aos sábados"],
                ] as const
              ).map(([k, l]) => (
                <label key={k} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={regras[k]}
                    onChange={(e) => setRegras({ ...regras, [k]: e.target.checked })}
                  />
                  {l}
                </label>
              ))}
              <fieldset>
                <legend className="mb-2 text-sm">Prioridade de equipe completa</legend>
                <div className="grid grid-cols-2 gap-2">
                  {DIAS.map((d, i) => (
                    <label key={d} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={regras.prioridade_completa.includes(i)}
                        onChange={(e) =>
                          setRegras({
                            ...regras,
                            prioridade_completa: e.target.checked
                              ? [...regras.prioridade_completa, i]
                              : regras.prioridade_completa.filter((x) => x !== i),
                          })
                        }
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button disabled={busy} onClick={() => acao("configurar", undefined, regras)}>
                Salvar parâmetros
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
