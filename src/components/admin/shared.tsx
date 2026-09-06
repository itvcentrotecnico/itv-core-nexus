import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { mensagemErro } from "@/lib/erros";

const CODIGOS: Record<string, string> = {
  SEM_PERMISSAO: "Você não tem permissão para esta ação.",
  NAO_AUTENTICADO: "Sessão expirada. Entre novamente.",
  AUTO_DESATIVACAO: "Você não pode desativar o próprio usuário.",
  AUTO_REBAIXAMENTO: "Você não pode remover o próprio perfil de administrador.",
  ULTIMO_ADMIN: "É necessário manter ao menos um administrador ativo.",
  ADMIN_IMUTAVEL: "O perfil Administrador possui acesso total e não é editável.",
  TABELA_INVALIDA: "Cadastro não permitido.",
  DATASET_INVALIDO: "Conjunto de dados inválido.",
  NAO_ENCONTRADO: "Registro não encontrado.",
  SEM_CAMPOS: "Nenhum campo válido informado.",
  COLABORADOR_VINCULADO: "Este colaborador já possui um usuário vinculado.",
  SEM_COLABORADOR: "Este técnico ainda não possui colaborador vinculado.",
};

export interface RpcResposta {
  ok: boolean;
  code?: string;
  [k: string]: unknown;
}

/** Chamada padronizada às RPCs administrativas (validação server-side). */
export async function rpcAdmin<T extends RpcResposta>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(mensagemErro(error));
  const res = (data ?? { ok: false, code: "SEM_RESPOSTA" }) as T;
  if (!res.ok) throw new Error(CODIGOS[res.code ?? ""] ?? res.code ?? "Não foi possível concluir a operação.");
  return res;
}

/** Executa uma ação administrativa exibindo feedback e invalidando caches. */
export async function executarAcao(
  fn: () => Promise<unknown>,
  sucesso: string,
  onDone?: () => void,
): Promise<boolean> {
  try {
    await fn();
    toast.success(sucesso);
    onDone?.();
    return true;
  } catch (e) {
    toast.error("Não foi possível concluir", { description: (e as Error).message });
    return false;
  }
}

export function SecaoAdmin({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-base">{titulo}</CardTitle>
          {descricao ? <CardDescription>{descricao}</CardDescription> : null}
        </div>
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function Carregando({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function SemDados({ label = "Sem dados" }: { label?: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{label}</p>;
}

export function SemAcesso() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acesso restrito</CardTitle>
        <CardDescription>
          Esta área é limitada a administradores. Solicite permissão ao administrador do sistema.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export function TabelaAdmin({ cabecalho, children }: { cabecalho: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            {cabecalho.map((c) => (
              <th key={c} className="px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function PillStatus({ tom, children }: { tom: "ok" | "alerta" | "erro" | "neutro"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tom === "ok" && "bg-primary/10 text-primary",
        tom === "alerta" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
        tom === "erro" && "bg-destructive/10 text-destructive",
        tom === "neutro" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

/** Confirmação obrigatória para ações críticas, com motivo opcional auditado. */
export function ConfirmarAcao({
  aberto,
  titulo,
  descricao,
  aviso,
  pedirMotivo,
  confirmarLabel = "Confirmar",
  onCancel,
  onConfirm,
}: {
  aberto: boolean;
  titulo: string;
  descricao: string;
  aviso?: ReactNode;
  pedirMotivo?: boolean;
  confirmarLabel?: string;
  onCancel: () => void;
  onConfirm: (motivo: string) => void | Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        {aviso ? <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">{aviso}</div> : null}
        {pedirMotivo ? (
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (registrado na auditoria)"
            rows={3}
          />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando || (pedirMotivo && motivo.trim().length < 3)}
            onClick={async (e) => {
              e.preventDefault();
              setEnviando(true);
              await onConfirm(motivo.trim());
              setEnviando(false);
              setMotivo("");
            }}
          >
            {enviando ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            {confirmarLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BotaoAcao({
  children,
  onClick,
  variant = "outline",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: "outline" | "destructive" | "default" | "secondary";
  disabled?: boolean;
}) {
  return (
    <Button type="button" size="sm" variant={variant} onClick={onClick} disabled={disabled}>
      {children}
    </Button>
  );
}
