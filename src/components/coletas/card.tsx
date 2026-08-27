import { CheckCircle2, MapPin, MessageCircle, PackagePlus, Phone, Trash2, Tv } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  complementoResumido,
  enderecoResumido,
  mapsUrl,
  maskTelefone,
  telUrl,
  TIPO_LABEL,
  whatsappUrl,
  type ColetaSolicitacao,
} from "@/lib/coletas";
import { StatusBadgeColeta } from "./shared";

/** Card operacional do motorista: poucos toques, botões grandes. */
export function ColetaCard({
  item,
  motoristaNome,
  podeAssumir,
  podeConcluir,
  podeCriarEntrega,
  podeExcluir,
  onAssumir,
  onConcluir,
  onAbrir,
  onCriarEntrega,
  onExcluir,
}: {
  item: ColetaSolicitacao;
  motoristaNome?: string | undefined;
  podeAssumir: boolean;
  podeConcluir: boolean;
  podeCriarEntrega?: boolean;
  podeExcluir?: boolean;
  onAssumir: (item: ColetaSolicitacao) => void;
  onConcluir: (item: ColetaSolicitacao) => void;
  onAbrir: (item: ColetaSolicitacao) => void;
  onCriarEntrega?: (item: ColetaSolicitacao) => void;
  onExcluir?: (item: ColetaSolicitacao) => void;
}) {
  const tv = [item.marca_tv, item.polegadas ? `${item.polegadas}"` : null].filter(Boolean).join(" ");
  const complemento = complementoResumido(item);
  const emAndamento = item.status === "pronto_coleta" || item.status === "assumida";
  const mostrarCriarEntrega =
    !!podeCriarEntrega && item.tipo === "coleta" && item.status === "concluida" && !!onCriarEntrega;

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <button type="button" onClick={() => onAbrir(item)} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-foreground">{item.cliente_nome}</h3>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              {TIPO_LABEL[item.tipo]}
              {item.coleta_origem_id ? " · da coleta" : ""}
            </p>
          </div>
          <StatusBadgeColeta status={item.status} tipo={item.tipo} />
        </div>

        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Tv className="size-3.5 shrink-0" aria-hidden="true" /> {tv || "TV não informada"}
          </p>
          <p className="font-medium text-foreground">{item.bairro ?? "Bairro não informado"}</p>
          <p>{enderecoResumido(item)}</p>
          {complemento && <p>{complemento}</p>}
          {motoristaNome && <p className="text-xs">Motorista: {motoristaNome}</p>}
          <p className="text-xs">{maskTelefone(item.whatsapp)}</p>
        </div>
      </button>

      {emAndamento && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button asChild variant="outline" className="h-11 flex-col gap-0.5 text-[11px]">
            <a href={mapsUrl(item)} target="_blank" rel="noopener noreferrer">
              <MapPin className="size-4" aria-hidden="true" /> MAPA
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-col gap-0.5 text-[11px]">
            <a href={whatsappUrl(item.whatsapp)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" aria-hidden="true" /> WHATSAPP
            </a>
          </Button>
          <Button asChild variant="outline" className="h-11 flex-col gap-0.5 text-[11px]">
            <a href={telUrl(item.whatsapp)}>
              <Phone className="size-4" aria-hidden="true" /> LIGAR
            </a>
          </Button>
        </div>
      )}

      {item.status === "pronto_coleta" && podeAssumir && (
        <Button className="mt-2 h-12 w-full text-base" onClick={() => onAssumir(item)}>
          ASSUMIR
        </Button>
      )}

      {item.status === "assumida" && podeConcluir && (
        <Button className="mt-2 h-12 w-full text-base" onClick={() => onConcluir(item)}>
          <CheckCircle2 className="mr-2 size-4" aria-hidden="true" />
          {item.tipo === "coleta" ? "TV COLETADA" : "TV ENTREGUE"}
        </Button>
      )}

      {(mostrarCriarEntrega || (podeExcluir && onExcluir)) && (
        <div className="mt-2 flex gap-2">
          {mostrarCriarEntrega && (
            <Button variant="outline" className="h-11 flex-1" onClick={() => onCriarEntrega?.(item)}>
              <PackagePlus className="mr-1.5 size-4" aria-hidden="true" /> Criar entrega
            </Button>
          )}
          {podeExcluir && onExcluir && (
            <Button
              variant="ghost"
              className="h-11 text-destructive hover:text-destructive"
              onClick={() => onExcluir(item)}
              aria-label="Excluir registro"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
