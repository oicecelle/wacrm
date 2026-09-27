-- ============================================================
-- 057_template_resend_control.sql
--
-- Permite marcar um modelo de mensagem como "não reenviar pro
-- mesmo contato". Quando marcado, a tela de montar a audiência de
-- um disparo passa a excluir por padrão (com opção de incluir
-- mesmo assim) qualquer contato que já tenha recebido aquele
-- modelo antes, registrado em template_send_log.
--
-- Modelos sem essa marcação (prevent_resend = false, o padrão)
-- continuam funcionando exatamente como hoje — nenhuma sinalização
-- extra.
--
-- Idempotente.
-- ============================================================

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS prevent_resend BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS template_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES message_templates(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, contact_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_template_send_log_lookup
  ON template_send_log (account_id, template_id, contact_id);

ALTER TABLE template_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "template_send_log_account_access" ON template_send_log;
CREATE POLICY "template_send_log_account_access" ON template_send_log
  FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));
