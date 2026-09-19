-- ============================================================
-- 047_quotes_payment_method.sql
--
-- Orçamentos não tinham como registrar a forma de pagamento
-- combinada (pix, cartão, dinheiro, boleto...) — só condição
-- especial em texto livre.
--
-- Idempotente.
-- ============================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_method TEXT;
