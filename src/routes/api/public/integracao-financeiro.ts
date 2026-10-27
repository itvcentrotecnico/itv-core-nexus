import { createFileRoute } from '@tanstack/react-router';
import { atenderConsultaFinanceira } from '@/lib/integracao-financeiro-acesso';

export const Route = createFileRoute('/api/public/integracao-financeiro')({
  server: {
    handlers: {
      ANY: async ({ request }) => atenderConsultaFinanceira(
        request, process.env['GESTAO_ITV_READ_TOKEN'], async params => {
          // Privileged credential stays inside the origin. It is never supplied to HML.
          // The only reachable operation is a fixed, STABLE read function.
          const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
          const { data, error } = await supabaseAdmin.rpc('integracao_financeiro_hml_ler', {
            p_recurso: params.recurso, p_inicio: params.inicio, p_fim: params.fim,
            p_offset: params.offset, p_limite: params.limite,
          });
          if (error) throw new Error('Consulta indisponível');
          return data;
        },
      ),
    },
  },
});