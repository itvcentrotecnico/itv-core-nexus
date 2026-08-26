import { useEffect, useState } from "react";

import { formatCurrencyBRL, ITV_TIMEZONE } from "@/lib/format";
import type { ModoTvConfig, ModoTvIndicadores } from "@/lib/modo-tv";
import { STATUS_RITMO_LABEL, nomeCurto, percentualTecnico } from "@/lib/modo-tv";
import { cn } from "@/lib/utils";
import logoColor from "@/assets/itv-logo-color.png.asset.json";

/* ---------- Blocos base, dimensionados para leitura de 3 a 8 metros ---------- */

export function CardTv({
  titulo,
  children,
  className,
  destaque,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
  destaque?: boolean;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-[1.5vw] border p-[1.6vw]",
        destaque ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/[0.04]",
        className,
      )}
    >
      <h2 className="mb-[0.8vw] text-[1.05vw] font-semibold uppercase tracking-[0.22em] text-white/55">{titulo}</h2>
      {children}
    </section>
  );
}

export function ValorGigante({ valor, tom = "claro" }: { valor: string; tom?: "claro" | "verde" | "atencao" }) {
  return (
    <p
      className={cn(
        "font-display font-black leading-[0.95] tabular-nums",
        tom === "verde" ? "text-primary" : tom === "atencao" ? "text-amber-400" : "text-white",
      )}
      style={{ fontSize: "4.2vw" }}
    >
      {valor}
    </p>
  );
}

export function BarraProgresso({ pct, tom = "verde" }: { pct: number; tom?: "verde" | "atencao" }) {
  const largura = Math.max(Math.min(pct, 100), 0);
  return (
    <div className="h-[1.6vw] w-full overflow-hidden rounded-full bg-white/10" role="presentation">
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-out", tom === "verde" ? "bg-primary" : "bg-amber-400")}
        style={{ width: `${largura}%` }}
      />
    </div>
  );
}

/* ---------- Cabeçalho e rodapé ---------- */

export function CabecalhoTv({ referencia }: { referencia: string }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000 * 20);
    return () => clearInterval(id);
  }, []);

  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: ITV_TIMEZONE, hour: "2-digit", minute: "2-digit" });
  const data = agora.toLocaleDateString("pt-BR", {
    timeZone: ITV_TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <header className="flex items-center justify-between px-[2vw] pt-[1.6vw]">
      <div className="flex items-center gap-[1.2vw]">
        <img src={logoColor.url} alt="ITV Centro Técnico" className="h-[3.2vw] w-auto" />
        <div className="border-l border-white/15 pl-[1.2vw]">
          <p className="text-[1.1vw] font-semibold uppercase tracking-[0.2em] text-white/80">Painel de Desempenho</p>
          <p className="text-[0.85vw] uppercase tracking-[0.18em] text-white/40">Gestão ITV Centro Técnico</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-display text-[2.6vw] font-bold leading-none tabular-nums text-white">{hora}</p>
        <p className="mt-[0.3vw] text-[0.9vw] capitalize text-white/45">{data}</p>
      </div>
      <span className="sr-only">Referência: {referencia}</span>
    </header>
  );
}

export function RodapeTv({ indice, total, mensagem }: { indice: number; total: number; mensagem: string | null }) {
  return (
    <footer className="flex items-center justify-between px-[2vw] pb-[1.4vw]">
      <p className="text-[0.9vw] text-white/35">
        {mensagem ?? "Dados oficiais: Caixa Diário, Metas e Produção Técnica validada · America/Manaus"}
      </p>
      <div className="flex gap-[0.5vw]" aria-hidden="true">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn("h-[0.5vw] rounded-full transition-all duration-500", i === indice ? "w-[2.4vw] bg-primary" : "w-[0.5vw] bg-white/20")}
          />
        ))}
      </div>
    </footer>
  );
}

/* ---------- TELA 1 — Meta da empresa ---------- */

export function TelaMeta({ d, config }: { d: ModoTvIndicadores; config: ModoTvConfig }) {
  const meta = d.meta;
  const pct = meta?.percentual ?? 0;
  const tomMeta = pct >= 100 ? "verde" : pct >= 70 ? "claro" : "atencao";
  const statusTom = d.ritmo.status === "acima" ? "verde" : d.ritmo.status === "no_ritmo" ? "claro" : "atencao";

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-[1.2vw]">
      {config.mostrar_faturamento && (
        <CardTv titulo="Faturamento do Mês" className="col-span-5 row-span-3 justify-center">
          <ValorGigante valor={formatCurrencyBRL(d.faturamento.mes)} tom="verde" />
          <p className="mt-[0.8vw] text-[1.2vw] text-white/55">
            {d.faturamento.os} OS faturadas
            {config.mostrar_ticket_medio && ` · Ticket médio ${formatCurrencyBRL(d.faturamento.ticket_medio)}`}
          </p>
        </CardTv>
      )}

      {config.mostrar_meta && (
        <CardTv titulo="Meta ITV do Mês" className="col-span-7 row-span-3 justify-center" destaque>
          {meta ? (
            <>
              <div className="flex items-end justify-between">
                <ValorGigante valor={`${pct.toFixed(1).replace(".", ",")}%`} tom={tomMeta} />
                <p className="pb-[0.6vw] text-right text-[1.5vw] font-semibold tabular-nums text-white/75">
                  {formatCurrencyBRL(meta.realizado)}
                  <span className="text-[1.1vw] font-normal text-white/40"> / {formatCurrencyBRL(meta.valor)}</span>
                </p>
              </div>
              <div className="mt-[1vw]">
                <BarraProgresso pct={pct} tom={pct >= 70 ? "verde" : "atencao"} />
              </div>
              <div className="mt-[1vw] flex justify-between text-[1.2vw] text-white/60">
                <span>
                  Faltam <strong className="text-white">{formatCurrencyBRL(meta.faltante)}</strong>
                </span>
                <span>
                  <strong className="text-white">{d.mes.dias_restantes}</strong> dias restantes
                </span>
              </div>
            </>
          ) : (
            <p className="text-[1.6vw] text-white/45">Nenhuma meta principal definida para o período.</p>
          )}
        </CardTv>
      )}

      <CardTv titulo="Ritmo Atual" className="col-span-3 row-span-3 justify-center">
        <p className="font-display text-[2.9vw] font-black leading-none tabular-nums text-white">
          {formatCurrencyBRL(d.ritmo.atual)}
        </p>
        <p className="mt-[0.4vw] text-[1.1vw] text-white/45">por dia</p>
      </CardTv>

      <CardTv titulo="Ritmo Necessário" className="col-span-3 row-span-3 justify-center">
        <p className="font-display text-[2.9vw] font-black leading-none tabular-nums text-white">
          {formatCurrencyBRL(d.ritmo.necessario)}
        </p>
        <p className="mt-[0.4vw] text-[1.1vw] text-white/45">por dia para atingir a meta</p>
      </CardTv>

      {config.mostrar_projecao && (
        <CardTv titulo="Projeção de Fechamento" className="col-span-6 row-span-3 justify-center">
          <div className="flex items-end gap-[2vw]">
            <ValorGigante valor={formatCurrencyBRL(d.ritmo.projecao)} tom={statusTom === "verde" ? "verde" : statusTom} />
            <span
              className={cn(
                "mb-[1vw] rounded-full px-[1.4vw] py-[0.5vw] text-[1.2vw] font-bold uppercase tracking-wide",
                d.ritmo.status === "acima"
                  ? "bg-primary/25 text-primary"
                  : d.ritmo.status === "no_ritmo"
                    ? "bg-white/10 text-white/80"
                    : "bg-amber-400/20 text-amber-300",
              )}
            >
              {STATUS_RITMO_LABEL[d.ritmo.status]}
            </span>
          </div>
          {meta && (
            <p className="mt-[0.6vw] text-[1.2vw] text-white/50">Meta do mês: {formatCurrencyBRL(meta.valor)}</p>
          )}
        </CardTv>
      )}
    </div>
  );
}

/* ---------- TELA 2 — Produção dos técnicos ---------- */

export function TelaProducao({ d, config }: { d: ModoTvIndicadores; config: ModoTvConfig }) {
  const tecnicos = d.tecnicos.slice(0, 6);

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-[1.2vw]">
      <CardTv titulo="Validados Hoje" className="col-span-2 row-span-2 justify-center">
        <ValorGigante valor={String(d.producao.hoje)} tom="verde" />
      </CardTv>
      <CardTv titulo="Validados na Semana" className="col-span-2 row-span-2 justify-center">
        <ValorGigante valor={String(d.producao.semana)} />
      </CardTv>
      <CardTv titulo="Validados no Mês" className="col-span-3 row-span-2 justify-center">
        <ValorGigante valor={String(d.producao.mes)} />
      </CardTv>

      {config.mostrar_mensagem && config.mensagem_texto ? (
        <CardTv titulo={config.mensagem_titulo || "Mensagem"} className="col-span-5 row-span-2 justify-center" destaque>
          <p className="text-[1.8vw] font-semibold leading-tight text-white">{config.mensagem_texto}</p>
        </CardTv>
      ) : (
        <CardTv titulo="Destaque da Semana" className="col-span-5 row-span-2 justify-center" destaque>
          {config.criterio_destaque === "validacao" && d.destaque_semana.validacao ? (
            <>
              <p className="font-display text-[2.4vw] font-black leading-none text-primary">
                {nomeCurto(d.destaque_semana.validacao.tecnico)}
              </p>
              <p className="mt-[0.4vw] text-[1.2vw] text-white/55">
                {d.destaque_semana.validacao.indice.toFixed(1).replace(".", ",")}% de validação
              </p>
            </>
          ) : d.destaque_semana.producao ? (
            <>
              <p className="font-display text-[2.4vw] font-black leading-none text-primary">
                {nomeCurto(d.destaque_semana.producao.tecnico)}
              </p>
              <p className="mt-[0.4vw] text-[1.2vw] text-white/55">
                {d.destaque_semana.producao.servicos} serviços validados na semana
              </p>
            </>
          ) : (
            <p className="text-[1.4vw] text-white/40">Sem dados na semana.</p>
          )}
        </CardTv>
      )}

      <CardTv titulo="Produção da Equipe · Realizado vs Meta" className="col-span-12 row-span-4">
        {tecnicos.length === 0 ? (
          <p className="flex flex-1 items-center justify-center text-[1.6vw] text-white/35">
            Sem produção validada no mês.
          </p>
        ) : (
          <div className="mt-[0.6vw] grid flex-1 grid-cols-2 gap-x-[2.4vw] gap-y-[1vw] content-center">
            {tecnicos.map((t) => {
              const pct = percentualTecnico(t);
              return (
                <div key={t.tecnico_id}>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[1.6vw] font-bold text-white">{nomeCurto(t.tecnico)}</p>
                    <p className="text-[1.3vw] tabular-nums text-white/60">
                      {formatCurrencyBRL(t.valor_mes)}
                      {t.meta?.valor ? <span className="text-white/35"> / {formatCurrencyBRL(t.meta.valor)}</span> : null}
                      {pct != null && (
                        <span className={cn("ml-[0.8vw] font-bold", pct >= 100 ? "text-primary" : pct >= 70 ? "text-white" : "text-amber-400")}>
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="mt-[0.5vw]">
                    <BarraProgresso pct={pct ?? 0} tom={(pct ?? 0) >= 70 ? "verde" : "atencao"} />
                  </div>
                  <p className="mt-[0.3vw] text-[0.95vw] text-white/35">
                    {t.validados_mes} serviços validados{pct == null ? " · sem meta definida" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardTv>
    </div>
  );
}

/* ---------- TELA 3 — Serviços executados ---------- */

export function TelaServicos({ d, config }: { d: ModoTvIndicadores; config: ModoTvConfig }) {
  const tipos = d.tipos_servico.slice(0, 5);
  const marcas = d.marcas.slice(0, 6);
  const maxMarca = Math.max(...marcas.map((m) => m.quantidade), 1);

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-[1.2vw]">
      <CardTv titulo="Serviços Validados no Mês" className="col-span-4 row-span-2 justify-center">
        <ValorGigante valor={String(d.producao.mes)} tom="verde" />
      </CardTv>

      {config.mostrar_ranking && (
        <CardTv titulo="Destaques do Mês" className="col-span-8 row-span-2 justify-center">
          {d.ranking.length === 0 ? (
            <p className="text-[1.4vw] text-white/35">Sem produção validada.</p>
          ) : (
            <div className="flex items-end justify-between gap-[1.5vw]">
              {d.ranking.slice(0, 3).map((r, i) => (
                <div key={r.tecnico} className="flex-1">
                  <p className={cn("text-[1.1vw] font-bold", i === 0 ? "text-primary" : "text-white/40")}>{i + 1}º</p>
                  <p className="truncate text-[1.7vw] font-bold text-white">{nomeCurto(r.tecnico)}</p>
                  <p className="text-[1.2vw] tabular-nums text-white/55">{formatCurrencyBRL(r.valor)}</p>
                </div>
              ))}
            </div>
          )}
        </CardTv>
      )}

      {config.mostrar_tipos_servico && (
        <CardTv titulo="Serviços Mais Executados" className="col-span-7 row-span-4">
          {tipos.length === 0 ? (
            <p className="flex flex-1 items-center text-[1.4vw] text-white/35">Sem dados no mês.</p>
          ) : (
            <div className="mt-[0.6vw] flex flex-1 flex-col justify-center gap-[1vw]">
              {tipos.map((t) => (
                <div key={t.tipo}>
                  <div className="flex items-baseline justify-between">
                    <p className="truncate text-[1.5vw] font-semibold text-white">{t.tipo}</p>
                    <p className="text-[1.5vw] font-bold tabular-nums text-primary">
                      {t.pct.toFixed(0)}%
                    </p>
                  </div>
                  <div className="mt-[0.4vw]">
                    <BarraProgresso pct={t.pct} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardTv>
      )}

      {config.mostrar_marcas && (
        <CardTv titulo="Marcas Mais Atendidas" className="col-span-5 row-span-4">
          {marcas.length === 0 ? (
            <p className="flex flex-1 items-center text-[1.4vw] text-white/35">Sem dados no mês.</p>
          ) : (
            <div className="mt-[0.6vw] flex flex-1 flex-col justify-center gap-[0.9vw]">
              {marcas.map((m) => (
                <div key={m.marca} className="flex items-center gap-[1vw]">
                  <p className="w-[7vw] shrink-0 truncate text-[1.4vw] font-semibold text-white">{m.marca}</p>
                  <div className="h-[1.2vw] flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${(m.quantidade / maxMarca) * 100}%` }} />
                  </div>
                  <p className="w-[3vw] shrink-0 text-right text-[1.4vw] font-bold tabular-nums text-white/70">{m.quantidade}</p>
                </div>
              ))}
            </div>
          )}
        </CardTv>
      )}
    </div>
  );
}

/* ---------- TELA 4 — Comparativo mensal ---------- */

export function TelaComparativo({ d }: { d: ModoTvIndicadores }) {
  const evo = d.faturamento.evolucao_pct;
  const positivo = (evo ?? 0) >= 0;

  return (
    <div className="grid h-full grid-cols-12 grid-rows-6 gap-[1.2vw]">
      <CardTv titulo="Mês Atual (até hoje)" className="col-span-4 row-span-3 justify-center">
        <ValorGigante valor={formatCurrencyBRL(d.faturamento.mes)} tom="verde" />
        <p className="mt-[0.6vw] text-[1.1vw] text-white/45">{d.mes.dias_decorridos} dias decorridos</p>
      </CardTv>

      <CardTv titulo="Mesmo Período · Mês Anterior" className="col-span-4 row-span-3 justify-center">
        <ValorGigante valor={formatCurrencyBRL(d.faturamento.mes_anterior_mesmo_periodo)} />
      </CardTv>

      <CardTv titulo="Evolução" className="col-span-4 row-span-3 justify-center" destaque={positivo}>
        {evo == null ? (
          <p className="text-[1.6vw] text-white/40">Sem base de comparação.</p>
        ) : (
          <>
            <ValorGigante valor={`${positivo ? "+" : ""}${evo.toFixed(1).replace(".", ",")}%`} tom={positivo ? "verde" : "atencao"} />
            <p className="mt-[0.6vw] text-[1.2vw] text-white/50">
              {positivo ? "acima" : "abaixo"} do mesmo período do mês anterior
            </p>
          </>
        )}
      </CardTv>

      <CardTv titulo="Produção Validada no Mês" className="col-span-4 row-span-3 justify-center">
        <ValorGigante valor={String(d.producao.mes)} />
        <p className="mt-[0.6vw] text-[1.1vw] text-white/45">serviços conferidos pela gerência</p>
      </CardTv>

      <CardTv titulo="Dias Restantes" className="col-span-4 row-span-3 justify-center">
        <ValorGigante valor={String(d.mes.dias_restantes)} tom={d.mes.dias_restantes <= 5 ? "atencao" : "claro"} />
        <p className="mt-[0.6vw] text-[1.1vw] text-white/45">para o fechamento do mês</p>
      </CardTv>

      <CardTv titulo="Projeção de Fechamento" className="col-span-4 row-span-3 justify-center">
        <ValorGigante valor={formatCurrencyBRL(d.ritmo.projecao)} tom={d.ritmo.status === "atencao" ? "atencao" : "verde"} />
        <p className="mt-[0.6vw] text-[1.2vw] text-white/50">{STATUS_RITMO_LABEL[d.ritmo.status]}</p>
      </CardTv>
    </div>
  );
}
