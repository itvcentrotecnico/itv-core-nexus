import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Search, ShieldCheck, UserCog } from "lucide-react";

import { useAccess, formatRole, type AppRole } from "@/hooks/use-auth";
import { formatDateTimeITV } from "@/lib/format";
import { USUARIO_STATUS_LABEL, type AdminUsuario, type UsuarioStatus } from "@/lib/admin";
import { inputClass, labelClass } from "@/lib/caixa";
import {
  BotaoAcao,
  Carregando,
  ConfirmarAcao,
  PillStatus,
  SecaoAdmin,
  SemDados,
  TabelaAdmin,
  executarAcao,
  rpcAdmin,
} from "@/components/admin/shared";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PERFIS: AppRole[] = ["administrador", "gerente", "vendas", "tecnico", "tv_display"];

const TOM_STATUS: Record<UsuarioStatus, "ok" | "alerta" | "erro"> = {
  ativo: "ok",
  inativo: "alerta",
  bloqueado: "erro",
};

export function AdminUsuarios() {
  const { isAdmin, can } = useAccess();
  const queryClient = useQueryClient();
  const podeAdministrar = isAdmin || can("admin", "administrar");
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | UsuarioStatus>("todos");
  const [alvoStatus, setAlvoStatus] = useState<{ usuario: AdminUsuario; status: UsuarioStatus } | null>(null);
  const [alvoPerfis, setAlvoPerfis] = useState<AdminUsuario | null>(null);
  const [perfisSel, setPerfisSel] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "usuarios"],
    queryFn: async () => {
      const res = await rpcAdmin<{ ok: true; usuarios: AdminUsuario[] }>("admin_usuarios_listar");
      return res.usuarios ?? [];
    },
  });

  const usuarios = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (data ?? []).filter((u) => {
      if (statusFiltro !== "todos" && u.status !== statusFiltro) return false;
      if (!termo) return true;
      return `${u.full_name} ${u.email ?? ""}`.toLowerCase().includes(termo);
    });
  }, [data, busca, statusFiltro]);

  const invalidar = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "usuarios"] });
    void queryClient.invalidateQueries({ queryKey: ["user-access"] });
  };

  return (
    <SecaoAdmin
      titulo="Usuários"
      descricao="Perfis, status de acesso e histórico de entrada. Usuários com histórico nunca são excluídos — apenas desativados."
      acoes={
        <Link to="/admin/permissoes">
          <Button size="sm" variant="outline">
            <ShieldCheck className="mr-2 size-4" /> Exceções por usuário
          </Button>
        </Link>
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className={labelClass} htmlFor="busca-usuario">
            Buscar
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="busca-usuario"
              className={`${inputClass} pl-9`}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou e-mail"
            />
          </div>
        </div>
        <div className="sm:w-56">
          <label className={labelClass} htmlFor="status-usuario">
            Status
          </label>
          <select
            id="status-usuario"
            className={inputClass}
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as typeof statusFiltro)}
          >
            <option value="todos">Todos</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="bloqueado">Bloqueado</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <Carregando />
      ) : usuarios.length === 0 ? (
        <SemDados label="Nenhum usuário encontrado." />
      ) : (
        <TabelaAdmin cabecalho={["Usuário", "Perfis", "Status", "Último acesso", "Módulos", "Criado em", "Ações"]}>
          {usuarios.map((u) => (
            <tr key={u.id} className="align-top">
              <td className="px-3 py-3">
                <p className="font-medium text-foreground">{u.full_name}</p>
                <p className="text-xs text-muted-foreground">{u.email ?? "—"}</p>
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Sem perfil</span>
                  ) : (
                    u.roles.map((r) => (
                      <PillStatus key={r} tom="neutro">
                        {formatRole(r as AppRole)}
                      </PillStatus>
                    ))
                  )}
                </div>
                {u.overrides > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">{u.overrides} exceção(ões) individual(is)</p>
                ) : null}
              </td>
              <td className="px-3 py-3">
                <PillStatus tom={TOM_STATUS[u.status]}>{USUARIO_STATUS_LABEL[u.status]}</PillStatus>
                {u.status_motivo ? <p className="mt-1 text-xs text-muted-foreground">{u.status_motivo}</p> : null}
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">
                {u.last_sign_in_at ? formatDateTimeITV(u.last_sign_in_at) : "Nunca acessou"}
              </td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{u.modulos.length}</td>
              <td className="px-3 py-3 text-xs text-muted-foreground">{formatDateTimeITV(u.created_at)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-2">
                  <BotaoAcao
                    disabled={!podeAdministrar}
                    onClick={() => {
                      setAlvoPerfis(u);
                      setPerfisSel(u.roles);
                    }}
                  >
                    <UserCog className="mr-1.5 size-3.5" /> Perfis
                  </BotaoAcao>
                  {u.status === "ativo" ? (
                    <>
                      <BotaoAcao
                        variant="destructive"
                        disabled={!podeAdministrar}
                        onClick={() => setAlvoStatus({ usuario: u, status: "inativo" })}
                      >
                        Desativar
                      </BotaoAcao>
                      <BotaoAcao
                        disabled={!podeAdministrar}
                        onClick={() => setAlvoStatus({ usuario: u, status: "bloqueado" })}
                      >
                        Bloquear
                      </BotaoAcao>
                    </>
                  ) : (
                    <BotaoAcao
                      disabled={!podeAdministrar}
                      onClick={() => setAlvoStatus({ usuario: u, status: "ativo" })}
                    >
                      Reativar
                    </BotaoAcao>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </TabelaAdmin>
      )}

      <ConfirmarAcao
        aberto={!!alvoStatus}
        titulo={
          alvoStatus?.status === "ativo"
            ? "Reativar usuário"
            : alvoStatus?.status === "bloqueado"
              ? "Bloquear usuário"
              : "Desativar usuário"
        }
        descricao={`${alvoStatus?.usuario.full_name ?? ""} — o histórico permanece integralmente preservado.`}
        aviso={
          alvoStatus && alvoStatus.status !== "ativo"
            ? "O usuário perde o acesso imediatamente, inclusive a dados já carregados na próxima requisição."
            : undefined
        }
        pedirMotivo={alvoStatus?.status !== "ativo"}
        confirmarLabel="Confirmar"
        onCancel={() => setAlvoStatus(null)}
        onConfirm={async (motivo) => {
          if (!alvoStatus) return;
          await executarAcao(
            () =>
              rpcAdmin("admin_usuario_status", {
                p_user_id: alvoStatus.usuario.id,
                p_status: alvoStatus.status,
                p_motivo: motivo || null,
              }),
            "Status atualizado.",
            invalidar,
          );
          setAlvoStatus(null);
        }}
      />

      <Dialog open={!!alvoPerfis} onOpenChange={(o) => !o && setAlvoPerfis(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Perfis de {alvoPerfis?.full_name}</DialogTitle>
            <DialogDescription>
              O perfil define as permissões padrão. Ajustes individuais são feitos na tela de Permissões.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {PERFIS.map((p) => (
              <label key={p} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={perfisSel.includes(p)}
                  onCheckedChange={(v) =>
                    setPerfisSel((atual) => (v ? [...new Set([...atual, p])] : atual.filter((r) => r !== p)))
                  }
                />
                {formatRole(p)}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlvoPerfis(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!alvoPerfis) return;
                const ok = await executarAcao(
                  () => rpcAdmin("admin_usuario_perfis", { p_user_id: alvoPerfis.id, p_roles: perfisSel }),
                  "Perfis atualizados.",
                  invalidar,
                );
                if (ok) setAlvoPerfis(null);
              }}
            >
              Salvar perfis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SecaoAdmin>
  );
}
