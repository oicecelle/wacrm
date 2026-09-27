-- ============================================================
-- 061_procedure_room_and_stock_items.sql
--
-- Fecha o item 2 do plano de Serviços/Pagamento/Estoque: sala padrão
-- do procedimento, e quais produtos de estoque ele consome (e em que
-- quantidade) — base pra abater estoque automaticamente quando uma
-- venda desse procedimento for finalizada (item 4/5, ainda não
-- construído).
--
-- Idempotente.
-- ============================================================

ALTER TABLE procedures ADD COLUMN IF NOT EXISTS default_room_id UUID REFERENCES rooms(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS procedure_stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id UUID NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  stock_product_id UUID NOT NULL REFERENCES stock_products(id) ON DELETE CASCADE,
  quantity_used NUMERIC(10,3) NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (procedure_id, stock_product_id)
);

CREATE INDEX IF NOT EXISTS idx_procedure_stock_items_procedure ON procedure_stock_items(procedure_id);

ALTER TABLE procedure_stock_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "procedure_stock_items_account_access" ON procedure_stock_items;
CREATE POLICY "procedure_stock_items_account_access" ON procedure_stock_items
  FOR ALL
  USING (procedure_id IN (SELECT id FROM procedures WHERE is_account_member(clinic_id)))
  WITH CHECK (procedure_id IN (SELECT id FROM procedures WHERE is_account_member(clinic_id)));
