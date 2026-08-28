import { Loader2 } from "lucide-react";

import { inputClass, labelClass } from "@/lib/caixa";
import {
  CANAIS_CONTATO,
  ehIndicacao,
  requerDetalhe,
  useOrigens,
  type OrigemValor,
} from "@/lib/origens";
import { maskTelefone } from "@/lib/coletas";

/**
 * Pergunta padrão "Como você conheceu a ITV?" — um toque, sem pop-up.
 * Usado no atendimento interno e no formulário público do cliente.
 */
export function OrigemPicker({
  valor,
  onChange,
  mostrarCanal = false,
  compacto = false,
}: {
  valor: OrigemValor;
  onChange: (v: OrigemValor) => void;
  mostrarCanal?: boolean;
  compacto?: boolean;
}) {
  const { data: origens, isLoading, isError, refetch } = useOrigens();

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Carregando opções…
      </p>
    );
  }

  if (isError || !origens || origens.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Não foi possível carregar as opções.{" "}
        <button type="button" className="font-semibold text-primary underline" onClick={() => void refetch()}>
          Tente novamente
        </button>
      </div>
    );
  }

  const altura = compacto ? "h-10" : "h-12";

  return (
    <div className="space-y-3">
      <div>
        <span className={labelClass}>Como você conheceu a ITV? *</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {origens.map((o) => {
            const ativo = valor.origem_id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={ativo}
                onClick={() => onChange({ ...valor, origem_id: o.id, origem_nome: o.nome })}
                className={`${altura} rounded-md border px-2 text-sm font-semibold transition-colors ${
                  ativo ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground"
                }`}
              >
                {o.nome}
              </button>
            );
          })}
        </div>
      </div>

      {requerDetalhe(valor, origens) && (
        <div>
          <label className={labelClass} htmlFor="origem-detalhe">Qual? *</label>
          <input
            id="origem-detalhe"
            className={`${inputClass} ${altura}`}
            placeholder="Ex.: fachada, Facebook, TikTok, evento, parceiro"
            value={valor.detalhe}
            onChange={(e) => onChange({ ...valor, detalhe: e.target.value })}
          />
        </div>
      )}

      {ehIndicacao(valor, origens) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="origem-indicou">Quem indicou? (opcional)</label>
            <input
              id="origem-indicou"
              className={`${inputClass} ${altura}`}
              value={valor.indicado_nome}
              onChange={(e) => onChange({ ...valor, indicado_nome: e.target.value })}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="origem-indicou-tel">Telefone (opcional)</label>
            <input
              id="origem-indicou-tel"
              className={`${inputClass} ${altura}`}
              inputMode="numeric"
              value={valor.indicado_telefone}
              onChange={(e) => onChange({ ...valor, indicado_telefone: maskTelefone(e.target.value) })}
            />
          </div>
        </div>
      )}

      {mostrarCanal && (
        <div>
          <label className={labelClass} htmlFor="origem-canal">Entrou em contato por</label>
          <select
            id="origem-canal"
            className={`${inputClass} ${altura}`}
            value={valor.canal}
            onChange={(e) => onChange({ ...valor, canal: e.target.value })}
          >
            {CANAIS_CONTATO.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Canal de contato é diferente de onde o cliente conheceu a ITV.
          </p>
        </div>
      )}
    </div>
  );
}
