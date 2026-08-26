import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, Download, ShieldCheck } from "lucide-react";

import { useAccess } from "@/hooks/use-auth";
import { formatDateTimeITV, todayManausISO } from "@/lib/format";
import { DATASETS_EXPORTACAO } from "@/lib/admin";
import { inputClass, labelClass } from "@/lib/caixa";
import { exportarCSV } from "@/components/relatorios/shared";
import { Carregando, SecaoAdmin, executarAcao, rpcAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";

interface BackupInfo {
  volumes: Record<string, number>;
  ultima_exportacao: string | null;
  ultimo_registro: string | null;
}

const ROTULO_VOLUME: Record<string, string> = {
  caixa_lancamentos: "Lançamentos de caixa",
  custos_os: "Custos por OS",
  comissoes: "Comissões",
  despesas: "Despesas",
  contas_pagar: "Contas a pagar",
  contas_receber: "Contas a receber",
  producao_tecnica: "Produção técnica",
  colaboradores: "Colaboradores",
  audit_logs: "Registros de auditoria",
};

export function AdminBackup() {
  const { isAdmin, can } = useAccess();
  const podeExportar = isAdmin || can("admin_backup", "exportar");
  const primeiroDia = `${todayManausISO().slice(0, 7)}-01`;
  const [dataset, setDataset] = useState(DATASETS_EXPORTACAO[0]!.value);
  const [inicio, setInicio] = useState(primeiroDia);
  const [fim, setFim] = useState(todayManausISO());
  const [exportando, setExportando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "backup-info"],
    queryFn: () => rpcAdmin<{ ok: true } & BackupInfo>("admin_backup_info"),
  });

  async function exportar() {
    setExportando(true);
    await executarAcao(async () => {
      const res = await rpcAdmin<{ ok: true; linhas: Record<string, unknown>[] }>("admin_exportar", {
        p_dataset: dataset,
        p_inicio: inicio,
        p_fim: fim,
      });
      const linhas = res.linhas ?? [];
      if (linhas.length === 0) throw new Error("Sem dados no período selecionado.");
      const cabecalho = Object.keys(linhas[0]!);
      exportarCSV(
        `itv-${dataset}-${inicio}-a-${fim}.csv`,
        cabecalho,
        linhas.map((l) => cabecalho.map((c) => (l[c] === null || l[c] === undefined ? "" : String(l[c])))),
      );
    }, "Exportação concluída.");
    setExportando(false);
  }

  return (
    <div className="space-y-6">
      <SecaoAdmin
        titulo="Exportação administrativa"
        descricao="Gere cópias estruturadas em CSV para conferência externa ou guarda independente. Toda exportação é registrada na auditoria."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="exp-dataset">
              Conjunto de dados
            </label>
            <select id="exp-dataset" className={inputClass} value={dataset} onChange={(e) => setDataset(e.target.value)}>
              {DATASETS_EXPORTACAO.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="exp-inicio">
              Início
            </label>
            <input id="exp-inicio" type="date" className={inputClass} value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label className={labelClass} htmlFor="exp-fim">
              Fim
            </label>
            <input id="exp-fim" type="date" className={inputClass} value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
        </div>
        <Button className="mt-4" disabled={!podeExportar || exportando} onClick={() => void exportar()}>
          <Download className="mr-2 size-4" /> {exportando ? "Exportando…" : "Exportar CSV"}
        </Button>
      </SecaoAdmin>

      <SecaoAdmin
        titulo="Segurança e backup"
        descricao="Volume de dados sob gestão e política de guarda. Nenhuma credencial de acesso é exibida aqui."
      >
        {isLoading ? (
          <Carregando />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data?.volumes ?? {}).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{ROTULO_VOLUME[k] ?? k}</p>
                  <p className="text-lg font-semibold text-foreground">{Number(v).toLocaleString("pt-BR")}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Database className="size-4" /> Backup automático diário do banco gerenciado, com retenção contínua no
                ambiente de nuvem do sistema.
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4" /> Chaves e segredos ficam apenas no servidor — nunca são expostos ao
                navegador nem a esta tela.
              </p>
              <p>
                Última exportação administrativa:{" "}
                {data?.ultima_exportacao ? formatDateTimeITV(data.ultima_exportacao) : "nenhuma registrada"}.
              </p>
              <p>
                Último evento auditado: {data?.ultimo_registro ? formatDateTimeITV(data.ultimo_registro) : "—"}.
              </p>
              <p>
                Recomendação: exportar mensalmente Caixa, Financeiro e Produção e guardar as cópias fora do sistema,
                garantindo independência dos dados.
              </p>
            </div>
          </>
        )}
      </SecaoAdmin>
    </div>
  );
}
