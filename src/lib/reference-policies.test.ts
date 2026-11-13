import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("drizzle/migrations/0013_restrict_selected_reference_read_policies.sql", "utf8");
describe("Selected shared reference read policies", () => {
  it("changes exactly the thirteen selected policies and no write policies", () => {
    expect(sql.match(/ALTER POLICY/g)).toHaveLength(13);
    expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE public|DELETE FROM|DROP POLICY|CREATE POLICY)\b/i);
    expect(sql).not.toMatch(/USING\s*\(true\)/i);
  });
  it("requires an active authenticated identity and effective permissions including overrides", () => {
    expect(sql).toContain("auth.uid() IS NOT NULL");
    expect(sql).toContain("p.active AND p.status='ativo'");
    expect(sql).toContain("public.has_permission(auth.uid(),rp.module_key,rp.action)");
    expect(sql).toContain("public.has_permission(auth.uid(),up.module_key,up.action)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.reference_module_access(text[]) FROM PUBLIC,anon");
    expect(sql).toContain("SET search_path = public");
  });
  it("scopes role permission reads without recursive RLS", () => {
    expect(sql).toContain("public.has_role(auth.uid(),role)");
    expect(sql).toContain("ARRAY['admin','admin-permissoes']");
    expect(sql).not.toMatch(/USING\s*\(.*SELECT.*role_permissions/i);
  });
  it("scopes configuration by known keys and denies unknown keys by default", () => {
    expect(sql).toContain("CASE key");
    expect(sql).toContain("ELSE false END");
    expect(sql).toContain("WHEN 'coletas_mensagem' THEN public.reference_module_access(ARRAY['coletas'])");
    expect(sql).toContain("WHEN 'modo_tv' THEN public.reference_module_access(ARRAY['modo_tv'])");
  });
  it("does not expose supplier data to technical stock readers", () => {
    const supplier = sql.split("ALTER POLICY fornecedores_select")[1]?.split(";")[0];
    expect(supplier).toContain("'pecas','financeiro','terceirizados'");
    expect(supplier).not.toContain("'estoque'");
    expect(supplier).not.toContain("'producao'");
  });
});