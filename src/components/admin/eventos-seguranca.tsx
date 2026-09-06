import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { formatDateTimeITV } from "@/lib/format";
import { inputClass, labelClass } from "@/lib/caixa";
import { Carregando, SecaoAdmin, SemDados, TabelaAdmin } from "@/components/admin/shared";

interface EventoSegurancaRow {
  id: string;
  tipo: string;
  email: string | null;
  user_id: string | null;
  modulo: string | null;
  rota: string | null;
  detalhes: Record<string, unknown> | null;
  created_at: string;
}

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Todos os eventos" },
  { valor: "login_falho", rotulo: "Tentativa de login sem sucesso" },
  { valor: "acesso_negado", rotulo: "Acesso negado a um módulo" },
  { valor: "conta_bloqueada", rotulo: "Conta bloqueada tentou entrar" },
  { valor: "sem_perfil", rotulo: "Usuário sem perfil configurado" },
  { valor: "reset_senha_solicitado", rotulo: "Pedido de nova senha" },
];

function rotuloTipo(tipo: string) {
  return TIPOS.find((t) => t.valor === tipo)?.rotulo ?? tipo;
}

/** Registro de segurança: logins sem sucesso e tentativas de acesso indevido. */
export function AdminEventosSeguranca() {
  const [tipo, setTipo] = useState("");
  const [dias, setDias] = useState("7");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "eventos-seguranca", { tipo, dias }],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("seguranca_eventos_listar", {
        ...(tipo ? { p_tipo: tipo } : {}),
        p_dias: Number(dias),
        p_limite: 200,
      });
      if (error) throw error;
      return (rows ?? []) as unknown as EventoSegurancaRow[];
    },
  });

  return (
    <SecaoAdmin
      titulo="Registro de segurança"
      descricao="Tentativas de login sem sucesso e acessos negados, para acompanhar uso indevido do sistema."
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label className={labelClass} htmlFor="ev-tipo">
            Tipo
          </label>
          <select
            id="ev-tipo"
            className={inputClass}
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="ev-dias">
            Período
          </label>
          <select
            id="ev-dias"
            className={inputClass}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          >
            <option value="1">Últimas 24 horas</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <Carregando />
      ) : !data || data.length === 0 ? (
        <SemDados label="Nenhum evento de segurança no período." />
      ) : (
        <TabelaAdmin cabecalho={["Data", "Evento", "E-mail", "Módulo", "Tela"]}>
          {data.map((ev) => (
            <tr key={ev.id} className="border-b border-border/60">
              <td className="whitespace-nowrap px-3 py-2">{formatDateTimeITV(ev.created_at)}</td>
              <td className="px-3 py-2">{rotuloTipo(ev.tipo)}</td>
              <td className="px-3 py-2">{ev.email ?? "—"}</td>
              <td className="px-3 py-2">{ev.modulo ?? "—"}</td>
              <td className="px-3 py-2 text-muted-foreground">{ev.rota ?? "—"}</td>
            </tr>
          ))}
        </TabelaAdmin>
      )}
    </SecaoAdmin>
  );
}
