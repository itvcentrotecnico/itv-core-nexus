import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Copy, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { gerarComunicados, listarMotoristas, type Comunicado } from "@/lib/comunicados.functions";

export const Route = createFileRoute("/_authenticated/gerencia-operacional/comunicados")({
  head: () => ({
    meta: [
      { title: "Comunicados aos Motoristas — Gestão ITV" },
      { name: "description", content: "Gere comunicados claros sobre mudanças operacionais para os motoristas." },
      { property: "og:title", content: "Comunicados aos Motoristas — Gestão ITV" },
      { property: "og:description", content: "Comunicados personalizados de mudanças operacionais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Comunicados,
});

const TONS = [
  { v: "cordial", l: "Cordial" },
  { v: "firme", l: "Firme" },
  { v: "motivador", l: "Motivador" },
] as const;

function Comunicados() {
  const listar = useServerFn(listarMotoristas);
  const gerar = useServerFn(gerarComunicados);
  const motoristas = useQuery({ queryKey: ["comunicados-motoristas"], queryFn: () => listar() });

  const [mudanca, setMudanca] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [tom, setTom] = useState<(typeof TONS)[number]["v"]>("cordial");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [res, setRes] = useState<Comunicado[]>([]);

  const m = useMutation({
    mutationFn: () => gerar({ data: { mudanca, vigencia, tom, motoristaIds: [...sel] } }),
    onSuccess: (r) => setRes(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const whats = (c: Comunicado) => {
    const tel = (c.telefone ?? "").replace(/\D/g, "");
    const num = tel ? (tel.startsWith("55") ? tel : `55${tel}`) : "";
    return `https://wa.me/${num}?text=${encodeURIComponent(c.texto)}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informar mudança operacional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mudanca">O que mudou? *</Label>
            <Textarea
              id="mudanca"
              rows={5}
              value={mudanca}
              onChange={(e) => setMudanca(e.target.value)}
              placeholder="Ex.: A partir de novembro, o Caixa só lança entrega + comissão depois da conferência da avaliação no Google."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vig">A partir de quando?</Label>
            <Input id="vig" value={vigencia} onChange={(e) => setVigencia(e.target.value)} placeholder="Ex.: 01/11/2026" />
          </div>
          <div className="space-y-1.5">
            <Label>Tom</Label>
            <div className="flex gap-2">
              {TONS.map((t) => (
                <Button key={t.v} type="button" size="sm" variant={tom === t.v ? "default" : "outline"} onClick={() => setTom(t.v)}>
                  {t.l}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Motoristas</Label>
            <p className="text-xs text-muted-foreground">
              Marque para gerar uma mensagem personalizada para cada um. Sem marcar, gera uma mensagem geral para a equipe.
            </p>
            {motoristas.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando…</p>
            ) : (motoristas.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum motorista cadastrado.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {motoristas.data!.map((mo) => (
                  <label key={mo.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <Checkbox checked={sel.has(mo.id)} onCheckedChange={() => toggle(mo.id)} />
                    {mo.nome}
                  </label>
                ))}
              </div>
            )}
          </div>
          <Button className="w-full sm:w-auto" disabled={mudanca.trim().length < 10 || m.isPending} onClick={() => m.mutate()}>
            {m.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            {m.isPending ? "Gerando comunicado…" : "Gerar comunicado"}
          </Button>
        </CardContent>
      </Card>

      {res.map((c, i) => (
        <Card key={c.motoristaId ?? i}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">Para: {c.nome}</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(c.texto).then(() => toast.success("Mensagem copiada"))}
              >
                <Copy className="mr-1 size-4" /> Copiar
              </Button>
              <Button size="sm" asChild>
                <a href={whats(c)} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1 size-4" /> WhatsApp
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea
              rows={10}
              value={c.texto}
              onChange={(e) => setRes((r) => r.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
