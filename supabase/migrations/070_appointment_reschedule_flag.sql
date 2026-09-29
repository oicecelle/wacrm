-- ============================================================
-- 070_appointment_reschedule_flag.sql
--
-- Nada no sistema registrava remarcação de forma confiável — nem o
-- arrastar-e-soltar da Agenda, nem editar a data/hora pelo modal. A
-- única tentativa existente (contar notas contendo "reagendado") não
-- é escrita em lugar nenhum. Necessário pro relatório do profissional
-- (quantos atendimentos foram remarcados no período).
--
-- Um booleano, não um contador: pro relatório, um agendamento
-- remarcado 3 vezes ainda é "1 atendimento que foi remarcado", não 3.
--
-- Idempotente.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS was_rescheduled BOOLEAN NOT NULL DEFAULT false;
