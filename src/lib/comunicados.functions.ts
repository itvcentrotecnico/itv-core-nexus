import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  mudanca: z.string().trim().min(10).max(4000),
  vigencia: z.string().trim().max(100).optional().default(""),
  tom: z.enum(["cordial", "firme", "motivador"]).default("cordial"),
  motoristaIds: z.array(z.string().uuid()).max(50).default([]),
});

export interface Comunicado {
  motoristaId: string | null;
  nome: string;
  telefone: string | null;
  texto: string;
}

export const listarMotoristas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("colaboradores")
      .select("id, nome, nome_exibicao, telefone, status")
      .eq("recebe_comissao_entrega", true)
      .order("nome");
    if (error) throw new Error("Não foi possível carregar os motoristas.");
    return (data ?? [])
      .filter((m) => m.status === "ativo")
      .map((m) => ({ id: m.id, nome: m.nome_exibicao || m.nome, telefone: m.telefone }));
  });

export const gerarComunicados = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { data: pode } = await context.supabase.rpc("has_permission", {
      _user_id: context.userId,
      _module: "operacional",
      _action: "editar",
    });
    if (!pode) throw new Error("Apenas a Gerência pode gerar comunicados.");

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("Serviço de IA não configurado.");

    let alvos: { id: string | null; nome: string; telefone: string | null }[] = [
      { id: null, nome: "Equipe", telefone: null },
    ];
    if (data.motoristaIds.length) {
      const { data: rows } = await context.supabase
        .from("colaboradores")
        .select("id, nome, nome_exibicao, telefone")
        .in("id", data.motoristaIds);
      alvos = (rows ?? []).map((r) => ({
        id: r.id,
        nome: (r.nome_exibicao || r.nome).split(" ")[0] ?? r.nome,
        telefone: r.telefone,
      }));
    }

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText } = await import("ai");
    const { createLovableAiGatewayRunIdFetch } = await import("./ai/run-id.server");

    const instructions = `Você redige comunicados internos da ITV Centro Técnico (assistência técnica de TVs em Manaus) para os motoristas de coleta e entrega.
Escreva em português do Brasil, pronto para colar no WhatsApp: saudação com o primeiro nome, explicação clara do que muda, a partir de quando, o que o motorista precisa fazer na prática (em tópicos curtos com "•"), o motivo, e encerramento assinado por "Gerência ITV".
Tom: ${data.tom}. Seja respeitoso, objetivo, no máximo ~180 palavras. Não invente regras, valores, datas ou nomes que não estejam na informação recebida. Use *negrito* do WhatsApp com moderação. Responda somente com o texto da mensagem.`;

    const runId = createLovableAiGatewayRunIdFetch();
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: runId.fetch,
    });

    const gerar = async (nome: string) => {
      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        instructions,
        maxRetries: 0,
        messages: [
          {
            role: "user",
            content: `Destinatário: ${nome === "Equipe" ? "toda a equipe de motoristas (saudação geral)" : nome}
Mudança operacional informada pela Gerência:
${data.mudanca}
${data.vigencia ? `Vigência: ${data.vigencia}` : ""}`,
          },
        ],
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "low",
            reasoningSummary: "auto",
            store: false,
            include: ["reasoning.encrypted_content"],
          },
        },
      } as Parameters<typeof streamText>[0]);
      return (await result.text).trim();
    };

    try {
      const out: Comunicado[] = [];
      for (const a of alvos) {
        out.push({ motoristaId: a.id, nome: a.nome, telefone: a.telefone, texto: await gerar(a.nome) });
      }
      return out;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429) throw new Error("Muitas solicitações agora. Aguarde um minuto e tente de novo.");
      if (status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos ao workspace.");
      if (status === 403) throw new Error("Uso de IA bloqueado para este workspace.");
      throw new Error("Não foi possível gerar o comunicado agora.");
    }
  });
