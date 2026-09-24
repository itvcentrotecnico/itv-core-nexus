import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Flag, Gauge, Target, TrendingUp } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import type { CaixaIndicadores } from "@/lib/caixa";
import { formatCurrencyBRL, todayManausISO } from "@/lib/format";
import {
  FAIXA_LABEL,
  METAS_PADRAO,
  RITMO_LABEL,
  SEMAFORO_LABEL,
  calcularProjecao,
  type MetasFaturamento,
  type Semaforo,
} from "@/lib/projecao";
import { cn } from "@/lib/utils";

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const SEMAFORO_CLASSE: Record<Semaforo, string> = {
  vermelho: "border-destructive/30 bg-destructive/5 text-destructive",
  amarelo: "border-amber-500/30 bg-amber-500/5 text-amber-700",
  verde_claro: "border-primary/30 bg-primary/5 text-primary",
  verde: "border-primary/50 bg-primary/10 text-primary",
};

function Bloco({
  titulo,
  icone: Icone,
  children,
}: {
  titulo: string;
  icone: typeof Target;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        <Icone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function fmtDias(v: number): string {
  return v.toFixed(1).replace(".", ",").replace(",0", "");
}

/**
 * Projeção de fechamento do mês: metas, ritmo necessário, projeção e marcos.
 * Usa exclusivamente a fonte do Caixa Diário (caixa_indicadores) do mês corrente.
 */
export function ProjecaoMesCard() {
  const hojeIso = todayManausISO();
  const hoje = useMemo(() => {
    const [y = 0, m = 1, d = 1] = hojeIso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }, [hojeIso]);

  const inicioMes = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const segunda = useMemo(() => {
    const s = new Date(hoje);
    s.setDate(hoje.getDate() - ((hoje.getDay() + 6) % 7));
    const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return iso(s < primeiro ? primeiro : s);
  }, [hoje]);

  const mesQuery = useQuery({
    queryKey: ["projecao-mes", inicioMes, hojeIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_indicadores", {
        p_from: inicioMes,
        p_to: hojeIso,
      });
      if (error) throw error;
      return data as unknown as CaixaIndicadores;
    },
  });

  const semanaQuery = useQuery({
    queryKey: ["projecao-semana", segunda, hojeIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("caixa_indicadores", {
        p_from: segunda,
        p_to: hojeIso,
      });
      if (error) throw error;
      return data as unknown as CaixaIndicadores;
    },
  });

  // Metas do mês corrente, cadastradas em metas_empresa (repetem todo mês).
  // Sem cadastro (ou sem permissão de leitura), cai no padrão 120K/125K/130K.
  const metasQuery = useQuery({
    queryKey: ["projecao-metas", inicioMes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("metas_empresa")
        .select("nome, valor_alvo")
        .eq("tipo", "faturamento")
        .eq("data_inicio", inicioMes);
      if (error) throw error;
      const metas = { ...METAS_PADRAO };
      for (const row of data ?? []) {
        const valor = Number(row.valor_alvo);
        if (!Number.isFinite(valor) || valor <= 0) continue;
        if (row.nome.startsWith("Piso")) metas.piso = valor;
        else if (row.nome.startsWith("Desafio")) metas.desafio = valor;
        else if (row.nome.startsWith("Meta")) metas.meta = valor;
      }
      return metas as MetasFaturamento;
    },
  });

  const ind = mesQuery.data;
  const semanaInd = semanaQuery.data;

  const p = useMemo(
    () =>
      calcularProjecao({
        // Meta de Serviços: somente receitas classificadas como SERVIÇOS.
        faturamento: ind?.ok ? (ind.receita_servicos ?? 0) : 0,
        ticketMedio: ind?.ok ? (ind.ticket_medio_servicos ?? 0) : 0,
        hoje,
        realizadoSemana: semanaInd?.ok ? (semanaInd.receita_servicos ?? 0) : null,
        metas: metasQuery.data ?? METAS_PADRAO,
      }),
    [ind, semanaInd, hoje, metasQuery.data],
  );

  if (mesQuery.isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        Carregando a projeção do mês…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Meta de Serviços
          </p>
          <h2 className="font-display text-lg font-bold text-card-foreground">
            Projeção de {MESES[hoje.getMonth()]}
          </h2>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold",
            SEMAFORO_CLASSE[p.semaforo],
          )}
        >
          {SEMAFORO_LABEL[p.semaforo]}
        </span>
      </div>

      {/* 1. Realizado em Serviços */}
      <p className="mt-4 font-display text-3xl font-bold text-card-foreground">
        {formatCurrencyBRL(p.faturamento)}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Realizado em Serviços · faltam{" "}
        {formatCurrencyBRL(Math.max(p.metas.piso - p.faturamento, 0))} para o piso ·{" "}
        {fmtDias(p.diasDecorridos)} dias operacionais decorridos
      </p>
      {ind?.ok && (
        <div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">
            Outras receitas (fora da meta)
          </p>
          <div className="mt-1 flex justify-between">
            <span>Acessórios</span>
            <span className="font-medium">{formatCurrencyBRL(ind.receita_acessorios ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Venda de TVs</span>
            <span className="font-medium">{formatCurrencyBRL(ind.receita_venda_tv ?? 0)}</span>
          </div>
          {(ind.receita_sem_classificacao ?? 0) > 0 && (
            <div className="flex justify-between text-destructive">
              <span>Aguardando classificação</span>
              <span className="font-medium">
                {formatCurrencyBRL(ind.receita_sem_classificacao ?? 0)}
              </span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold">
            <span>Faturamento Total ITV</span>
            <span>{formatCurrencyBRL(ind.faturamento_final)}</span>
          </div>
        </div>
      )}

      {/* 2. Progresso até o desafio */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {formatCurrencyBRL(p.faturamento)} / {formatCurrencyBRL(p.metas.desafio)}
          </span>
          <span className="font-semibold text-foreground">
            {p.progresso.toFixed(0)}% alcançado
          </span>
        </div>
        <div className="relative mt-2 h-3 w-full overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${p.progresso}%` }}
          />
          {p.marcos.map((m) => (
            <span
              key={m.valor}
              className={cn(
                "absolute top-0 h-3 w-0.5",
                m.atingido ? "bg-primary-foreground/70" : "bg-border",
              )}
              style={{ left: `${m.posicao}%` }}
              aria-hidden="true"
            />
          ))}
        </div>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {p.marcos.map((m) => (
            <li
              key={m.valor}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                m.atingido
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {m.atingido ? "✓ " : ""}
              {(m.valor / 1000).toFixed(0)}K
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {/* 3. Próximo marco */}
        <Bloco titulo="Próximo marco" icone={Flag}>
          {p.proximoMarco ? (
            <>
              <p className="font-display text-xl font-bold text-foreground">
                {formatCurrencyBRL(p.proximoMarco.valor)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Faltam {formatCurrencyBRL(p.proximoMarco.falta)}
              </p>
            </>
          ) : (
            <p className="text-sm text-foreground">Todos os marcos do mês foram alcançados.</p>
          )}
        </Bloco>

        {/* 6. Projeção de fechamento */}
        <Bloco titulo="Projeção atual" icone={TrendingUp}>
          <p className="font-display text-xl font-bold text-foreground">
            {formatCurrencyBRL(p.projecao)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Faixa: {FAIXA_LABEL[p.faixa]} · média diária × dias operacionais restantes
          </p>
        </Bloco>
      </div>

      {/* 4. Quanto falta e 5. ritmo necessário por dia */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {p.niveis.map((n) => (
          <div key={n.chave} className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {n.rotulo} — {formatCurrencyBRL(n.alvo)}
            </p>
            <p className="mt-1.5 font-display text-lg font-bold text-foreground">
              {n.falta > 0 ? `Faltam ${formatCurrencyBRL(n.falta)}` : "Alcançado"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {n.falta > 0
                ? `${formatCurrencyBRL(n.ritmoDiario)} por dia operacional`
                : "Nenhum valor pendente"}
            </p>
          </div>
        ))}
      </div>

      {/* Ritmo atual x necessário */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Bloco titulo="Ritmo atual x necessário" icone={Gauge}>
          <div className="space-y-1 text-sm">
            <p className="text-foreground">
              Média atual:{" "}
              <strong className="font-semibold">{formatCurrencyBRL(p.mediaDiaria)}</strong>/dia
            </p>
            <p className="text-muted-foreground">
              Necessário para {formatCurrencyBRL(p.metas.desafio)}:{" "}
              {formatCurrencyBRL(p.ritmoNecessarioDesafio)}/dia
            </p>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                p.ritmoStatus === "acima"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : p.ritmoStatus === "no_ritmo"
                    ? "border-border bg-muted text-muted-foreground"
                    : "border-amber-500/30 bg-amber-500/5 text-amber-700",
              )}
            >
              {RITMO_LABEL[p.ritmoStatus]}
            </span>
            <span className="text-xs text-muted-foreground">
              {p.diferencaRitmo >= 0 ? "+" : "−"}
              {formatCurrencyBRL(Math.abs(p.diferencaRitmo))}/dia ·{" "}
              {fmtDias(p.diasRestantes)} dias restantes
            </span>
          </div>
        </Bloco>

        {/* 7. Meta semanal */}
        <Bloco titulo="Meta desta semana" icone={CalendarClock}>
          {p.semana ? (
            <div className="space-y-1 text-sm">
              <p className="text-foreground">
                Realizado:{" "}
                <strong className="font-semibold">{formatCurrencyBRL(p.semana.realizado)}</strong>
              </p>
              <p className="text-muted-foreground">
                Meta necessária: {formatCurrencyBRL(p.semana.meta)}
              </p>
              <p className={cn(p.semana.falta > 0 ? "text-amber-700" : "text-primary")}>
                {p.semana.falta > 0
                  ? `Faltam ${formatCurrencyBRL(p.semana.falta)}`
                  : "Semana dentro da trajetória"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem dados</p>
          )}
        </Bloco>
      </div>

      {/* 8 e 9. Simulador e cenários de ticket (progressive disclosure) */}
      <details className="mt-3 rounded-lg border border-border bg-background p-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Simulador de ticket médio (estimativa)
        </summary>
        <p className="mt-3 text-xs text-muted-foreground">
          Ticket médio atual: {formatCurrencyBRL(p.ticketMedio)} — estimativa de lançamentos
          equivalentes, não uma previsão exata.
        </p>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {p.niveis.map((n) => (
            <li key={n.chave}>
              Para {formatCurrencyBRL(n.alvo)}:{" "}
              {n.lancamentos == null
                ? "sem ticket médio no período"
                : n.lancamentos === 0
                  ? "alcançado"
                  : `aproximadamente ${n.lancamentos} lançamentos`}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cenários de ticket para {formatCurrencyBRL(p.metas.desafio)}
        </p>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {p.cenarios.map((c) => (
            <li key={c.ticket}>
              Ticket {formatCurrencyBRL(c.ticket)} → ~{c.lancamentos ?? "—"} lançamentos
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
