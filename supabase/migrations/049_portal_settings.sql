-- ============================================================
-- 049_portal_settings.sql
--
-- O Portal do Cliente (login, agendamento online, config da
-- clínica em Comunicação > Portal) já estava construído nas duas
-- pontas, mas a tabela portal_settings nunca foi criada — toda
-- consulta contra ela falhava silenciosamente, então nada disso
-- nunca funcionou de verdade: a clínica não conseguia salvar
-- configuração nenhuma, e o portal do paciente sempre caía nos
-- valores padrão (tudo habilitado, sem banners, sem marca própria).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  welcome_title TEXT,
  welcome_subtitle TEXT,
  logo_url TEXT,
  enabled_scheduling BOOLEAN NOT NULL DEFAULT true,
  enabled_cancellation BOOLEAN NOT NULL DEFAULT true,
  enabled_rescheduling BOOLEAN NOT NULL DEFAULT true,
  banners_carousel JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE portal_settings ENABLE ROW LEVEL SECURITY;

-- Read is public: the patient-facing /portal/[slug] pages load this
-- (welcome text, logo, banners, which actions are enabled) without
-- any Supabase-authenticated session — patients sign in through a
-- separate phone+OTP flow, not Supabase Auth. This table only holds
-- what the clinic already intends to show publicly on its own portal
-- page, same trust level as a public storefront's own settings.
DROP POLICY IF EXISTS "portal_settings_public_read" ON portal_settings;
CREATE POLICY "portal_settings_public_read" ON portal_settings
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "portal_settings_account_write" ON portal_settings;
CREATE POLICY "portal_settings_account_write" ON portal_settings
  FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));
