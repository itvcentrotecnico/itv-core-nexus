import { describe, expect, it } from "vitest";
import { minutosDia, totalSemana, inconsistencias, horas, semanaData } from "./escalas-calculo";
describe("Jornadas ITV", () => {
  it("08–18 com 60 minutos equivale a 9h", () =>
    expect(minutosDia({ folga: false, entrada: 480, saida: 1080, intervalo: 60 })).toBe(540));
  it("08–12 sem intervalo equivale a 4h", () =>
    expect(minutosDia({ folga: false, entrada: 480, saida: 720, intervalo: 0 })).toBe(240));
  it("08–13 com 15 minutos equivale a 4h45", () =>
    expect(minutosDia({ folga: false, entrada: 480, saida: 780, intervalo: 15 })).toBe(285));
  it("soma minutos sem arredondar ou forçar 42 horas", () => {
    const n = totalSemana(
      Array.from({ length: 6 }, () => ({ folga: false, entrada: 480, saida: 780, intervalo: 15 })),
    );
    expect(n).toBe(1710);
    expect(n - 2520).toBe(-810);
    expect(horas(n)).toBe("28h30");
  });
  it("folga não gera horas", () =>
    expect(minutosDia({ folga: true, entrada: null, saida: null, intervalo: 0 })).toBe(0));
  it("exige entrada e saída em passos de 30 minutos", () =>
    expect(inconsistencias({ folga: false, entrada: 495, saida: 780, intervalo: 15 })).toBe(true));
  it("bloqueia intervalo maior que a jornada", () =>
    expect(inconsistencias({ folga: false, entrada: 480, saida: 510, intervalo: 60 })).toBe(true));
  it("semana começa na segunda-feira", () => expect(semanaData("2026-11-15")).toBe("2026-11-09"));
});
