-- ============================================================
-- 056_broadcasts_paused_status.sql
--
-- Permite pausar um disparo em andamento (status 'sending' ->
-- 'paused') e retomar depois ('paused' -> 'sending'). O cron de
-- disparos já ignora qualquer status diferente de 'sending' na
-- consulta de trabalho pendente, então só adicionar o valor à
-- trava (CHECK) já basta pra pausar funcionar — retomar já respeita
-- o intervalo configurado, porque o ritmo de envio é calculado a
-- partir de last_sent_at (tempo decorrido), não de um contador
-- interno que precisaria ser resetado.
--
-- Idempotente.
-- ============================================================

ALTER TABLE broadcasts DROP CONSTRAINT IF EXISTS broadcasts_status_check;
ALTER TABLE broadcasts ADD CONSTRAINT broadcasts_status_check
  CHECK (status = ANY (ARRAY['draft', 'scheduled', 'sending', 'paused', 'sent', 'failed', 'cancelled']::text[]));
