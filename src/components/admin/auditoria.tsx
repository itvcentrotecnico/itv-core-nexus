import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

import { formatDateTimeITV } from "@/lib/format";
import { inputClass, labelClass } from "@/lib/caixa";
import { exportarCSV } from "@/components/relatorios/shared";
import { Carregando, SecaoAdmin, SemDados, TabelaAdmin, rpcAdmin } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";

interface RegistroAuditoria {
  id: string;
  created_at: string;
  user_id: string | null;
  usuario: string;
  module_key: string | null;
  modulo: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
}

const PAGINA = 50;

export function AdminAuditoria() {
  const [modulo, setModulo] = useState("");
  const [acao, setAcao] = useState("");
  const [usuario, setUsuario] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [aberto, setAberto] = useState<string | null>(null);

  const filtrosQuery = useQuery({
    queryKey: ["admin", "auditoria-filtros"],
    queryFn: () =>
      rpcAdmin<{ ok: true; acoes: string[]; modulos: string[] }>("admin_auditoria_filtros"),
  });

  const usuariosQuery = useQuery({
    queryKey: ["admin", "usuarios"],
    queryFn: async () => {
      const res = await rpcAdmin<{ ok: true; usuarios: { id: string; full_name: string }[] }>(
        "admin_usuarios_listar",
      );
      return res.usuarios ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "auditoria", { modulo, acao, usuario, inicio, fim, busca, pagina }],
    queryFn: () =>
      rpcAdmin<{ ok: true; total: number; registros: RegistroAuditoria[] }>("admin_auditoria", {
        p_module: modulo || null,
        p_action: acao || null,
        p_user_id: usuario || null,
        p_inicio: inicio || null,
        p_fim: fim || null,
        p_busca: busca || null,
        p_limit: PAGINA,
        p_offset: pagina * PAGINA,
      }),
  });

  const registros = data?.registros ?? [];
  const total = data?.total ?? 0;

  return (
    <SecaoAdmin
      titulo="Auditoria central"
      descricao="Toda criação, edição, cancelamento, estorno, aprovação, pagamento, fechamento, reabertura e alteração de permissão fica registrada aqui."
      acoes={
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            exportarCSV(
              "auditoria-itv.csv",
              ["Data/hora", "Usuário", "Módulo", "Ação", "Valor anterior", "Novo valor"],
              registros.map((r) => [
                formatDateTimeITV(r.created_at),
                r.usuario,
                r.modulo,
                r.action,
                JSON.stringify(r.old_value ?? ""),
                JSON.stringify(r.new_value ?? ""),
              ]),
            )
          }
        >
          <Download className="mr-2 size-4" /> Exportar CSV
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className={labelClass} htmlFor="aud-usuario">
            Usuário
          </label>
          <select
            id="aud-usuario"
            className={inputClass}
            value={usuario}
            onChange={(e) => {
              setUsuario(e.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todos</option>
            {(usuariosQuery.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="aud-modulo">
            Módulo
          </label>
          <select
            id="aud-modulo"
            className={inputClass}
            value={modulo}
            onChange={(e) => {
              setModulo(e.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todos</option>
            {(filtrosQuery.data?.modulos ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="aud-acao">
            Ação
          </label>
          <select
            id="aud-acao"
            className={inputClass}
            value={acao}
            onChange={(e) => {
              setAcao(e.target.value);
              setPagina(0);
            }}
          >
            <option value="">Todas</option>
            {(filtrosQuery.data?.acoes ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="aud-inicio">
            Início
          </label>
          <input
            id="aud-inicio"
            type="date"
            className={inputClass}
            value={inicio}
            onChange={(e) => {
              setInicio(e.target.value);
              setPagina(0);
            }}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="aud-fim">
            Fim
          </label>
          <input
            id="aud-fim"
            type="date"
            className={inputClass}
            value={fim}
            onChange={(e) => {
              setFim(e.target.value);
              setPagina(0);
            }}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="aud-busca">
            Registro / conteúdo
          </label>
          <input
            id="aud-busca"
            className={inputClass}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="OS, id, texto…"
          />
        </div>
      </div>

      {isLoading ? (
        <Carregando />
      ) : registros.length === 0 ? (
        <SemDados label="Nenhum registro de auditoria para os filtros informados." />
      ) : (
        <>
          <TabelaAdmin cabecalho={["Data/hora", "Usuário", "Módulo", "Ação", "Detalhes"]}>
            {registros.map((r) => (
              <Fragment key={r.id}>
                <tr>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {formatDateTimeITV(r.created_at)}
                  </td>
                  <td className="px-3 py-2 text-foreground">{r.usuario}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.modulo}</td>
                  <td className="px-3 py-2 text-foreground">{r.action}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => setAberto((a) => (a === r.id ? null : r.id))}
                    >
                      {aberto === r.id ? (
                        <ChevronDown className="size-3.5" />
                      ) : (
                        <ChevronRight className="size-3.5" />
                      )}
                      Ver valores
                    </button>
                  </td>
                </tr>
                {aberto === r.id ? (
                  <tr>
                    <td colSpan={5} className="bg-muted/40 px-3 py-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                            Valor anterior
                          </p>
                          <pre className="max-h-56 overflow-auto rounded bg-background p-2 text-xs">
                            {JSON.stringify(r.old_value ?? null, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                            Novo valor
                          </p>
                          <pre className="max-h-56 overflow-auto rounded bg-background p-2 text-xs">
                            {JSON.stringify(r.new_value ?? null, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </TabelaAdmin>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {pagina * PAGINA + 1}–{Math.min((pagina + 1) * PAGINA, total)} de{" "}
              {total.toLocaleString("pt-BR")}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={(pagina + 1) * PAGINA >= total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </SecaoAdmin>
  );
}
