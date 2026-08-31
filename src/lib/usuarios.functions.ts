import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Liberação de acesso (convite) — GESTÃO ITV CENTRO TÉCNICO.
 * Executa exclusivamente no servidor: a chave administrativa nunca chega ao navegador.
 * O convite só é enviado depois de confirmar, com a sessão do próprio solicitante,
 * que ele é Administrador.
 */

const SITE_URL_PADRAO = "https://itvcentrotecnico.lovable.app";

/** Aceita apenas origens do próprio sistema; qualquer outra cai no domínio publicado. */
function resolverOrigem(origem?: string | null): string {
  if (!origem) return SITE_URL_PADRAO;
  try {
    const url = new URL(origem);
    const host = url.hostname;
    const permitido =
      host === "localhost" ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovableproject.com");
    return permitido ? url.origin : SITE_URL_PADRAO;
  } catch {
    return SITE_URL_PADRAO;
  }
}

const conviteSchema = z.object({
  nome: z.string().trim().min(2),
  email: z.string().trim().email(),
  colaboradorId: z.string().uuid().nullable().optional(),
  role: z.enum(["administrador", "adm_financeiro", "adm_operacional", "vendedor", "tecnico", "tv_display", "motorista"]),
  origem: z.string().optional(),
});

interface RpcOk {
  ok: boolean;
  code?: string;
}

export const convidarUsuario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => conviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    // 1) Autorização: validada como o próprio usuário (RLS ativa).
    const { data: ehAdmin, error: erroAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrador",
    });
    if (erroAdmin) return { ok: false as const, message: "Não foi possível validar sua permissão." };
    if (!ehAdmin) return { ok: false as const, message: "Somente administradores podem convidar usuários." };

    const email = data.email.toLowerCase();
    const redirectTo = `${resolverOrigem(data.origem)}/reset-password`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 2) Usuário já existe? Não duplicar.
    const { data: lista } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existente = lista?.users?.find((u) => (u.email ?? "").toLowerCase() === email) ?? null;

    let userId = existente?.id ?? null;
    let jaExistia = !!existente;

    if (!existente) {
      const { data: convite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: data.nome },
      });
      if (error || !convite?.user) {
        return {
          ok: false as const,
          message: error?.message ?? "Não foi possível enviar o convite. Tente novamente.",
        };
      }
      userId = convite.user.id;
      jaExistia = false;
    }

    // 3) Provisiona perfil, vínculo com colaborador, perfil de acesso e auditoria.
    const argsProv = {
      p_user_id: userId!,
      p_nome: data.nome,
      p_email: email,
      p_role: data.role,
      p_acao: jaExistia ? "usuario_vinculado" : "convite_enviado",
      ...(data.colaboradorId ? { p_colaborador_id: data.colaboradorId } : {}),
    };
    const { data: prov, error: erroProv } = await context.supabase.rpc("admin_usuario_provisionar", argsProv);
    if (erroProv) return { ok: false as const, message: erroProv.message };
    const res = prov as unknown as RpcOk;
    if (!res?.ok) {
      return {
        ok: false as const,
        message:
          res?.code === "COLABORADOR_VINCULADO"
            ? "Este colaborador já possui um usuário vinculado."
            : "Não foi possível concluir a liberação do acesso.",
      };
    }

    return {
      ok: true as const,
      jaExistia,
      userId,
      message: jaExistia
        ? "Este e-mail já possuía usuário. O perfil e o vínculo foram atualizados — use “Reenviar convite” se ele ainda precisar definir a senha."
        : "Convite enviado. O colaborador receberá um e-mail para definir a senha.",
    };
  });

const reenvioSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().email(),
  origem: z.string().optional(),
});

export const reenviarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reenvioSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: ehAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrador",
    });
    if (!ehAdmin) return { ok: false as const, message: "Somente administradores podem reenviar convites." };

    const redirectTo = `${resolverOrigem(data.origem)}/reset-password`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(data.email.toLowerCase(), {
      redirectTo,
    });
    if (error) return { ok: false as const, message: "Não foi possível reenviar o convite." };

    await context.supabase.rpc("admin_usuario_provisionar", {
      p_user_id: data.userId,
      p_nome: "",
      p_email: data.email.toLowerCase(),
      p_acao: "convite_reenviado",
    });

    return { ok: true as const, message: "Novo link de acesso enviado por e-mail." };
  });
