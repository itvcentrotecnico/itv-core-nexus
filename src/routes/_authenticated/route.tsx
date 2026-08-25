import { createFileRoute, redirect } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";

// Porta de acesso das rotas privadas. A sessão vive no armazenamento do
// navegador, por isso o gate roda no cliente (ssr: false) — sem loops de
// redirecionamento em refresh e sem flash de conteúdo protegido.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});
