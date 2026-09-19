-- ============================================================
-- 045_documents_viewed_at.sql
--
-- documents já rastreava sent_at e signed_at, mas não tinha como
-- saber se o paciente chegou a ABRIR o link antes de assinar (ou
-- sem nunca assinar) — faltava o "visualizado" do funil
-- enviado -> visualizado -> assinado que a PRD pede.
--
-- Idempotente.
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
