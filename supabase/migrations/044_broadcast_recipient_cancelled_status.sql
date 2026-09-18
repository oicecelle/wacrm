-- ============================================================
-- 044_broadcast_recipient_cancelled_status.sql
--
-- Suporta cancelar um destinatário individual (não o disparo inteiro)
-- dentro da lista de um disparo agendado — o worker do cron já só
-- processa recipients com status='pending', então um 'cancelled'
-- simplesmente nunca é pego, sem precisar de nenhuma mudança no
-- worker.
--
-- Idempotente.
-- ============================================================

ALTER TABLE broadcast_recipients DROP CONSTRAINT IF EXISTS broadcast_recipients_status_check;

ALTER TABLE broadcast_recipients ADD CONSTRAINT broadcast_recipients_status_check
  CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'replied', 'failed', 'cancelled'));
