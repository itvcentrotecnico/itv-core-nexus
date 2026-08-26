CREATE OR REPLACE VIEW public.colaboradores_view AS
 SELECT c.id,
    c.nome,
    c.nome_exibicao,
    c.cargo_id,
    c.setor_id,
    c.data_admissao,
    c.tipo_vinculo,
    c.status,
    c.telefone,
    c.email,
    c.observacao,
    c.user_id,
    c.desligado_em,
    c.motivo_desligamento,
    c.created_by,
    c.created_at,
    c.updated_at,
    c.updated_by,
    cg.nome AS cargo_nome,
    st.nome AS setor_nome,
    ( SELECT s.valor
           FROM colaborador_salarios s
          WHERE s.colaborador_id = c.id AND s.inicio_vigencia <= (now() AT TIME ZONE 'America/Manaus'::text)::date AND (s.fim_vigencia IS NULL OR s.fim_vigencia >= (now() AT TIME ZONE 'America/Manaus'::text)::date)
          ORDER BY s.inicio_vigencia DESC
         LIMIT 1) AS salario_atual,
    c.recebe_comissao_entrega,
    coalesce(cg.funcao_entrega, false) AS cargo_funcao_entrega
   FROM colaboradores c
     LEFT JOIN cargos cg ON cg.id = c.cargo_id
     LEFT JOIN setores st ON st.id = c.setor_id;