-- ============================================================
-- 035_appointments_ai_fields.sql
-- Adiciona campos de rastreabilidade da IA (LIA) nos agendamentos,
-- deals e contatos. Idempotent — safe to run multiple times.
-- ============================================================

-- Campo para marcar que o agendamento foi criado/modificado pela LIA
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS created_by_ai BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_label TEXT; -- ex: "Criado pela LIA"

-- Campo de endereço nos contatos (extraído pela LIA da conversa)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Campo para registrar se o deal foi atualizado pela LIA
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS last_ai_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_notes TEXT; -- últimas notas da IA sobre o lead

CREATE INDEX IF NOT EXISTS idx_appointments_ai ON appointments(clinic_id, created_by_ai);
