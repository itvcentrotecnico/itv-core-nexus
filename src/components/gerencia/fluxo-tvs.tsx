import { formatDateOnlyISO, todayManausISO } from "@/lib/format";
import { useGerenciaResumo, usePendenciasAbertas } from "@/lib/gerencia";
import { diasNaItv } from "@/lib/operacional";

const FAIXAS = [
  { label: "0–3 dias · Normal", min: 0, max: 3 },
  { label: "4–7 dias · Atenção", min: 4, max: 7 },
  { label: "8–15 dias · Crítico", min: 8, max: 15 },
  { label: "16+ dias · Prioridade", min: 16, max: Infinity },
];

function Num({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="font-display text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Fluxo semanal de TVs: entradas, entregas, saldo, taxa de saída e dias na ITV. */
export function FluxoTvs() {
  const { dashboard } = useGerenciaResumo();
  const pendencias = usePendenciasAbertas();
  const hoje = todayManausISO();

  if (dashboard.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando o fluxo da semana…</p>;
  if (dashboard.isError || !dashboard.data)
    return (
      <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
        Não foi possível carregar o fluxo de TVs agora. Tente novamente.
      </p>
    );

  const s = dashboard.data.semana;
  const linhas = pendencias.data ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">
          Semana {s.semana} · {formatDateOnlyISO(s.inicio)} a {formatDateOnlyISO(s.fim)}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Num
            label="Entradas da semana"
            value={String(s.entradas)}
            sub={s.entradas_informadas ? `Fonte: ${s.entradas_fonte}` : "Entradas não informadas"}
          />
          <Num label="Entregues" value={String(s.entregas)} sub="Coletas e Entregas" />
          <Num label="Em aberto (saldo)" value={String(s.saldo)} />
          <Num
            label="Taxa de saída"
            value={s.taxa_saida != null ? `${s.taxa_saida}%` : "—"}
            sub="Entregas ÷ entradas do período. As TVs entregues podem ter entrado em semanas anteriores."
          />
        </div>
        {s.saldo > s.classificadas && (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
            Faltam explicar {s.saldo - s.classificadas} TVs desta semana no Fechamento Semanal.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Dias na ITV</h2>
        {linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma TV pendente classificada.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FAIXAS.map((f) => (
              <Num
                key={f.label}
                label={f.label}
                value={String(
                  linhas.filter((p) => {
                    const d = diasNaItv(p.data_entrada, hoje);
                    return d >= f.min && d <= f.max;
                  }).length,
                )}
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Faixas padrão da operação; podem ser ajustadas depois nos parâmetros.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Estoque operacional</h2>
        {(dashboard.data.estoque ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados de estoque classificado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {dashboard.data.estoque.map((e) => (
              <Num key={e.motivo_id} label={e.motivo} value={String(e.total)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
