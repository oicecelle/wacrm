-- ============================================================
-- 063_stock_fractional_quantities.sql
--
-- As colunas de quantidade do estoque eram INTEGER, mas o resto do
-- sistema (procedure_stock_items.quantity_used, Fechar Compra,
-- Prontuário → Produtos Utilizados) trabalha com quantidades
-- fracionadas — um procedimento que consome 0,5 ml de um produto é
-- um caso normal. Com INTEGER, dar baixa numa fração falhava.
--
-- Passa tudo pra NUMERIC(12,3), o mesmo formato de
-- procedure_stock_items.quantity_used. Conversão sem perda: todo
-- valor inteiro existente continua exatamente igual.
--
-- Idempotente (ALTER TYPE pro mesmo tipo é no-op).
-- ============================================================

ALTER TABLE stock_products ALTER COLUMN current_quantity TYPE NUMERIC(12,3) USING current_quantity::numeric;
ALTER TABLE stock_products ALTER COLUMN min_quantity TYPE NUMERIC(12,3) USING min_quantity::numeric;
ALTER TABLE stock_movements ALTER COLUMN quantity TYPE NUMERIC(12,3) USING quantity::numeric;
ALTER TABLE stock_batches ALTER COLUMN quantity TYPE NUMERIC(12,3) USING quantity::numeric;

CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches(clinic_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON stock_batches(product_id);
