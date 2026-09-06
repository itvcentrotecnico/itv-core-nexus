import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  STATUS_BACKUP,
  TIPOS_BACKUP,
  type BackupRegistro,
  type BackupStatus,
} from "@/lib/governanca";
import { Database, Download, ShieldCheck } from "lucide-react";

import { useAccess } from "@/hooks/use-auth";
import { formatDateTimeITV, todayManausISO } from "@/lib/format";
import { DATASETS_EXPORTACAO } from "@/lib/admin";
import { inputClass, labelClass } from "@/lib/caixa";
import { exportarCSV } from "@/components/relatorios/shared";
import { Carregando, SecaoAdmin, executarAcao, rpcAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";

interface BackupInfo {
  [k: string]: unknown;
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
    queryFn: () => rpcAdmin<BackupInfo & { ok: boolean }>("admin_backup_info"),
  });

  async function exportar() {
    setExportando(true);
    await executarAcao(async () => {
      const res = await rpcAdmin<{ ok: true; linhas: Record<string, unknown>[] }>(
        "admin_exportar",
        {
          p_dataset: dataset,
          p_inicio: inicio,
          p_fim: fim,
        },
      );
      const linhas = res.linhas ?? [];
      if (linhas.length === 0) throw new Error("Sem dados no período selecionado.");
      const cabecalho = Object.keys(linhas[0]!);
      exportarCSV(
        `itv-${dataset}-${inicio}-a-${fim}.csv`,
        cabecalho,
        linhas.map((l) =>
          cabecalho.map((c) => (l[c] === null || l[c] === undefined ? "" : String(l[c]))),
        ),
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
            <select
              id="exp-dataset"
              className={inputClass}
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
            >
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
            <input
              id="exp-inicio"
              type="date"
              className={inputClass}
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="exp-fim">
              Fim
            </label>
            <input
              id="exp-fim"
              type="date"
              className={inputClass}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        </div>
        <Button
          className="mt-4"
          disabled={!podeExportar || exportando}
          onClick={() => void exportar()}
        >
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {ROTULO_VOLUME[k] ?? k}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {Number(v).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2">
                <Database className="size-4" /> Backup automático diário do banco gerenciado, com
                retenção contínua no ambiente de nuvem do sistema.
              </p>
              <p className="flex items-center gap-2">
                <ShieldCheck className="size-4" /> Chaves e segredos ficam apenas no servidor —
                nunca são expostos ao navegador nem a esta tela.
              </p>
              <p>
                Última exportação administrativa:{" "}
                {data?.ultima_exportacao
                  ? formatDateTimeITV(data.ultima_exportacao)
                  : "nenhuma registrada"}
                .
              </p>
              <p>
                Último evento auditado:{" "}
                {data?.ultimo_registro ? formatDateTimeITV(data.ultimo_registro) : "—"}.
              </p>
              <p>
                Recomendação: exportar mensalmente Caixa, Financeiro e Produção e guardar as cópias
                fora do sistema, garantindo independência dos dados.
              </p>
            </div>
          </>
        )}
      </SecaoAdmin>

      <RegistroBackup podeRegistrar={podeExportar} />
    </div>
  );
}

function RegistroBackup({ podeRegistrar }: { podeRegistrar: boolean }) {
  const queryClient = useQueryClient();
  const [data, setData] = useState(todayManausISO());
  const [tipo, setTipo] = useState(TIPOS_BACKUP[0]!.value);
  const [local, setLocal] = useState("");
  const [status, setStatus] = useState(STATUS_BACKUP[0]!.value);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const statusQuery = useQuery({
    queryKey: ["admin", "backup-status"],
    queryFn: () => rpcAdmin<BackupStatus & { [k: string]: unknown }>("admin_backup_status"),
  });

  const registrosQuery = useQuery({
    queryKey: ["admin", "backup-registros"],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("backup_registros")
        .select("*, responsavel:profiles!backup_registros_responsavel_id_fkey(full_name)")
        .order("data_backup", { ascending: false })
        .limit(20);
      if (error) throw error;
      return rows as unknown as BackupRegistro[];
    },
  });

  const st = statusQuery.data;

  async function registrar() {
    setSalvando(true);
    await executarAcao(
      () =>
        rpcAdmin("backup_registrar", {
          p_data: data,
          p_tipo: tipo,
          p_local: local.trim(),
          p_status: status,
          p_observacao: observacao.trim(),
        }),
      "Backup registrado.",
      () => {
        setLocal("");
        setObservacao("");
        void queryClient.invalidateQueries({ queryKey: ["admin", "backup-status"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "backup-registros"] });
        void queryClient.invalidateQueries({ queryKey: ["admin", "backup-info"] });
      },
    );
    setSalvando(false);
  }

  return (
    <SecaoAdmin
      titulo="Registro de backups"
      descricao="Comprove que as cópias foram guardadas fora do sistema. O registro é auditável e alerta quando o intervalo recomendado é ultrapassado."
    >
      {st && (
        <div
          className={`mb-4 rounded-md border p-3 text-sm ${
            st.pendente
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : "border-border text-muted-foreground"
          }`}
        >
          {st.ultimo
            ? `Último backup registrado em ${formatDateTimeITV(st.ultimo)} (${st.dias ?? 0} dia(s) atrás). Intervalo recomendado: ${st.intervalo} dias.`
            : `Nenhum backup registrado até agora. Intervalo recomendado: ${st.intervalo} dias.`}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="bkp-data">
            Data
          </label>
          <input
            id="bkp-data"
            type="date"
            className={inputClass}
            value={data}
            onChange={(e) => setData(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="bkp-tipo">
            Tipo
          </label>
          <select
            id="bkp-tipo"
            className={inputClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS_BACKUP.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="bkp-local">
            Local de armazenamento
          </label>
          <input
            id="bkp-local"
            className={inputClass}
            placeholder="Ex.: HD externo da diretoria"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="bkp-status">
            Situação
          </label>
          <select
            id="bkp-status"
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUS_BACKUP.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-4">
          <label className={labelClass} htmlFor="bkp-obs">
            Observação <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="bkp-obs"
            className={inputClass}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>
      <Button
        className="mt-4"
        disabled={!podeRegistrar || salvando || !local.trim()}
        onClick={() => void registrar()}
      >
        {salvando ? "Registrando…" : "Registrar backup"}
      </Button>

      {registrosQuery.isLoading ? (
        <Carregando />
      ) : (registrosQuery.data ?? []).length > 0 ? (
        <div className="mt-5 overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Local</th>
                <th className="px-3 py-2">Situação</th>
                <th className="px-3 py-2">Responsável</th>
              </tr>
            </thead>
            <tbody>
              {(registrosQuery.data ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-foreground">
                    {r.data_backup.split("-").reverse().join("/")}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {TIPOS_BACKUP.find((t) => t.value === r.tipo)?.label ?? r.tipo}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.local_armazenamento}
                    {r.observacao ? ` · ${r.observacao}` : ""}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {STATUS_BACKUP.find((s) => s.value === r.status)?.label ?? r.status}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.responsavel?.full_name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum backup registrado ainda.</p>
      )}
    </SecaoAdmin>
  );
}
