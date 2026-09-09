import { useMemo, useState } from "react";

import { diasNaItv, faixaDias } from "@/lib/operacional";
import { formatDateOnlyISO, formatDateTimeITV, todayManausISO } from "@/lib/format";
import { usePendenciasAbertas, type PendenciaLinha } from "@/lib/gerencia";
import { cn } from "@/lib/utils";

/** Pendências operacionais por motivo — cada categoria abre os registros. */
export function PendenciasOperacionais() {
  const query = usePendenciasAbertas();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [soParadas, setSoParadas] = useState(false);
  const hoje = todayManausISO();

  const linhas = query.data ?? [];

  const grupos = useMemo(() => {
    const mapa = new Map<string, { nome: string; total: number }>();
    for (const p of linhas) {
      const nome = p.motivo?.nome ?? "Outro";
      const atual = mapa.get(p.motivo_id) ?? { nome, total: 0 };
      atual.total += 1;
      mapa.set(p.motivo_id, atual);
    }
    return [...mapa.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total);
  }, [linhas]);

  const paradas = linhas.filter(
    (p) => diasNaItv(String(p.ultima_movimentacao).slice(0, 10), hoje) >= 5,
  );

  const visiveis: PendenciaLinha[] = (soParadas ? paradas : linhas).filter(
    (p) => !motivo || p.motivo_id === motivo,
  );

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando pendências…</p>;
  if (query.isError)
    return (
      <p className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
        Não foi possível carregar as pendências agora. Tente novamente.
      </p>
    );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-display text-sm font-bold text-foreground">Pendências por motivo</h2>
        {grupos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma TV pendente classificada.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {grupos.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => {
                  setSoParadas(false);
                  setMotivo(motivo === g.id ? null : g.id);
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition hover:border-primary/50 hover:bg-muted/60",
                  motivo === g.id ? "border-primary bg-primary/5" : "border-border bg-background",
                )}
              >
                <p className="font-display text-2xl font-bold text-foreground">{g.total}</p>
                <p className="text-xs font-medium text-muted-foreground">{g.nome}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-foreground">TVs sem movimentação</h2>
          <button
            type="button"
            onClick={() => {
              setMotivo(null);
              setSoParadas((v) => !v);
            }}
            className="text-xs font-semibold text-primary"
          >
            {soParadas ? "Ver todas as pendências" : `Ver ${paradas.length} paradas há 5+ dias`}
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {paradas.length === 0
            ? "Nenhuma TV parada acima do limite."
            : `${paradas.length} TVs sem atualização relevante há 5 dias ou mais.`}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-foreground">
            Registros {motivo ? "do motivo selecionado" : soParadas ? "parados" : "em aberto"} (
            {visiveis.length})
          </h2>
          {(motivo || soParadas) && (
            <button
              type="button"
              className="text-xs font-semibold text-primary"
              onClick={() => {
                setMotivo(null);
                setSoParadas(false);
              }}
            >
              Limpar filtro
            </button>
          )}
        </div>

        {visiveis.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nenhuma pendência nesta seleção.
          </p>
        ) : (
          <ul className="space-y-2">
            {visiveis.map((p) => {
              const dias = diasNaItv(p.data_entrada, hoje);
              const faixa = faixaDias(dias);
              return (
                <li key={p.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-sm font-bold text-foreground">
                      OS {p.os} · {p.cliente ?? "Cliente não informado"}
                    </p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        faixa.className,
                      )}
                    >
                      {dias} dias na ITV · {faixa.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[p.marca, p.modelo, p.polegadas ? `${p.polegadas}"` : null]
                      .filter(Boolean)
                      .join(" · ") || "TV não detalhada"}
                    {" — "}
                    {p.motivo?.nome ?? "Outro"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Técnico: {p.tecnico?.full_name ?? "não definido"} · Entrada:{" "}
                    {formatDateOnlyISO(p.data_entrada)} · Última movimentação:{" "}
                    {formatDateTimeITV(p.ultima_movimentacao)}
                  </p>
                  {p.observacao && (
                    <p className="mt-1 text-xs text-foreground">{p.observacao}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
