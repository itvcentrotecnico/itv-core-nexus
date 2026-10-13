import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { numerosSemSuporte } from "@/lib/resumo-validacao";

const Input = z.object({
  inicio: z.string().datetime({ offset: true }),
  fim: z.string().datetime({ offset: true }),
});

const Prioridade = z.object({
  acao: z.string(),
  evidencia: z.string(),
  resultado: z.string(),
  responsavel: z.string(),
  prazo: z.string(),
});
const Narrativa = z.object({
  visao: z.string(),
  desvios: z.array(z.string()),
  bloqueios: z.string(),
  proximos_passos: z.array(z.string()),
  prioridades: z.array(Prioridade),
});

export interface ResultadoGeracao {
  id: string;
  narrativa: "ia" | "estruturado";
  aviso: string | null;
}

/**
 * Gera uma versão congelada do resumo. A IA só redige texto a partir dos
 * indicadores já calculados; se falhar ou citar número sem suporte, a versão
 * é salva com o resumo estruturado automático.
 */
export const gerarResumoExecutivo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => Input.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoGeracao> => {
    const sb = context.supabase;
    const { data: pode } = await sb.rpc("has_permission", {
      _user_id: context.userId,
      _module: "operacional",
      _action: "editar",
    });
    if (!pode) throw new Error("Apenas a Gerência pode gerar o resumo.");

    const { data: m, error } = await sb.rpc("resumo_previa", { p_inicio: data.inicio, p_fim: data.fim });
    if (error || !m) throw new Error("Não foi possível calcular os indicadores.");

    const salvarEstruturado = async (aviso: string): Promise<ResultadoGeracao> => {
      const { data: id, error: e } = await sb.rpc("resumo_gerar", { p_inicio: data.inicio, p_fim: data.fim });
      if (e || !id) throw new Error("Não foi possível salvar o resumo.");
      return { id: id as string, narrativa: "estruturado", aviso };
    };

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return salvarEstruturado("IA indisponível: resumo estruturado salvo.");

    const payload = m as Record<string, unknown>;
    const fatos = JSON.stringify({
      periodo: payload["periodo"],
      atual: payload["atual"],
      anterior: payload["anterior"],
      alertas: payload["alertas"],
      prioridades_sugeridas: payload["prioridades_sugeridas"],
      metas_sugeridas_pendentes: payload["metas_sugeridas"],
    });

    try {
      const { createOpenAI } = await import("@ai-sdk/openai");
      const { streamText, Output } = await import("ai");
      const { createLovableAiGatewayRunIdFetch } = await import("./ai/run-id.server");
      const runId = createLovableAiGatewayRunIdFetch();
      const provider = createOpenAI({
        baseURL: "https://ai.gateway.lovable.dev/v1",
        apiKey,
        headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        fetch: runId.fetch,
      });

      const result = streamText({
        model: provider.responses("openai/gpt-6-astra"),
        maxRetries: 0,
        output: Output.object({ schema: Narrativa }),
        instructions: `Você redige o Resumo Executivo Semanal da ITV Centro Técnico (assistência técnica de TVs, Manaus) para a gestão, em português do Brasil.
Use SOMENTE os números e fatos dos indicadores recebidos; nunca invente valores, causas, responsáveis, metas ou decisões. Copie os números exatamente como aparecem; valores em reais escreva no formato brasileiro (ex.: R$ 25.222,90).
"atual" é o período; "anterior" é o período equivalente anterior. Itens com disponivel=false ou informadas=false são "dados insuficientes", nunca zero.
metas_sugeridas_pendentes NÃO são metas vigentes.
visao: 2-3 frases. desvios: até 5 itens curtos com dimensão. bloqueios: 1-2 frases. proximos_passos: até 5 ações concretas.
prioridades: EXATAMENTE 3, baseadas nos alertas e nas prioridades sugeridas; responsavel = "A definir" salvo se documentado; prazo começa com "Prazo sugerido:" se não houver prazo registrado. Se faltar evidência, uma prioridade deve corrigir a lacuna de informação.`,
        messages: [{ role: "user", content: `Indicadores calculados:\n${fatos}` }],
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

      const out = Narrativa.parse(await result.output);
      if (out.prioridades.length !== 3) return salvarEstruturado("A IA não retornou exatamente 3 prioridades: resumo estruturado salvo.");
      const texto = [out.visao, out.bloqueios, ...out.desvios, ...out.proximos_passos, ...out.prioridades.map((p) => `${p.acao} ${p.evidencia} ${p.resultado}`)].join(" ");
      const soltos = numerosSemSuporte(texto, fatos);
      if (soltos.length) return salvarEstruturado(`A IA citou números sem suporte (${soltos.slice(0, 3).join(", ")}): resumo estruturado salvo.`);

      const { prioridades, ...narrativa } = out;
      const { data: id, error: e } = await sb.rpc("resumo_gerar", {
        p_inicio: data.inicio,
        p_fim: data.fim,
        p_narrativa: narrativa,
        p_prioridades: prioridades,
      });
      if (e || !id) throw new Error("Não foi possível salvar o resumo.");
      return { id: id as string, narrativa: "ia", aviso: null };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Não foi possível salvar")) throw e;
      const status = (e as { statusCode?: number }).statusCode;
      const motivo =
        status === 402 ? "créditos de IA esgotados" : status === 429 ? "IA ocupada no momento" : status === 403 ? "IA bloqueada para o workspace" : "falha na IA";
      return salvarEstruturado(`Texto por IA indisponível (${motivo}): resumo estruturado salvo.`);
    }
  });
