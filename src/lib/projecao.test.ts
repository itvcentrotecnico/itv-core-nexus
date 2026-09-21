import { describe, expect, it } from "vitest";

import { calcularProjecao, diasOperacionais } from "./projecao";

describe("projeção de fechamento do mês", () => {
  const p = calcularProjecao({
    faturamento: 80628.67,
    ticketMedio: 726.38,
    hoje: new Date(2026, 8, 21),
  });

  it("calcula o quanto falta para cada nível", () => {
    expect(p.niveis[0]!.falta).toBeCloseTo(39371.33, 2);
    expect(p.niveis[1]!.falta).toBeCloseTo(44371.33, 2);
    expect(p.niveis[2]!.falta).toBeCloseTo(49371.33, 2);
  });

  it("calcula o progresso em relação ao desafio", () => {
    expect(p.progresso).toBeCloseTo(62.02, 1);
  });

  it("estima lançamentos pelo ticket médio", () => {
    expect(p.niveis.map((n) => n.lancamentos)).toEqual([55, 62, 68]);
  });

  it("identifica o próximo marco", () => {
    expect(p.proximoMarco?.valor).toBe(100000);
    expect(p.proximoMarco?.falta).toBeCloseTo(19371.33, 2);
  });

  it("aplica os pesos operacionais (sábado = 0,5, domingo = 0)", () => {
    // 21/09/2026 (segunda) a 27/09/2026 (domingo) = 5 + 0,5 + 0 = 5,5
    expect(diasOperacionais(new Date(2026, 8, 21), new Date(2026, 8, 27))).toBe(5.5);
  });

  it("nunca retorna valor faltante negativo", () => {
    const acima = calcularProjecao({
      faturamento: 150000,
      ticketMedio: 726.38,
      hoje: new Date(2026, 8, 21),
    });
    expect(acima.niveis.every((n) => n.falta === 0)).toBe(true);
    expect(acima.faixa).toBe("desafio");
    expect(acima.proximoMarco).toBeNull();
  });
});
