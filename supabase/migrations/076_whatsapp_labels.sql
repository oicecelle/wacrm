-- ============================================================
-- 076_whatsapp_labels.sql
--
-- Etiquetas do WhatsApp (as do app WhatsApp Business), espelhadas no
-- CRM e SEPARADAS das tags do CRM — são coisas diferentes, com donos
-- diferentes: uma etiqueta do WhatsApp vive no celular da clínica e é
-- sincronizada pela Uazapi (eventos `labels` e `chat_labels`); uma tag
-- do CRM vive só aqui.
--
-- whatsapp_labels: a DEFINIÇÃO (id da etiqueta no WhatsApp, nome, cor
--   0–19). `deleted` em vez de apagar a linha, pra um evento de
--   exclusão fora de ordem não ressuscitar a etiqueta.
-- contact_whatsapp_labels: QUAL contato tem QUAL etiqueta. Normalizada
--   (uma linha por par) em vez de um array no contato, pra filtrar
--   "todos os contatos com a etiqueta X" com um índice.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  wa_label_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  color INTEGER,
  deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, wa_label_id)
);

CREATE TABLE IF NOT EXISTS contact_whatsapp_labels (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  wa_label_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, wa_label_id)
);
CREATE INDEX IF NOT EXISTS idx_contact_wa_labels_account_label
  ON contact_whatsapp_labels(account_id, wa_label_id);

ALTER TABLE whatsapp_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_whatsapp_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_isolation_whatsapp_labels" ON whatsapp_labels;
CREATE POLICY "clinic_isolation_whatsapp_labels" ON whatsapp_labels
  FOR ALL USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));

DROP POLICY IF EXISTS "clinic_isolation_contact_whatsapp_labels" ON contact_whatsapp_labels;
CREATE POLICY "clinic_isolation_contact_whatsapp_labels" ON contact_whatsapp_labels
  FOR ALL USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));
