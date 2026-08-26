import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { MODO_TV_CONFIG_PADRAO, type ModoTvConfig, type ModoTvIndicadores } from "@/lib/modo-tv";
import {
  CabecalhoTv,
  RodapeTv,
  TelaComparativo,
  TelaMeta,
  TelaProducao,
  TelaServicos,
} from "@/components/modo-tv/paineis";
import logoColor from "@/assets/itv-logo-color.png.asset.json";

export const Route = createFileRoute("/modo-tv")({
  // Sessão do Supabase vive no localStorage: sem SSR para evitar loop de redirect.
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Modo TV — Painel de Desempenho ITV" },
      { name: "description", content: "Painel de gestão à vista com metas, faturamento e produção técnica da ITV Centro Técnico." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Modo TV — Painel de Desempenho ITV" },
      { property: "og:description", content: "Painel de gestão à vista da ITV Centro Técnico." },
    ],
  }),
  component: ModoTvPage,
  errorComponent: ({ error }) => (
    <div role="alert" className="flex min-h-screen items-center justify-center bg-[#0B0F0D] p-8 text-center text-white/70">
      Não foi possível carregar o painel: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F0D] text-white/60">Painel indisponível.</div>
  ),
});

function ModoTvPage() {
  const { data, error, isLoading } = useQuery({
    queryKey: ["modo-tv"],
    queryFn: async (): Promise<ModoTvIndicadores> => {
      const { data: rpc, error: rpcError } = await supabase.rpc("modo_tv_indicadores", { p_ref: null });
      if (rpcError) throw rpcError;
      return rpc as unknown as ModoTvIndicadores;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const config: ModoTvConfig = useMemo(
    () => ({ ...MODO_TV_CONFIG_PADRAO, ...(data?.config ?? {}) }),
    [data?.config],
  );

  const telas = useMemo(() => {
    if (!data) return [] as { chave: string; node: React.ReactNode }[];
    const lista: { chave: string; node: React.ReactNode }[] = [];
    if (config.mostrar_meta || config.mostrar_faturamento) {
      lista.push({ chave: "meta", node: <TelaMeta d={data} config={config} /> });
    }
    if (config.mostrar_producao) lista.push({ chave: "producao", node: <TelaProducao d={data} config={config} /> });
    if (config.mostrar_tipos_servico || config.mostrar_marcas || config.mostrar_ranking) {
      lista.push({ chave: "servicos", node: <TelaServicos d={data} config={config} /> });
    }
    if (config.mostrar_comparacao) lista.push({ chave: "comparativo", node: <TelaComparativo d={data} /> });
    return lista;
  }, [data, config]);

  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (telas.length <= 1) return;
    const ms = Math.max(config.rotacao_segundos, 8) * 1000;
    const id = setInterval(() => setIndice((i) => (i + 1) % telas.length), ms);
    return () => clearInterval(id);
  }, [telas.length, config.rotacao_segundos]);

  useEffect(() => {
    if (indice >= telas.length) setIndice(0);
  }, [indice, telas.length]);

  const telaCheia = useCallback(() => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#0B0F0D] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.18),transparent_55%),radial-gradient(circle_at_85%_100%,hsl(var(--primary)/0.10),transparent_50%)]"
      />

      <div className="relative flex h-full flex-col">
        <CabecalhoTv referencia={data?.referencia ?? ""} />

        <div className="flex-1 px-[2vw] py-[1.2vw]">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <img src={logoColor.url} alt="Carregando painel ITV" className="h-[6vw] w-auto animate-pulse" />
            </div>
          ) : error || !data?.ok ? (
            <div className="flex h-full flex-col items-center justify-center gap-[1vw] text-center">
              <p className="text-[2vw] font-semibold text-white/80">Painel indisponível</p>
              <p className="text-[1.2vw] text-white/45">
                {data?.code === "sem_permissao"
                  ? "Este usuário não tem permissão para visualizar o Modo TV."
                  : "Não foi possível carregar os indicadores agora. Nova tentativa automática em instantes."}
              </p>
            </div>
          ) : telas.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[1.6vw] text-white/40">
              Nenhum painel habilitado nas configurações do Modo TV.
            </div>
          ) : (
            <div key={telas[indice]?.chave} className="h-full animate-in fade-in duration-700">
              {telas[indice]?.node}
            </div>
          )}
        </div>

        <RodapeTv
          indice={Math.min(indice, Math.max(telas.length - 1, 0))}
          total={telas.length}
          mensagem={config.mostrar_mensagem && config.mensagem_texto ? `${config.mensagem_titulo}: ${config.mensagem_texto}` : null}
        />
      </div>

      <button
        type="button"
        onClick={telaCheia}
        aria-label="Alternar tela cheia"
        className="absolute right-[1vw] top-[1vw] rounded-full bg-white/5 p-[0.7vw] text-white/25 opacity-0 transition hover:bg-white/15 hover:text-white focus-visible:opacity-100 hover:opacity-100"
      >
        <Maximize2 className="h-[1.4vw] w-[1.4vw]" />
      </button>
    </main>
  );
}
