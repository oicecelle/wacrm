-- ============================================================
-- 072_deal_crm_status_link.sql
--
-- Liga crm_status (fila de atendimento configurável por clínica —
-- Novo, Em atendimento, Sinal pago, Agendado, Sem interesse, Perdido
-- — já usada por 59 das 60 clínicas) a deals de verdade. Até aqui
-- ela existia sem nenhuma referência de deals pra ela.
--
-- Deliberadamente separado de deals.status (aberto/ganho/perdido,
-- um estado de ciclo de vida simples) e de deals.crm_stage (texto
-- livre/etapa do funil de vendas) — os três convivem, cada um com
-- seu papel: status = ciclo de vida, crm_status_id = fila de
-- atendimento do dia a dia, crm_stage = etapa do funil de vendas.
--
-- Idempotente.
-- ============================================================

ALTER TABLE deals ADD COLUMN IF NOT EXISTS crm_status_id UUID REFERENCES crm_status(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_crm_status_id ON deals(crm_status_id);
