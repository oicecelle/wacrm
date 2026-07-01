-- ============================================================
-- 027_leadpluz_packages.sql
-- Pacotes de serviços para o LeadPluz
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- PACKAGES (Pacotes de serviços cadastrados pela clínica)
-- ============================================================
CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  validity_days INTEGER, -- null = sem validade
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_packages_account ON packages(account_id);

ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view packages" ON packages;
DROP POLICY IF EXISTS "Account agents can manage packages" ON packages;

CREATE POLICY "Account members can view packages" ON packages
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Account agents can manage packages" ON packages
  FOR ALL USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON packages;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PACKAGE_ITEMS (Serviços incluídos em cada pacote)
-- ============================================================
CREATE TABLE IF NOT EXISTS package_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL,
  procedure_name TEXT NOT NULL, -- denormalizado para preservar histórico
  sessions INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_items_package ON package_items(package_id);

ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view package items" ON package_items;
DROP POLICY IF EXISTS "Account agents can manage package items" ON package_items;

CREATE POLICY "Account members can view package items" ON package_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM packages p WHERE p.id = package_items.package_id AND is_account_member(p.account_id, 'viewer'))
  );

CREATE POLICY "Account agents can manage package items" ON package_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM packages p WHERE p.id = package_items.package_id AND is_account_member(p.account_id, 'agent'))
  );

-- ============================================================
-- PATIENT_PACKAGES (Pacotes vendidos / vinculados a contatos)
-- ============================================================
CREATE TABLE IF NOT EXISTS patient_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  package_id UUID REFERENCES packages(id) ON DELETE SET NULL,
  package_name TEXT NOT NULL, -- denormalizado
  sessions_total INTEGER NOT NULL DEFAULT 1,
  sessions_used INTEGER NOT NULL DEFAULT 0,
  expires_at DATE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value_paid NUMERIC(12,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_packages_account ON patient_packages(account_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_contact ON patient_packages(contact_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_status ON patient_packages(account_id, status);

ALTER TABLE patient_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view patient packages" ON patient_packages;
DROP POLICY IF EXISTS "Account agents can manage patient packages" ON patient_packages;

CREATE POLICY "Account members can view patient packages" ON patient_packages
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Account agents can manage patient packages" ON patient_packages
  FOR ALL USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON patient_packages;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON patient_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- REALTIME for patient_packages
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'patient_packages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE patient_packages;
  END IF;
END $$;
