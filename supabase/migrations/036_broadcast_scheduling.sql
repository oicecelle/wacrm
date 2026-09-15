-- ============================================================
-- 036_broadcast_scheduling.sql
--
-- Backend de disparos passa a rodar via cron/fila no servidor em vez
-- de um loop síncrono no navegador do usuário. Esta migração adiciona
-- o que falta pra isso funcionar:
--
--   1. broadcasts.interval_seconds — segundos entre cada envio dentro
--      de um mesmo disparo (configurável por disparo).
--   2. broadcasts.last_sent_at — timestamp do último envio, usado
--      pelo worker do cron para saber quando o próximo é devido.
--   3. broadcast_recipients.params — variáveis já resolvidas
--      (nome, sobrenome, data, horário, etc.) por destinatário,
--      guardadas no momento da criação do disparo em vez de
--      recalculadas no envio. Isso também é o que a Fase 3 (tela de
--      personalizar) vai editar antes do envio.
--
-- Idempotente — seguro rodar mais de uma vez.
-- ============================================================

ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS interval_seconds INTEGER NOT NULL DEFAULT 5 CHECK (interval_seconds >= 1),
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS params JSONB NOT NULL DEFAULT '[]'::jsonb;

-- scheduled_at já existia mas era opcional / não usado de fato para
-- agendar. A partir de agora todo disparo tem um horário de disparo
-- (imediato = scheduled_at = NOW() no momento da criação).
ALTER TABLE broadcasts
  ALTER COLUMN scheduled_at SET DEFAULT NOW();

-- Índice para o worker do cron localizar rapidamente os disparos
-- agendados que já venceram.
CREATE INDEX IF NOT EXISTS idx_broadcasts_status_scheduled
  ON broadcasts (status, scheduled_at)
  WHERE status IN ('scheduled', 'sending');
