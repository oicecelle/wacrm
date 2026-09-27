-- ============================================================
-- 059_appointment_procedure_link.sql
--
-- appointments.type sempre foi texto livre (às vezes bate exato com
-- procedures.name, às vezes é composto — "Botox + Preenchimento" —
-- ou tem detalhe a mais — "Botox — 50u Glabela"). Isso impedia
-- calcular faturamento previsto com confiança, porque não tem como
-- saber o preço de "Botox + Preenchimento" sem adivinhar.
--
-- Adiciona um vínculo de verdade (procedure_id), mantendo o `type`
-- como está — ele continua sendo o texto exibido pro usuário, o
-- procedure_id é só a referência confiável pro preço/duração real.
--
-- Preenche retroativamente (best-effort) os agendamentos onde o
-- texto bate exatamente com o nome de um procedimento já cadastrado
-- na mesma clínica — os casos compostos/com detalhe extra ficam sem
-- vínculo mesmo (não dá pra adivinhar com segurança), o que é
-- esperado e não é um bug.
--
-- Idempotente.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_procedure_id ON appointments(procedure_id);

UPDATE appointments a
SET procedure_id = p.id
FROM procedures p
WHERE a.procedure_id IS NULL
  AND a.clinic_id = p.clinic_id
  AND lower(trim(a.type)) = lower(trim(p.name));
