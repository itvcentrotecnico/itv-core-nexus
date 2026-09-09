import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Info, TriangleAlert } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

import { formatCurrencyBRL, formatDateOnlyISO } from "@/lib/format";
import { NIVEL_ALERTA, rpcOp, type OperacionalDashboard } from "@/lib/operacional";
import { cn } from "@/lib/utils";

interface Props {
  onIrPara?: (aba: string) => void;
  onEstoque?: (motivo: string) => void;
}

/** Destinos padrão dentro da Gerência Operacional (usados quando não há abas). */
const DESTINO: Record<string, string> = {
  validacao: "/gerencia-operacional/validacao-tecnica",
  comissoes: "/gerencia-operacional/comissoes",
  fechamento: "/gerencia-operacional/fechamento",
};

function Bloco({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-bold text-foreground">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

function Num({
  label,
  value,
  sub,
  onClick,
  destaque,
}: {
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
  destaque?: boolean;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "rounded-lg border border-border p-3 text-left transition",
        destaque ? "bg-primary/5" : "bg-background",
        onClick && "hover:border-primary/50 hover:bg-muted/60",
      )}
    >
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </Comp>
  );
}

const ATIVOS = ["pronto_coleta", "assumida", "em_rota", "no_local", "nao_realizada"];

/** Indicadores clicáveis que ligam a Central Operacional às Coletas e Entregas. */
function ColetasBloco() {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["operacional", "coletas-indicadores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("coletas_solicitacoes")
        .select("tipo, status, motorista_id")
        .in("status", [...ATIVOS, "aguardando_cadastro"])
        .limit(500);
      if (error) throw error;
      const linhas = data ?? [];
      return {
        aguardando: linhas.filter((l) => l.status === "aguardando_cadastro").length,
        coletas: linhas.filter((l) => l.tipo === "coleta" && ATIVOS.includes(l.status)).length,
        entregas: linhas.filter((l) => l.tipo === "entrega" && ATIVOS.includes(l.status)).length,
        semMotorista: linhas.filter((l) => ATIVOS.includes(l.status) && !l.motorista_id).length,
      };
    },
  });

  const ir = () => void navigate({ to: "/coletas" });

  return (
    <Bloco
      titulo="Coletas e Entregas"
      acao={
        <button type="button" className="text-xs font-semibold text-primary" onClick={ir}>
          Abrir Coletas
        </button>
      }
    >
      {query.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {query.isError && (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar os indicadores de coletas.
        </p>
      )}
      {query.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num label="Aguardando cadastro" value={String(query.data.aguardando)} onClick={ir} />
          <Num label="Coletas em aberto" value={String(query.data.coletas)} onClick={ir} />
          <Num label="Entregas em aberto" value={String(query.data.entregas)} onClick={ir} />
          <Num
            label="Sem motorista"
            value={String(query.data.semMotorista)}
            destaque
            onClick={ir}
          />
        </div>
      )}
    </Bloco>
  );
}

/** Dashboard do ADM Operacional: prioriza ação (pendências → validação → comissões → fluxo). */
export function OperacionalDashboardView({ onIrPara, onEstoque }: Props = {}) {
  const navigate = useNavigate();
  const irPara = (aba: string) => {
    if (onIrPara) return onIrPara(aba);
    void navigate({ to: DESTINO[aba] ?? "/gerencia-operacional" });
  };
  const irEstoque = (motivo: string) => {
    if (onEstoque) return onEstoque(motivo);
    void navigate({ to: "/gerencia-operacional/pendencias" });
  };
  const query = useQuery({
    queryKey: ["operacional", "dashboard"],
    queryFn: () => rpcOp<OperacionalDashboard>("operacional_dashboard"),
    refetchInterval: 120_000,
  });

  if (query.isLoading) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Carregando a Central Operacional…
      </p>
    );
  }
  if (query.isError) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        {(query.error as Error).message}
      </p>
    );
  }
  const d = query.data;
  if (!d) return null;

  const alertas = [...(d.alertas ?? [])].sort(
    (a, b) => (NIVEL_ALERTA[a.nivel]?.ordem ?? 9) - (NIVEL_ALERTA[b.nivel]?.ordem ?? 9),
  );

  return (
    <div className="space-y-4">
      <Bloco titulo="Alertas operacionais">
        {alertas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum alerta operacional. Tudo em dia.</p>
        ) : (
          <ul className="space-y-2">
            {alertas.map((a, i) => {
              const nivel = NIVEL_ALERTA[a.nivel] ?? {
                label: "Informativo",
                className: "bg-muted text-muted-foreground",
                ordem: 2,
              };
              const Icon =
                a.nivel === "critico"
                  ? TriangleAlert
                  : a.nivel === "atencao"
                    ? AlertTriangle
                    : Info;
              return (
                <li
                  key={`${a.tipo}-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-border bg-background p-3"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{a.mensagem}</p>
                    <span
                      className={cn(
                        "mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        nivel.className,
                      )}
                    >
                      {nivel.label}
                    </span>
                  </div>
                  {(a.tipo === "fechamento" ||
                    a.tipo === "paradas" ||
                    a.tipo === "envelhecimento") && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary"
                      onClick={() => irPara("fechamento")}
                    >
                      Abrir
                    </button>
                  )}
                  {(a.tipo === "validacao" || a.tipo === "sem_tecnico") && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary"
                      onClick={() => irPara("validacao")}
                    >
                      Abrir
                    </button>
                  )}
                  {(a.tipo === "comissoes" || a.tipo === "devolucao") && (
                    <button
                      type="button"
                      className="text-xs font-semibold text-primary"
                      onClick={() => irPara("comissoes")}
                    >
                      Abrir
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Bloco>

      <Bloco
        titulo="Produção técnica — hoje"
        acao={
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => irPara("validacao")}
          >
            Abrir fila
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Num
            label="Aguardando validação"
            value={String(d.hoje.aguardando_validacao)}
            destaque
            onClick={() => irPara("validacao")}
          />
          <Num
            label="Correções solicitadas"
            value={String(d.hoje.correcao_solicitada)}
            onClick={() => irPara("validacao")}
          />
          <Num label="Validados hoje" value={String(d.hoje.validados_hoje)} />
          <Num label="Rejeitados" value={String(d.hoje.rejeitados)} />
          <Num
            label="Sem técnico definido"
            value={String(d.hoje.sem_tecnico)}
            onClick={() => irPara("validacao")}
          />
          <Num
            label="Sem tipo definido"
            value={String(d.hoje.sem_tipo)}
            onClick={() => irPara("validacao")}
          />
        </div>
      </Bloco>

      <Bloco
        titulo="Comissões operacionais"
        acao={
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => irPara("comissoes")}
          >
            Conferir e liberar
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Num
            label="Geradas"
            value={String(d.comissoes.geradas)}
            onClick={() => irPara("comissoes")}
          />
          <Num
            label="Conferidas"
            value={String(d.comissoes.conferidas)}
            onClick={() => irPara("comissoes")}
          />
          <Num label="Liberadas p/ Financeiro" value={String(d.comissoes.liberadas)} destaque />
          <Num
            label="Devolvidas"
            value={String(d.comissoes.devolvidas)}
            onClick={() => irPara("comissoes")}
          />
          <Num label="Pagas no mês" value={String(d.comissoes.pagas_mes)} />
          <Num
            label="Valor liberado"
            value={formatCurrencyBRL(Number(d.comissoes.valor_liberado ?? 0))}
          />
        </div>
      </Bloco>

      <Bloco
        titulo={`Fluxo de TVs — semana ${d.semana.semana} (${formatDateOnlyISO(d.semana.inicio)} a ${formatDateOnlyISO(d.semana.fim)})`}
        acao={
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => irPara("fechamento")}
          >
            Fechamento semanal
          </button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num
            label="TVs recebidas"
            value={String(d.semana.entradas)}
            sub={
              d.semana.entradas_informadas
                ? `Fonte: ${d.semana.entradas_fonte}`
                : "Entradas não informadas"
            }
          />
          <Num label="Entregues" value={String(d.semana.entregas)} sub="Coletas/Entregas" />
          <Num label="Saldo não entregue" value={String(d.semana.saldo)} destaque />
          <Num
            label="Taxa de saída"
            value={d.semana.taxa_saida != null ? `${d.semana.taxa_saida}%` : "—"}
            sub="Compara volume de entrada e saída do período; as TVs entregues não são necessariamente as recebidas na semana."
          />
        </div>
        {d.semana.saldo > d.semana.classificadas && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
            Faltam explicar {d.semana.saldo - d.semana.classificadas} TVs desta semana.
          </p>
        )}
      </Bloco>

      <ColetasBloco />

      <Bloco titulo="Estoque operacional">
        {(d.estoque ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma TV pendente classificada.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {d.estoque.map((e) => (
              <Num
                key={e.motivo_id}
                label={e.motivo}
                value={String(e.total)}
                onClick={() => irEstoque(e.motivo_id)}
              />
            ))}
          </div>
        )}
      </Bloco>
    </div>
  );
}
