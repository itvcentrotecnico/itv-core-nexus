import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Power } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { formatDateTimeITV } from "@/lib/format";
import { mensagemErro } from "@/lib/coletas";
import {
  dentroDaJanela,
  INTERVALO_POSICAO_MS,
  posicaoDesatualizada,
  rpcEquipe,
  type ExpedienteAtual,
} from "@/lib/equipe-externa";

/**
 * Modo Expediente do motorista.
 * Envia posição no máximo a cada 5 minutos e apenas dentro da janela 08:00–18:00.
 * Localização negada nunca é tratada como erro do sistema.
 */
export function ModoExpediente({ bairroAtual }: { bairroAtual?: string | null }) {
  const queryClient = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const expedienteQuery = useQuery({
    queryKey: ["expediente", "atual"],
    refetchInterval: 120_000,
    queryFn: () => rpcEquipe<ExpedienteAtual>("expediente_atual"),
  });

  const expediente = expedienteQuery.data;
  const ativo = !!expediente?.ativo;

  const enviarPosicao = useCallback(() => {
    if (!navigator.geolocation || !dentroDaJanela()) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void rpcEquipe("localizacao_registrar", {
          p_lat: Number(pos.coords.latitude.toFixed(7)),
          p_lng: Number(pos.coords.longitude.toFixed(7)),
          p_precisao: pos.coords.accuracy ? Number(pos.coords.accuracy.toFixed(2)) : null,
          p_bairro: bairroAtual ?? null,
        })
          .then(() => {
            setAviso(null);
            void queryClient.invalidateQueries({ queryKey: ["expediente"] });
          })
          .catch(() => setAviso("Não foi possível atualizar sua posição agora."));
      },
      () => setAviso("Não foi possível acessar sua localização. Verifique a permissão do aparelho."),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }, [bairroAtual, queryClient]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!ativo) return;
    enviarPosicao();
    timerRef.current = setInterval(enviarPosicao, INTERVALO_POSICAO_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ativo, enviarPosicao]);

  async function alternar() {
    setOcupado(true);
    setAviso(null);
    try {
      if (ativo) {
        await rpcEquipe("expediente_encerrar");
        toast.success("Expediente encerrado.");
      } else {
        await rpcEquipe("expediente_iniciar");
        toast.success("Expediente iniciado.");
      }
      await queryClient.invalidateQueries({ queryKey: ["expediente"] });
    } catch (e) {
      setAviso(mensagemErro(e, "Não foi possível alterar o expediente."));
    } finally {
      setOcupado(false);
    }
  }

  const foraDaJanela = expediente ? !expediente.janela : !dentroDaJanela();
  const desatualizado = ativo && posicaoDesatualizada(expediente?.ultima_atualizacao);

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-sm font-bold text-foreground">Modo Expediente</h2>
          <p className="text-xs text-muted-foreground">
            {ativo ? (
              <span className="font-medium text-primary">🟢 Localização de trabalho ativa</span>
            ) : foraDaJanela ? (
              "Disponível das 08:00 às 18:00 (horário de Manaus)."
            ) : (
              "Ative ao sair para a rua e encerre ao voltar."
            )}
          </p>
          {ativo && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {desatualizado ? "🟡 Localização desatualizada. " : ""}
              Última atualização:{" "}
              {expediente?.ultima_atualizacao ? formatDateTimeITV(expediente.ultima_atualizacao) : "aguardando"}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {ativo && (
            <Button variant="outline" className="h-11" onClick={enviarPosicao}>
              <MapPin className="mr-1.5 size-4" aria-hidden="true" /> Atualizar
            </Button>
          )}
          <Button
            className="h-11"
            variant={ativo ? "destructive" : "default"}
            onClick={alternar}
            disabled={ocupado || (!ativo && foraDaJanela)}
          >
            {ocupado ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Power className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {ativo ? "Encerrar expediente" : "Iniciar expediente"}
          </Button>
        </div>
      </div>
      {aviso && <p className="mt-3 rounded-md bg-muted p-2.5 text-xs text-muted-foreground">{aviso}</p>}
    </section>
  );
}
