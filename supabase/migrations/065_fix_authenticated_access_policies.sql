-- ============================================================
-- 065_fix_authenticated_access_policies.sql
--
-- Achado numa varredura de segurança em 28/09/2026 (depois de já ter
-- corrigido as políticas "bypass" de appointments/patients): 45 tabelas
-- usavam a política "Allow authenticated access", cujo USING é só
-- `auth.role() = 'authenticated'` — sem nenhum filtro por clínica.
-- Isso significa que qualquer usuário logado, de QUALQUER clínica,
-- conseguia ler e escrever nas linhas de TODAS as clínicas.
--
-- O achado mais grave: clinics guarda em texto puro os tokens de
-- integração (uazapi_token, whatsapp_token, google_maps_api_key) de
-- cada clínica — qualquer clínica conseguia ler o token de conexão
-- do WhatsApp de qualquer outra.
--
-- Esta migração corrige as tabelas que têm uma coluna clinic_id (ou,
-- no caso de `clinics`, o próprio id) — a maioria delas, e as únicas
-- que o app usa hoje (clinic_users, clinics, procedures). As 23
-- tabelas sem coluna de clínica parecem ser de um painel
-- administrativo interno à parte (admin_perfis, users, treinamento_*,
-- painel_*...) e nenhuma tela do app as usa — tratadas em
-- 066_lock_down_unused_admin_tables.sql, restringindo por enquanto em
-- vez de adivinhar a regra de acesso certa de um sistema que não
-- construímos aqui.
--
-- is_account_member() é SECURITY DEFINER (roda ignorando RLS por
-- dentro), então usá-la até na própria clinic_users não causa loop.
--
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  t text;
  tables_with_clinic_id text[] := ARRAY[
    'activity_logs','busca_historico','clinic_users','clinicas_base_conhecimento',
    'copiloto_inbox_mapping','copiloto_logs','crm_origens','events_campaigns','faq',
    'favoritos','general_information','lead_historico','lead_tarefas','materials',
    'operational_routines','painel_clientes','procedures','professionals',
    'prospeccao_leads','rules','scripts'
  ];
BEGIN
  FOREACH t IN ARRAY tables_with_clinic_id LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Allow authenticated access', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (is_account_member(clinic_id)) WITH CHECK (is_account_member(clinic_id))',
      'clinic_isolation_' || t, t
    );
  END LOOP;
END $$;

-- `clinics` is scoped by its own id, not a clinic_id column.
DROP POLICY IF EXISTS "Allow authenticated access" ON clinics;
CREATE POLICY "clinic_isolation_clinics" ON clinics
  FOR ALL USING (is_account_member(id)) WITH CHECK (is_account_member(id));
