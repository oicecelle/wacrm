-- ============================================================
-- 064_appointment_guests.sql
--
-- Convidados por e-mail em agendamentos (viram participantes do
-- evento no Google Agenda e recebem o convite). O link do Google
-- Meet de atendimentos online usa as colunas que já existiam e
-- nenhuma tela usava: is_teleconsult e teleconsult_link.
--
-- Idempotente.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS guest_emails TEXT[] NOT NULL DEFAULT '{}';
