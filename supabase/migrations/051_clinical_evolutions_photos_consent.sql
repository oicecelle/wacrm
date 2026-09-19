-- ============================================================
-- 051_clinical_evolutions_photos_consent.sql
--
-- Prontuário não tinha como anexar foto de evolução, nem enviar um
-- "consentimento" da evolução (o que foi aplicado/realizado naquele
-- dia) pra assinatura do paciente — importante pra clínica ter como
-- provar que um procedimento/sessão específico foi realizado em
-- determinada data/hora, caso o paciente conteste depois quantas
-- sessões de um pacote realmente usou.
--
-- Idempotente.
-- ============================================================

ALTER TABLE clinical_evolutions ADD COLUMN IF NOT EXISTS photos JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE clinical_evolutions ADD COLUMN IF NOT EXISTS consent_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE clinical_evolutions ADD COLUMN IF NOT EXISTS consent_requested_at TIMESTAMPTZ;
