-- ============================================================
-- 038_broadcast_cancelled_status.sql
--
-- A tela de Histórico (Fase 5) precisa poder cancelar um disparo
-- agendado antes que o worker do cron comece a enviá-lo. Adiciona
-- 'cancelled' ao conjunto de status permitido — o worker já ignora
-- qualquer status fora de 'scheduled'/'sending', então nenhuma
-- mudança de código é necessária além disso.
-- ============================================================

ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'));
