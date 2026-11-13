import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { lerMinhaEscala } from "@/lib/escalas";
import {
  DIAS,
  hojeManaus,
  semanaData,
  adicionarDias,
  horas,
  horario,
  totalSemana,
} from "@/lib/escalas-calculo";
import { useAccess } from "@/hooks/use-auth";
import { EscolherSemana } from "./escalas-page";
import { cn } from "@/lib/utils";
export function MinhaEscalaPage() {
  const [inicio, setInicio] = useState(() => semanaData(hojeManaus()));
  const { can } = useAccess();
  const query = useQuery({
    queryKey: ["minha-escala", inicio],
    queryFn: () => lerMinhaEscala(inicio),
    enabled: can("minha_escala", "visualizar"),
  });
  const pub = query.data?.publicacao;
  return (
    <div className="min-w-0 space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold" style={{ letterSpacing: 0 }}>
          Minha Escala
        </h1>
      </header>
      <EscolherSemana inicio={inicio} onChange={setInicio} />
      {query.isPending && <p className="text-muted-foreground">Carregando…</p>}
      {query.isError && (
        <p role="alert" className="text-destructive">
          Não foi possível consultar os horários.
        </p>
      )}
      {query.data && (!pub || pub.equipe.length === 0) && (
        <div className="border-y border-border py-12 text-center">
          <CalendarDays className="mx-auto mb-3 size-8 text-primary" />
          <p className="text-muted-foreground">
            {query.data.vinculado
              ? "Nenhuma escala publicada para você nesta semana."
              : "Seu acesso ainda não está vinculado a um colaborador. Solicite o vínculo à administração."}
          </p>
        </div>
      )}
      {pub?.equipe.map((p) => {
        const proximo = p.dias.findIndex(
          (d, i) => !d.folga && d.entrada !== null && adicionarDias(inicio, i) >= hojeManaus(),
        );
        return (
          <section key={p.colaborador_id} className="space-y-4">
            <div className="flex flex-wrap justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 className="font-display text-lg font-semibold">{p.nome}</h2>
                <p className="text-sm text-muted-foreground">{p.funcao}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-primary">{horas(totalSemana(p.dias))}</p>
                <p className="text-xs text-muted-foreground">
                  Meta {horas(p.meta)} · Diferença {horas(totalSemana(p.dias) - p.meta)}
                </p>
              </div>
            </div>
            <p className="text-sm">
              Próximo dia nesta semana:{" "}
              {proximo < 0
                ? "Sem próximos dias programados"
                : `${DIAS[proximo]}, ${adicionarDias(inicio, proximo).split("-").reverse().join("/")} às ${horario(p.dias[proximo]?.entrada ?? null)}`}
            </p>
            <ul className="divide-y divide-border border-y border-border">
              {p.dias.map((d, i) => (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3 py-4",
                    d.folga && "bg-accent/40",
                  )}
                >
                  <div>
                    <strong className="text-sm">{DIAS[i]}</strong>
                    <p className="text-xs text-muted-foreground">
                      {adicionarDias(inicio, i).split("-").reverse().join("/")}
                    </p>
                  </div>
                  <div className="text-right">
                    {d.folga ? (
                      <span className="text-sm font-semibold text-primary">Folga</span>
                    ) : (
                      <>
                        <p className="text-sm font-semibold">
                          {horario(d.entrada)} – {horario(d.saida)}
                        </p>
                        <p className="text-xs text-muted-foreground">Intervalo {d.intervalo} min</p>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Versão {pub.versao} · Atualizada em{" "}
              {new Date(pub.publicado_em).toLocaleString("pt-BR", { timeZone: "America/Manaus" })}
            </p>
          </section>
        );
      })}
    </div>
  );
}
