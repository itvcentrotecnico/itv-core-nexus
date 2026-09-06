import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDateTimeITV } from "@/lib/format";
import { mensagemErro } from "@/lib/coletas";
import { posicaoDesatualizada, rpcEquipe, type EquipeExternaItem } from "@/lib/equipe-externa";

/** Painel gerencial: última posição conhecida e carga de trabalho de cada motorista. */
export function EquipeExternaPainel() {
  const query = useQuery({
    queryKey: ["equipe-externa", "painel"],
    refetchInterval: 120_000,
    queryFn: () => rpcEquipe<EquipeExternaItem[]>("equipe_externa_painel"),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Carregando equipe…</p>;

  if (query.isError) {
    return (
      <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
        {mensagemErro(query.error, "Não foi possível carregar a equipe externa.")}
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const equipe = query.data ?? [];
  if (equipe.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Nenhum motorista ativo cadastrado no momento.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {equipe.map((m) => {
        const ativo = m.expediente_status === "ativo";
        const velho = posicaoDesatualizada(m.registrado_em);
        return (
          <article key={m.motorista_id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-base font-bold text-foreground">{m.motorista}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  ativo ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {ativo ? "Em expediente" : "Fora de expediente"}
              </span>
            </div>

            <p className="mt-2 text-sm text-muted-foreground">
              {m.bairro ? `Região: ${m.bairro}` : "Região não informada"}
            </p>
            <p className="text-xs text-muted-foreground">
              {ativo && velho ? "🟡 " : ""}
              Última atualização:{" "}
              {m.registrado_em ? formatDateTimeITV(m.registrado_em) : "sem registro"}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coletas</p>
                <p className="font-display text-lg font-bold text-foreground">
                  {m.coletas_atribuidas}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Entregas
                </p>
                <p className="font-display text-lg font-bold text-foreground">
                  {m.entregas_atribuidas}
                </p>
              </div>
            </div>

            {m.latitude != null && m.longitude != null && (
              <Button asChild variant="outline" className="mt-3 h-10 w-full text-xs">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${m.latitude},${m.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MapPin className="mr-1.5 size-4" aria-hidden="true" /> Ver última posição
                  <ExternalLink className="ml-1.5 size-3" aria-hidden="true" />
                </a>
              </Button>
            )}
          </article>
        );
      })}
    </div>
  );
}
