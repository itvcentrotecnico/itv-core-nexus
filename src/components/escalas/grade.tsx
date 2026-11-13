import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DIAS,
  horas,
  horario,
  totalSemana,
  minutosDia,
  adicionarDias,
  type PessoaEscala,
} from "@/lib/escalas-calculo";
export function GradeEscala({
  equipe,
  inicio,
  editar,
  editarPessoa,
}: {
  equipe: PessoaEscala[];
  inicio: string;
  editar?: ((pessoa: number, dia: number) => void) | undefined;
  editarPessoa?: ((pessoa: number) => void) | undefined;
}) {
  return (
    <div className="max-w-full overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full min-w-[1100px] text-sm">
        <thead className="bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 w-44 bg-muted p-3 text-left">Colaborador</th>
            {DIAS.map((dia, i) => (
              <th key={dia} className="w-28 p-3">
                {dia}
                <span className="block font-normal">
                  {adicionarDias(inicio, i).slice(8)}/{adicionarDias(inicio, i).slice(5, 7)}
                </span>
              </th>
            ))}
            <th className="p-3">Semana</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {equipe.map((p, pi) => {
            const total = totalSemana(p.dias);
            return (
              <tr key={p.colaborador_id}>
                <th className="sticky left-0 z-10 bg-card p-3 text-left font-normal">
                  {editarPessoa ? (
                    <Button
                      variant="link"
                      className="h-auto max-w-44 whitespace-normal p-0 text-left"
                      onClick={() => editarPessoa(pi)}
                    >
                      {p.nome}
                    </Button>
                  ) : (
                    <strong>{p.nome}</strong>
                  )}
                  <span className="mt-1 block text-xs text-muted-foreground">{p.funcao}</span>
                </th>
                {p.dias.map((d, di) => (
                  <td key={di} className={cn("p-2 text-center", d.folga && "bg-accent/40")}>
                    {editar ? (
                      <Button
                        variant="ghost"
                        className="h-20 w-full flex-col gap-1 p-1"
                        aria-label={`Editar ${p.nome} ${DIAS[di]}`}
                        onClick={() => editar(pi, di)}
                      >
                        {d.folga ? (
                          <span className="text-primary">Folga</span>
                        ) : (
                          <>
                            <span>
                              {horario(d.entrada)}–{horario(d.saida)}
                            </span>
                            <span className="text-xs font-normal text-muted-foreground">
                              Intervalo {d.intervalo} min
                            </span>
                            <span className="text-xs text-primary">{horas(minutosDia(d))}</span>
                          </>
                        )}
                      </Button>
                    ) : (
                      <div className="flex h-20 flex-col justify-center gap-1">
                        {d.folga ? (
                          <span className="text-primary">Folga</span>
                        ) : (
                          <>
                            <span>
                              {horario(d.entrada)}–{horario(d.saida)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Intervalo {d.intervalo} min
                            </span>
                            <span className="text-xs text-primary">{horas(minutosDia(d))}</span>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                ))}
                <td className="p-3 text-center">
                  <strong>{horas(total)}</strong>
                  <span className="block text-xs text-muted-foreground">Meta {horas(p.meta)}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      total === p.meta ? "text-primary" : "text-destructive",
                    )}
                  >
                    {total > p.meta ? "+" : ""}
                    {horas(total - p.meta)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
