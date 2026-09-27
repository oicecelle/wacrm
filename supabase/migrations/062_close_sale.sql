-- ============================================================
-- 062_close_sale.sql
--
-- Item 4 do plano: "Fechar Compra" — o elo entre Agenda, Financeiro,
-- Serviços e Estoque. Quando um atendimento termina, alguém escolhe
-- a forma de pagamento, pode adicionar procedimentos/produtos que
-- não estavam no agendamento original, e o sistema:
--   1. calcula o valor final (soma dos itens, já com a taxa da
--      forma de pagamento escolhida)
--   2. cria a transação financeira (usa payment_method_configs,
--      migração 060)
--   3. abate do estoque os produtos consumidos por cada procedimento
--      vendido (usa procedure_stock_items, migração 061), e também
--      qualquer produto avulso adicionado na venda
--   4. registra a comissão de cada profissional (usa
--      procedure_commissions, já existente) como um valor REAL a
--      pagar, não mais a estimativa fixa de 15% do relatório
--
-- sales = a "nota" da venda. sale_items = cada linha (procedimento
-- ou produto). commission_records = quanto cada profissional tem a
-- receber por aquela venda específica.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES patients(id) ON DELETE SET NULL,
  payment_method_config_id UUID REFERENCES payment_method_configs(id) ON DELETE SET NULL,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  financial_transaction_id UUID REFERENCES financial_transactions(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_clinic ON sales(clinic_id);
CREATE INDEX IF NOT EXISTS idx_sales_appointment ON sales(appointment_id);
CREATE INDEX IF NOT EXISTS idx_sales_patient ON sales(patient_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL,
  procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL,
  stock_product_id UUID REFERENCES stock_products(id) ON DELETE SET NULL,
  professional_id UUID,
  description TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS commission_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id UUID REFERENCES sale_items(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL,
  procedure_id UUID REFERENCES procedures(id) ON DELETE SET NULL,
  commission_type TEXT NOT NULL,
  commission_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_records_clinic ON commission_records(clinic_id);
CREATE INDEX IF NOT EXISTS idx_commission_records_professional ON commission_records(professional_id);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_account_access" ON sales;
CREATE POLICY "sales_account_access" ON sales
  FOR ALL USING (is_account_member(clinic_id)) WITH CHECK (is_account_member(clinic_id));

DROP POLICY IF EXISTS "sale_items_account_access" ON sale_items;
CREATE POLICY "sale_items_account_access" ON sale_items
  FOR ALL
  USING (sale_id IN (SELECT id FROM sales WHERE is_account_member(clinic_id)))
  WITH CHECK (sale_id IN (SELECT id FROM sales WHERE is_account_member(clinic_id)));

DROP POLICY IF EXISTS "commission_records_account_access" ON commission_records;
CREATE POLICY "commission_records_account_access" ON commission_records
  FOR ALL USING (is_account_member(clinic_id)) WITH CHECK (is_account_member(clinic_id));
