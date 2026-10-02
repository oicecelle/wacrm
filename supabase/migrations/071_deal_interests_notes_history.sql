-- ============================================================
-- 071_deal_interests_notes_history.sql
--
-- Três peças pedidas: interesse e observação viram listas de verdade
-- (várias entradas acumuladas ao longo do tempo, cada uma com data),
-- e status/estágio ganham um histórico de mudança — sem deixar de
-- ter "o valor atual" (deals.status / deals.crm_stage continuam
-- existindo e sendo o que filtros/kanban usam).
--
-- deal_interests / deal_notes: lista de verdade, cada linha é uma
-- entrada independente (não se sobrescreve).
--
-- deal_field_history: genérica (não uma tabela por campo) — guarda
-- de/para de cada mudança de status ou estágio, com quem/quando.
-- changed_by_automation_id é nulo quando a mudança foi manual (feita
-- por uma pessoa, não por uma automação).
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_interests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  created_by_automation_id UUID REFERENCES automations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_deal_interests_deal ON deal_interests(deal_id);

CREATE TABLE IF NOT EXISTS deal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  created_by_automation_id UUID REFERENCES automations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_deal_notes_deal ON deal_notes(deal_id);

CREATE TABLE IF NOT EXISTS deal_field_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('status', 'crm_stage')),
  old_value TEXT,
  new_value TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_user_id UUID,
  changed_by_automation_id UUID REFERENCES automations(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_deal_field_history_deal ON deal_field_history(deal_id, field, changed_at DESC);

ALTER TABLE deal_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_field_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_deal_interests" ON deal_interests;
CREATE POLICY "clinic_isolation_deal_interests" ON deal_interests
  FOR ALL USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));

DROP POLICY IF EXISTS "clinic_isolation_deal_notes" ON deal_notes;
CREATE POLICY "clinic_isolation_deal_notes" ON deal_notes
  FOR ALL USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));

DROP POLICY IF EXISTS "clinic_isolation_deal_field_history" ON deal_field_history;
CREATE POLICY "clinic_isolation_deal_field_history" ON deal_field_history
  FOR ALL USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));
