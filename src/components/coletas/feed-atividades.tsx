import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";

import { formatDateTimeITV } from "@/lib/format";
import { labelStatus, TIPO_LABEL, type ColetaSolicitacao } from "@/lib/coletas";

interface Atividade {
  id: string;
  texto: string;
  em: string;
}

/**
 * Feed leve de atividades operacionais: compara a lista a cada atualização
 * e avisa Vendas/Administração sobre mudanças de situação, sem poluir a tela.
 */
export function FeedAtividades({ itens, ativo }: { itens: ColetaSolicitacao[]; ativo: boolean }) {
  const anterior = useRef<Map<string, string> | null>(null);
  const [feed, setFeed] = useState<Atividade[]>([]);

  useEffect(() => {
    if (!ativo) return;
    const atual = new Map(itens.map((i) => [i.id, i.status]));
    const antes = anterior.current;
    anterior.current = atual;
    if (!antes) return;

    const novas: Atividade[] = [];
    for (const item of itens) {
      const statusAntes = antes.get(item.id);
      if (statusAntes === item.status) continue;
      const texto = statusAntes
        ? `${TIPO_LABEL[item.tipo]} de ${item.cliente_nome}: ${labelStatus(item.tipo, item.status)}`
        : `Nova ${TIPO_LABEL[item.tipo].toLowerCase()} — ${item.cliente_nome}`;
      novas.push({ id: `${item.id}-${item.status}-${Date.now()}`, texto, em: new Date().toISOString() });
    }
    if (novas.length === 0) return;

    setFeed((prev) => [...novas, ...prev].slice(0, 12));
    // Evita poluição: no máximo um aviso por atualização.
    toast.info(novas.length === 1 ? novas[0]!.texto : `${novas.length} movimentações atualizadas.`);
  }, [itens, ativo]);

  if (!ativo || feed.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-display text-sm font-bold text-foreground">
        <Activity className="size-4 text-primary" aria-hidden="true" /> Atividades recentes
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm">
        {feed.map((a) => (
          <li key={a.id} className="flex flex-wrap justify-between gap-2">
            <span className="text-foreground">{a.texto}</span>
            <span className="text-xs text-muted-foreground">{formatDateTimeITV(a.em)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
