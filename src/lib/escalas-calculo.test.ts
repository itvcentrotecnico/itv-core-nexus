import { describe, expect, it } from "vitest";
import {
  minutosDia,
  totalSemana,
  inconsistencias,
  horas,
  semanaData,
  cobertura,
  propostaInicial,
} from "./escalas-calculo";
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
  it("12–13 desconta exatamente 60 minutos de 08–18", () =>
    expect(
      minutosDia({
        folga: false,
        entrada: 480,
        saida: 1080,
        intervalo: 0,
        intervalo_inicio: 720,
        intervalo_fim: 780,
      }),
    ).toBe(540));
  it("aceita intervalo de 15 minutos", () =>
    expect(
      inconsistencias({
        folga: false,
        entrada: 480,
        saida: 780,
        intervalo: 15,
        intervalo_inicio: 720,
        intervalo_fim: 735,
      }),
    ).toBe(false));
  it("bloqueia intervalo fora da jornada", () =>
    expect(
      inconsistencias({
        folga: false,
        entrada: 480,
        saida: 780,
        intervalo: 60,
        intervalo_inicio: 750,
        intervalo_fim: 810,
      }),
    ).toBe(true));
  it("bloqueia intervalo incompleto", () =>
    expect(
      inconsistencias({
        folga: false,
        entrada: 480,
        saida: 780,
        intervalo: 0,
        intervalo_inicio: 720,
      }),
    ).toBe(true));
  it("proposta inclui sete pessoas, folgas e sábado sem inventar dias úteis", () => {
    const e = propostaInicial([]);
    expect(e).toHaveLength(7);
    expect(e.every((p) => p.meta === 2520 && p.dias[6]?.folga)).toBe(true);
    expect(e.map((p) => p.dias[5]?.saida)).toEqual([720, 720, 780, 780, 720, 780, 720]);
    expect(e.map((p) => p.dias.findIndex((d) => d.folga))).toEqual([6, 6, 1, 3, 2, 2, 1]);
    expect(e.every((p) => p.dias[0]?.entrada === null)).toBe(true);
  });
  it("cobertura desconta almoço e aponta sábado 12–13", () => {
    const e = propostaInicial([])
      .filter((p) => p.nome === "Daniel" || p.nome === "Abias")
      .map((p) => ({
        ...p,
        dias: p.dias.map(() => ({
          folga: false,
          entrada: 480,
          saida: 1080,
          intervalo: 60,
          intervalo_inicio: 720,
          intervalo_fim: 780,
        })),
      }));
    const r = {
      abertura: 480,
      fechamento: 1080,
      sabado_abertura: 480,
      sabado_fechamento: 780,
      domingo_fechado: true,
      prioridade_completa: [0, 4],
      todos_sabado: true,
      minimo_sabado: 5,
      max_diario: 480,
      intervalo_minimo: 60,
      intervalo_apos: 360,
    };
    expect(cobertura(e, r)).toContainEqual({ dia: 5, inicio: 720, fim: 780, setor: "Motoristas" });
    expect(cobertura(e, r)).toContainEqual({
      dia: 0,
      inicio: 720,
      fim: 780,
      setor: "Atendimento comercial",
    });
  });
});
