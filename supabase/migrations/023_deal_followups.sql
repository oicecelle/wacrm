-- Migration 023: Deal Follow-ups & CRM Enhanced Fields
-- Idempotent — safe to re-run
-- ============================================================

-- 1. Novos campos no deals
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS followup_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_type text CHECK (followup_type IN ('auto', 'manual')),
  ADD COLUMN IF NOT EXISTS followup_message text,
  ADD COLUMN IF NOT EXISTS future_task_date timestamptz,
  ADD COLUMN IF NOT EXISTS future_task_note text,
  ADD COLUMN IF NOT EXISTS alert_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS alert_note text,
  ADD COLUMN IF NOT EXISTS objections text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL;

-- 2. Nova tabela de fila de follow-ups
CREATE TABLE IF NOT EXISTS deal_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  message text NOT NULL,
  ai_generated boolean DEFAULT true,
  type text NOT NULL DEFAULT 'auto' CHECK (type IN ('auto', 'manual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Configurações de follow-up por conta
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS followup_delay_hours int DEFAULT 4,
  ADD COLUMN IF NOT EXISTS followup_schedule_type text DEFAULT 'next_day_at_time'
    CHECK (followup_schedule_type IN ('next_day_at_time', 'hours_after')),
  ADD COLUMN IF NOT EXISTS followup_send_time text DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS followup_hours_after int DEFAULT 24,
  ADD COLUMN IF NOT EXISTS followup_use_ai boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_default_template text,
  ADD COLUMN IF NOT EXISTS lead_sources text[] DEFAULT ARRAY['WhatsApp Orgânico','Instagram','Indicação','Site','Google','TikTok'];

-- 4. RLS na tabela deal_followups
ALTER TABLE deal_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account members can manage followups" ON deal_followups;
CREATE POLICY "account members can manage followups"
  ON deal_followups FOR ALL
  USING (is_account_member(account_id, 'viewer'))
  WITH CHECK (is_account_member(account_id, 'agent'));

-- 5. Index para o cron (busca eficiente de follow-ups pendentes)
CREATE INDEX IF NOT EXISTS deal_followups_pending_scheduled
  ON deal_followups (account_id, scheduled_at)
  WHERE status = 'pending';

-- 6. Index para busca de follow-up por deal
CREATE INDEX IF NOT EXISTS deal_followups_deal_id
  ON deal_followups (deal_id)
  WHERE status = 'pending';
