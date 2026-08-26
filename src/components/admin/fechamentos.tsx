import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { formatDateTimeITV } from "@/lib/format";
import { Carregando, PillStatus, SecaoAdmin, TabelaAdmin, rpcAdmin } from "@/components/admin/shared";
import { inputClass, labelClass } from "@/lib/caixa";
import { Button } from "@/components/ui/button";

interface CompetenciaLinha {
  competencia: string;
  caixa_dias_com_lancamento: number;
  caixa_dias_fechados: number;
  financeiro_pendencias: number;
  folha_status: string | null;
  folha_fechada_em: string | null;
  folha_fechada_por: string | null;
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

const FOLHA_LABEL: Record<string, string> = {
  aberta: "Aberta",
  em_conferencia: "Em conferência",
  aprovada: "Aprovada",
  paga: "Paga",
  fechada: "Fechada",
};

export function AdminFechamentos() {
  const anoAtual = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Manaus", year: "numeric" }).format(new Date()),
  );
  const [ano, setAno] = useState(anoAtual);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "fechamentos", ano],
    queryFn: async () => {
      const res = await rpcAdmin<{ ok: true; competencias: CompetenciaLinha[] }>("admin_fechamentos_painel", {
        p_ano: ano,
      });
      return res.competencias ?? [];
    },
  });

  return (
    <SecaoAdmin
      titulo="Fechamento de períodos"
      descricao="Visão consolidada por competência. O fechamento e a reabertura são executados nos módulos de origem, sempre com motivo e registro em auditoria."
      acoes={
        <div className="w-32">
          <label className={labelClass} htmlFor="ano-fech">
            Ano
          </label>
          <input
            id="ano-fech"
            type="number"
            className={inputClass}
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
          />
        </div>
      }
    >
      {isLoading ? (
        <Carregando />
      ) : (
        <>
          <TabelaAdmin cabecalho={["Competência", "Caixa", "Financeiro", "Folha", "Status geral"]}>
            {(data ?? []).map((c) => {
              const mes = Number(c.competencia.slice(5, 7));
              const caixaOk = c.caixa_dias_com_lancamento > 0 && c.caixa_dias_fechados >= c.caixa_dias_com_lancamento;
              const caixaVazio = c.caixa_dias_com_lancamento === 0;
              const finOk = c.financeiro_pendencias === 0;
              const folhaOk = c.folha_status === "fechada" || c.folha_status === "paga";
              const concluido = (caixaOk || caixaVazio) && finOk && folhaOk;
              return (
                <tr key={c.competencia}>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {MESES[mes - 1]}/{c.competencia.slice(0, 4)}
                  </td>
                  <td className="px-3 py-2">
                    {caixaVazio ? (
                      <PillStatus tom="neutro">Sem movimento</PillStatus>
                    ) : caixaOk ? (
                      <PillStatus tom="ok">Fechado</PillStatus>
                    ) : (
                      <PillStatus tom="alerta">
                        {c.caixa_dias_fechados}/{c.caixa_dias_com_lancamento} dias
                      </PillStatus>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {finOk ? (
                      <PillStatus tom="ok">Sem pendências</PillStatus>
                    ) : (
                      <PillStatus tom="alerta">{c.financeiro_pendencias} pendência(s)</PillStatus>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {c.folha_status ? (
                      <PillStatus tom={folhaOk ? "ok" : "alerta"}>
                        {FOLHA_LABEL[c.folha_status] ?? c.folha_status}
                      </PillStatus>
                    ) : (
                      <PillStatus tom="neutro">Não aberta</PillStatus>
                    )}
                    {c.folha_fechada_em ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.folha_fechada_por ?? "—"} · {formatDateTimeITV(c.folha_fechada_em)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {concluido ? (
                      <PillStatus tom="ok">Concluído</PillStatus>
                    ) : (
                      <PillStatus tom="neutro">Em aberto</PillStatus>
                    )}
                  </td>
                </tr>
              );
            })}
          </TabelaAdmin>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/caixa">
              <Button size="sm" variant="outline">
                Fechar caixa
              </Button>
            </Link>
            <Link to="/colaboradores">
              <Button size="sm" variant="outline">
                Folha gerencial
              </Button>
            </Link>
            <Link to="/financeiro">
              <Button size="sm" variant="outline">
                Financeiro
              </Button>
            </Link>
          </div>
        </>
      )}
    </SecaoAdmin>
  );
}
