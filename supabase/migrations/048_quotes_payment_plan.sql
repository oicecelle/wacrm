-- ============================================================
-- 048_quotes_payment_plan.sql
--
-- payment_method (migração 047) só guardava uma forma única — não dá
-- pra representar "sinal de R$200 no Pix + restante em 3x no cartão".
-- Nova coluna guarda uma lista de linhas de pagamento (JSONB), cada
-- uma com rótulo (ex: "Sinal", "1ª parcela"), forma e valor opcional
-- — várias linhas juntas descrevem entrada/sinal/parcelamento/mescla
-- de formas na mesma condição. payment_method continua existindo
-- pros casos simples de forma única.
--
-- Idempotente.
-- ============================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan JSONB DEFAULT '[]'::jsonb;
