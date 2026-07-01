-- ============================================================
-- 028_leadpluz_quotes.sql
-- Orçamentos para o LeadPluz
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- QUOTES (Orçamentos enviados a contatos)
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'refused', 'expired')),
  total_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_type TEXT DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
  special_condition TEXT,   -- ex: "parcelado em 3x", "válido por 7 dias"
  message_text TEXT,        -- mensagem gerada para envio pelo WhatsApp
  template_id UUID,         -- referência ao quote_templates (futuro)
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  expires_at DATE,
  notes TEXT,               -- notas internas
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quotes_account ON quotes(account_id);
CREATE INDEX IF NOT EXISTS idx_quotes_contact ON quotes(contact_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(account_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(account_id, created_at DESC);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view quotes" ON quotes;
DROP POLICY IF EXISTS "Account agents can manage quotes" ON quotes;

CREATE POLICY "Account members can view quotes" ON quotes
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Account agents can manage quotes" ON quotes
  FOR ALL USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON quotes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- QUOTE_ITEMS (Itens do orçamento — serviços ou pacotes)
-- ============================================================
CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('procedure', 'package')),
  item_id UUID,             -- null se foi digitado manualmente
  name TEXT NOT NULL,       -- nome do serviço/pacote (denormalizado)
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sessions INTEGER,         -- para pacotes: total de sessões
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);

ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account agents can manage quote items" ON quote_items;

CREATE POLICY "Account agents can manage quote items" ON quote_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM quotes q WHERE q.id = quote_items.quote_id AND is_account_member(q.account_id, 'agent'))
  );

-- ============================================================
-- QUOTE_TEMPLATES (Modelos de texto para orçamentos)
-- ============================================================
CREATE TABLE IF NOT EXISTS quote_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body_template TEXT NOT NULL, -- suporta variáveis: {{nome}}, {{procedimento}}, {{valor}}, {{condicao}}
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_templates_account ON quote_templates(account_id);

ALTER TABLE quote_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view quote templates" ON quote_templates;
DROP POLICY IF EXISTS "Account agents can manage quote templates" ON quote_templates;

CREATE POLICY "Account members can view quote templates" ON quote_templates
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Account agents can manage quote templates" ON quote_templates
  FOR ALL USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON quote_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON quote_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: template padrão em português para clínicas estéticas
-- (a policy ainda não existe para a conta; este INSERT precisa ser
--  feito via service_role no onboarding do tenant)
-- INSERT INTO quote_templates (account_id, name, body_template, is_default)
-- VALUES (...);

-- ============================================================
-- REALTIME for quotes
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quotes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quotes;
  END IF;
END $$;
