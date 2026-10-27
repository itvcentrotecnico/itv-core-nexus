import { describe, expect, it } from 'vitest';
import { atenderConsultaFinanceira, consultaFinanceira } from './integracao-financeiro-acesso';

const url = 'http://localhost/api/public/integracao-financeiro?recurso=recebimentos&inicio=2026-10-01&fim=2026-10-26';
// Non-credential fixture, used only by pure unit tests.
const fixture = 'unit-test-only';
describe('isolamento financeiro', () => {
  it('permite consulta autenticada e retorna apenas o resultado autorizado', async () => {
    const response = await atenderConsultaFinanceira(new Request(url, { headers: { authorization: `Bearer ${fixture}` } }), fixture, async () => ({ dados: [{ id: 'receipt', valor_final: 100 }] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dados: [{ id: 'receipt', valor_final: 100 }] });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('bloqueia escrita por %s antes de acessar dados', async method => {
    let called = false;
    const response = await atenderConsultaFinanceira(new Request(url, { method, headers: { authorization: `Bearer ${fixture}` } }), fixture, async () => { called = true; });
    expect(response.status).toBe(405); expect(called).toBe(false);
  });
  it('nega acesso sem autenticação', async () => {
    let called = false;
    const response = await atenderConsultaFinanceira(new Request(url), fixture, async () => { called = true; });
    expect(response.status).toBe(401); expect(called).toBe(false);
  });
  it('nega acesso quando integração não está configurada', async () => {
    const response = await atenderConsultaFinanceira(new Request(url, { headers: { authorization: `Bearer ${fixture}` } }), undefined, async () => []);
    expect(response.status).toBe(401);
  });
  it.each(['profiles', 'caixa_registrar_lancamento', 'contas_receber_receber', 'coletas_solicitacoes'])('nega recurso fora do escopo %s', recurso => {
    expect(consultaFinanceira.safeParse({ recurso, inicio: '2026-10-01', fim: '2026-10-26' }).success).toBe(false);
  });
  it('nega seleção arbitrária de campos e funções', () => {
    expect(consultaFinanceira.safeParse({ recurso: 'recebimentos', inicio: '2026-10-01', fim: '2026-10-26', select: '*', rpc: 'caixa_registrar_lancamento' }).success).toBe(false);
  });
});