-- ============================================================
-- 034_ticto_financial_tables.sql
--
-- Tabelas para integracao Ticto e modulo financeiro.
-- Idempotent - segura para rodar multiplas vezes.
-- ============================================================

-- 1. FINANCIAL TRANSACTIONS
CREATE TABLE IF NOT EXISTS financial_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  method TEXT CHECK (method IN (''pix'', ''credito'', ''debito'', ''dinheiro'', ''transferencia'', ''boleto'', ''outro'')),
  type TEXT NOT NULL CHECK (type IN (''receita'', ''despesa'')),
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT ''pending'' CHECK (status IN (''pending'', ''paid'', ''overdue'', ''cancelled'')),
  installments_total INTEGER DEFAULT 1,
  installments_paid INTEGER DEFAULT 0,
  source TEXT DEFAULT ''manual'',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financial_clinic ON financial_transactions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_financial_patient ON financial_transactions(patient_id);
CREATE INDEX IF NOT EXISTS idx_financial_date ON financial_transactions(date);
CREATE INDEX IF NOT EXISTS idx_financial_status ON financial_transactions(status);

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_transactions_select ON financial_transactions;
CREATE POLICY financial_transactions_select ON financial_transactions
  FOR SELECT USING (is_account_member(clinic_id));

DROP POLICY IF EXISTS financial_transactions_insert ON financial_transactions;
CREATE POLICY financial_transactions_insert ON financial_transactions
  FOR INSERT WITH CHECK (is_account_member(clinic_id, ''agent''));

DROP POLICY IF EXISTS financial_transactions_update ON financial_transactions;
CREATE POLICY financial_transactions_update ON financial_transactions
  FOR UPDATE USING (is_account_member(clinic_id, ''agent''));

DROP TRIGGER IF EXISTS set_updated_at ON financial_transactions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON financial_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 2. TICTO WEBHOOK LOGS
CREATE TABLE IF NOT EXISTS ticto_webhook_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  event_status TEXT,
  order_hash TEXT,
  transaction_hash TEXT,
  payload JSONB,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_ticto_logs_clinic ON ticto_webhook_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_ticto_logs_order_hash ON ticto_webhook_logs(order_hash);
CREATE INDEX IF NOT EXISTS idx_ticto_logs_status ON ticto_webhook_logs(event_status);

-- Allow service role to insert (webhook runs with service key, no RLS)
ALTER TABLE ticto_webhook_logs DISABLE ROW LEVEL SECURITY;

-- 3. TICTO STATUS ACTIONS (configuracao de automacoes por status de pagamento)
CREATE TABLE IF NOT EXISTS ticto_status_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  ticto_status TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (''move_stage'', ''send_message'', ''create_task'', ''none'')),
  config JSONB NOT NULL DEFAULT ''{}''::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticto_actions_clinic ON ticto_status_actions(clinic_id);

ALTER TABLE ticto_status_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticto_actions_select ON ticto_status_actions;
CREATE POLICY ticto_actions_select ON ticto_status_actions
  FOR SELECT USING (is_account_member(clinic_id));

DROP POLICY IF EXISTS ticto_actions_manage ON ticto_status_actions;
CREATE POLICY ticto_actions_manage ON ticto_status_actions
  FOR ALL USING (is_account_member(clinic_id, ''admin''));

-- 4. APPOINTMENTS - adicionar coluna color se nao existir
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS color TEXT;

-- 5. PATIENT PACKAGES (se nao existir da migration anterior)
CREATE TABLE IF NOT EXISTS patient_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  package_name TEXT NOT NULL,
  sessions_total INTEGER NOT NULL DEFAULT 0,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  value_paid NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''expired'', ''cancelled'', ''completed'')),
  expires_at DATE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_packages_contact ON patient_packages(contact_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_account ON patient_packages(account_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_status ON patient_packages(status);

ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_packages_select ON patient_packages;
CREATE POLICY patient_packages_select ON patient_packages
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS patient_packages_manage ON patient_packages;
CREATE POLICY patient_packages_manage ON patient_packages
  FOR ALL USING (is_account_member(account_id, ''agent''));
