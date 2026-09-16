-- ============================================================
-- 040_fix_clinic_users_user_id_fkey.sql
--
-- clinic_users.user_id referenciava uma tabela `public.users` órfã —
-- não é populada por handle_new_user() (o trigger real de signup, que
-- só grava em accounts e profiles) nem por nenhum outro código deste
-- projeto. Provavelmente sobrou de um sistema anterior ao Supabase
-- Auth. Resultado: QUALQUER tentativa de inserir um user_id real
-- (mesmo de um usuário existente e funcional) em clinic_users falhava
-- com "violates foreign key constraint clinic_users_user_id_fkey" —
-- isso inclui tanto a criação de clínica nova quanto, em tese, o
-- fluxo de aceitar convite de equipe, que nunca tinha sido testado
-- com um usuário 100% novo.
--
-- Corrige apontando para auth.users(id), a mesma referência que
-- accounts.owner_user_id já usa corretamente.
--
-- Idempotente.
-- ============================================================

ALTER TABLE clinic_users DROP CONSTRAINT IF EXISTS clinic_users_user_id_fkey;

ALTER TABLE clinic_users
  ADD CONSTRAINT clinic_users_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
