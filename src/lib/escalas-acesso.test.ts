import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { acessoPronto, type AcessoEscala } from "./escalas";
const acesso: AcessoEscala = { colaborador_id: "colaborador", nome: "Reis", usuario: "Thiago Reis", vinculado: true, ativo: true, pode_consultar: true };
describe("Publicação exige acesso individual", () => {
  it("bloqueia colaborador sem vínculo", () => expect(acessoPronto({ ...acesso, vinculado: false })).toBe(false));
  it("bloqueia acesso inativo", () => expect(acessoPronto({ ...acesso, ativo: false })).toBe(false));
  it("bloqueia falta de permissão de consulta", () => expect(acessoPronto({ ...acesso, pode_consultar: false })).toBe(false));
  it("bloqueia conferência indisponível", () => expect(acessoPronto(undefined)).toBe(false));
  it("libera acesso vinculado ativo com consulta", () => expect(acessoPronto(acesso)).toBe(true));
});