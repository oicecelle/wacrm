-- ============================================================
-- 030_leadpluz_procedures_fields.sql
-- Campos adicionais nos procedimentos: cor, categoria, descrição,
-- comissão por profissional (procedure_professionals).
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- PROCEDURES — novos campos
-- ============================================================
ALTER TABLE procedures
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6',  -- cor para exibição na agenda
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- PROCEDURE_PROFESSIONALS — quem realiza qual procedimento
-- e qual é a comissão individual
-- ============================================================
CREATE TABLE IF NOT EXISTS procedure_professionals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  clinic_user_id UUID NOT NULL REFERENCES clinic_users(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (commission_type IN ('percentage', 'fixed', 'none')),
  commission_rate NUMERIC(6,2) DEFAULT 0,   -- percentual (ex: 30.00 = 30%)
  commission_fixed NUMERIC(12,2) DEFAULT 0, -- valor fixo em R$
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(procedure_id, clinic_user_id)
);

CREATE INDEX IF NOT EXISTS idx_proc_professionals_procedure ON procedure_professionals(procedure_id);
CREATE INDEX IF NOT EXISTS idx_proc_professionals_user ON procedure_professionals(clinic_user_id);
CREATE INDEX IF NOT EXISTS idx_proc_professionals_account ON procedure_professionals(account_id);

ALTER TABLE procedure_professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view procedure professionals" ON procedure_professionals;
DROP POLICY IF EXISTS "Account agents can manage procedure professionals" ON procedure_professionals;

CREATE POLICY "Account members can view procedure professionals" ON procedure_professionals
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Account agents can manage procedure professionals" ON procedure_professionals
  FOR ALL USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON procedure_professionals;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON procedure_professionals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
