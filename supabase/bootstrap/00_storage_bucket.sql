-- PORTABILIDADE — Storage bucket
-- Este objeto foi criado pela plataforma (não por migration) e por isso NÃO é
-- reproduzido pelos arquivos de supabase/migrations. Execute este script no
-- Supabase externo ANTES das migrations que criam as policies de storage.objects
-- (elas assumem o bucket 'producao' existente).
--
-- Bucket: producao  |  privado (public = false)
-- Uso: fotos de evidência da Produção Técnica, lidas via URL assinada.

insert into storage.buckets (id, name, public)
values ('producao', 'producao', false)
on conflict (id) do nothing;
