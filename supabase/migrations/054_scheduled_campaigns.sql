-- ============================================================
-- 054_scheduled_campaigns.sql
--
-- Campanhas recorrentes filtradas por tag — o mecanismo que faltava
-- pra "toda seg-sáb às 15h, mandar mensagem/modelo/mídia pra quem
-- tem a tag X, e depois marcar como Y". Diferente de um Disparo (que
-- é um envio único, manual), isso roda sozinho, todo dia configurado,
-- puxando a lista de contatos na hora (não uma lista fixa salva).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS scheduled_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- 0=domingo .. 6=sábado, como JS Date#getDay()
  days_of_week SMALLINT[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  time_of_day TIME NOT NULL,
  filter_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL DEFAULT 'send_template'
    CHECK (action_type IN ('send_template', 'send_media')),
  -- send_template: { template_name }. send_media: { media_type, media_url, filename, caption }.
  action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  apply_tag_id UUID REFERENCES tags(id) ON DELETE SET NULL,
  remove_filter_tag BOOLEAN NOT NULL DEFAULT false,
  -- Guards against sending twice if the cron fires more than once
  -- inside the same target day/hour window.
  last_run_date DATE,
  last_run_stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE scheduled_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scheduled_campaigns_account_access" ON scheduled_campaigns;
CREATE POLICY "scheduled_campaigns_account_access" ON scheduled_campaigns
  FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));
