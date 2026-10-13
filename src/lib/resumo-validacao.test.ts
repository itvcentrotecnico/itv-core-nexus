import { describe, expect, it } from "vitest";

import { numerosSemSuporte, variacao } from "./resumo-validacao";

describe("variacao", () => {
  it("base zero não gera percentual, só diferença absoluta", () => {
    expect(variacao(5, 0)).toEqual({ diff: 5, pct: null });
  });
  it("calcula percentual com base positiva", () => {
    expect(variacao(15, 10)).toEqual({ diff: 5, pct: 50 });
  });
});

describe("numerosSemSuporte", () => {
  const fatos = JSON.stringify({ leads: 37, servicos: 32956.9 });
  it("aceita números presentes nos indicadores, inclusive em formato brasileiro", () => {
    expect(numerosSemSuporte("37 leads e R$ 32.956,90 em serviços", fatos)).toEqual([]);
  });
  it("rejeita número inventado", () => {
    expect(numerosSemSuporte("Foram 120 leads", fatos)).toEqual(["120"]);
  });
});
