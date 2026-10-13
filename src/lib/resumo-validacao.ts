/** Regras puras do Resumo Executivo (testáveis, sem dependências). */

/** Normaliza "1.234,56" / "1234.56" / "R$ 32.956,90" em número. */
function paraNumero(raw: string): number | null {
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Números citados no texto que não aparecem nos indicadores (ignora 1–3, usados em listas e "3 prioridades"). */
export function numerosSemSuporte(texto: string, fatosJson: string): string[] {
  const permitidos = new Set<number>();
  for (const m of fatosJson.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    permitidos.add(n);
    permitidos.add(Math.round(n));
    permitidos.add(Math.round(n * 10) / 10);
  }
  const fora: string[] = [];
  for (const m of texto.matchAll(/\d[\d.,]*/g)) {
    const raw = m[0].replace(/[.,]$/, "");
    const n = paraNumero(raw);
    if (n == null || n <= 3) continue;
    // Percentuais derivados (ex.: 27% da meta) são aceitos se arredondados de razão existente
    if (!permitidos.has(n) && !permitidos.has(Math.round(n))) fora.push(raw);
  }
  return fora;
}

/** Variação vs período anterior: com base zero devolve só a diferença absoluta. */
export function variacao(atual: number, anterior: number): { diff: number; pct: number | null } {
  const diff = atual - anterior;
  return { diff, pct: anterior === 0 ? null : Math.round((diff / anterior) * 1000) / 10 };
}
