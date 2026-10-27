import { z } from 'zod';

export const recursosFinanceiros = ['recebimentos', 'pagamentos', 'formas_pagamento', 'taxas', 'titulos', 'recebimentos_titulos'] as const;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
export const consultaFinanceira = z.object({
  recurso: z.enum(recursosFinanceiros), inicio: date, fim: date,
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  limite: z.coerce.number().int().min(1).max(500).default(100),
}).strict().refine(v => {
  const days = (Date.parse(v.fim) - Date.parse(v.inicio)) / 86400000;
  return days >= 0 && days <= 366;
});

// Compare fixed-size digests without reporting any credential-derived information.
export async function autorizarIntegracao(header: string | null, secret: string | undefined) {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const bytes = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', bytes.encode(header.slice(7))),
    crypto.subtle.digest('SHA-256', bytes.encode(secret)),
  ]);
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function atenderConsultaFinanceira(
  request: Request, secret: string | undefined,
  read: (params: z.infer<typeof consultaFinanceira>) => Promise<unknown>,
) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!(await autorizarIntegracao(request.headers.get('authorization'), secret)))
    return Response.json({ error: 'Acesso não autorizado' }, { status: 401, headers });
  if (request.method !== 'GET')
    return Response.json({ error: 'Somente leitura' }, { status: 405, headers: { ...headers, Allow: 'GET' } });
  const entries = [...new URL(request.url).searchParams.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    return Response.json({ error: 'Consulta inválida' }, { status: 400, headers });
  const parsed = consultaFinanceira.safeParse(Object.fromEntries(entries));
  if (!parsed.success) return Response.json({ error: 'Consulta inválida' }, { status: 400, headers });
  try { return Response.json(await read(parsed.data), { headers }); }
  catch { return Response.json({ error: 'Consulta indisponível' }, { status: 503, headers }); }
}