-- ============================================================
-- 055_scheduled_campaigns_audience_type.sql
--
-- Generaliza "quem recebe" pra além de só tag — o pedido concreto foi
-- "toda seg a seg às 9h30, mandar confirmação pra quem tem
-- agendamento amanhã". audience_type escolhe a fonte:
--   'tag'                    -> contact_tags (comportamento original)
--   'appointments_relative'  -> appointments com start_time no dia
--                                (hoje + appointment_day_offset)
--
-- Idempotente.
-- ============================================================

ALTER TABLE scheduled_campaigns
  ADD COLUMN IF NOT EXISTS audience_type TEXT NOT NULL DEFAULT 'tag'
    CHECK (audience_type IN ('tag', 'appointments_relative'));

ALTER TABLE scheduled_campaigns
  ADD COLUMN IF NOT EXISTS appointment_day_offset SMALLINT NOT NULL DEFAULT 1;
