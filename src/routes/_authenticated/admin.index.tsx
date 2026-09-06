import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ExternalLink, ShieldCheck } from "lucide-react";

import { ADMIN_TABS, isAdminTab, type AdminTab } from "@/lib/admin";
import { useAccess } from "@/hooks/use-auth";
import { Carregando, SecaoAdmin, SemAcesso } from "@/components/admin/shared";
import { AdminUsuarios } from "@/components/admin/usuarios";
import { AdminPerfis } from "@/components/admin/perfis";
import { AdminTecnicos } from "@/components/admin/tecnicos";
import { AdminCadastros } from "@/components/admin/cadastros";
import { AdminRegrasComissao } from "@/components/admin/regras-comissao";
import { AdminComissaoEntrega } from "@/components/admin/comissao-entrega";
import { AdminTaxasRecebimento } from "@/components/admin/taxas-recebimento";

import { AdminParametros } from "@/components/admin/parametros";
import { AdminFechamentos } from "@/components/admin/fechamentos";
import { AdminAuditoria } from "@/components/admin/auditoria";
import { AdminEventosSeguranca } from "@/components/admin/eventos-seguranca";
import { AdminGeral } from "@/components/admin/geral";
import { AdminBackup } from "@/components/admin/backup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdminSearch {
  aba: AdminTab;
}

export const Route = createFileRoute("/_authenticated/admin/")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    aba: isAdminTab(search["aba"]) ? search["aba"] : "usuarios",
  }),
  head: () => ({
    meta: [
      { title: "Administração — GESTÃO ITV Centro Técnico" },
      {
        name: "description",
        content:
          "Parâmetros mestres, usuários, permissões, cadastros, auditoria e governança do sistema ITV.",
      },
      { property: "og:title", content: "Administração — GESTÃO ITV Centro Técnico" },
      {
        property: "og:description",
        content: "Central de configurações, permissões e governança da ITV Centro Técnico.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { aba } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/" });
  const { isAdmin, can, isLoading } = useAccess();

  if (isLoading) return <Carregando />;

  const podeVer = isAdmin || can("admin", "visualizar") || can("admin", "administrar");
  if (!podeVer) return <SemAcesso />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Administração e Governança
          </h1>
          <p className="text-sm text-muted-foreground">
            Parâmetros mestres do sistema. Toda alteração crítica exige confirmação e fica
            registrada na auditoria.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <ShieldCheck className="size-3.5" /> Área restrita
        </span>
      </header>

      <nav className="flex flex-wrap gap-2 border-b border-border pb-3">
        {ADMIN_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => void navigate({ search: { aba: t.value } })}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm transition-colors",
              aba === t.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {aba === "usuarios" ? <AdminUsuarios /> : null}
      {aba === "perfis" ? <AdminPerfis /> : null}
      {aba === "tecnicos" ? <AdminTecnicos /> : null}
      {aba === "cadastros" ? <AdminCadastros /> : null}
      {aba === "comissoes" ? <AdminRegrasComissao /> : null}
      {aba === "comissao-entrega" ? <AdminComissaoEntrega /> : null}
      {aba === "taxas-recebimento" ? <AdminTaxasRecebimento /> : null}

      {aba === "parametros" ? <AdminParametros /> : null}
      {aba === "fechamentos" ? <AdminFechamentos /> : null}
      {aba === "auditoria" ? (
        <div className="space-y-6">
          <AdminAuditoria />
          <AdminEventosSeguranca />
        </div>
      ) : null}
      {aba === "geral" ? <AdminGeral /> : null}
      {aba === "backup" ? <AdminBackup /> : null}
      {aba === "modo-tv" ? (
        <SecaoAdmin
          titulo="Modo TV"
          descricao="Painel de gestão à vista para os monitores da oficina: blocos exibidos, rotação e mensagem institucional."
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/admin/modo-tv">Configurar Modo TV</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/modo-tv" target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 size-4" /> Abrir painel
              </Link>
            </Button>
          </div>
        </SecaoAdmin>
      ) : null}
    </div>
  );
}
