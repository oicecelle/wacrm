-- ============================================================
-- 060_payment_method_configs.sql
--
-- Formas de pagamento configuráveis por clínica (Pix, Dinheiro,
-- Débito, Crédito à vista, Crédito parcelado em N vezes...), cada
-- uma com sua própria taxa percentual. Antes disso, o formulário de
-- registrar pagamento tinha uma lista fixa (pix/credito/debito/
-- dinheiro/transferencia) sem nenhuma taxa associada.
--
-- financial_transactions ganha duas colunas: qual configuração foi
-- usada (payment_method_config_id) e quanto de taxa foi cobrado
-- NAQUELE momento (fee_amount) — guardado como valor calculado, não
-- só a referência, porque se a clínica mudar a taxa depois, as
-- transações antigas não devem mudar de valor retroativamente.
--
-- Cada clínica nova recebe as 5 formas que já existiam como
-- convenção no sistema, com taxa zero — o padrão de hoje continua
-- funcionando exatamente igual até a clínica decidir configurar
-- taxas de verdade.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_method_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  method_type TEXT NOT NULL DEFAULT 'outro',
  installments INTEGER NOT NULL DEFAULT 1,
  fee_percent NUMERIC(6,3) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_method_configs_clinic ON payment_method_configs(clinic_id);

ALTER TABLE payment_method_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_method_configs_account_access" ON payment_method_configs;
CREATE POLICY "payment_method_configs_account_access" ON payment_method_configs
  FOR ALL
  USING (is_account_member(clinic_id))
  WITH CHECK (is_account_member(clinic_id));

ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS payment_method_config_id UUID REFERENCES payment_method_configs(id) ON DELETE SET NULL;
ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Seed every existing clinic with the 5 methods that were
-- previously hardcoded in the app, at 0% — same behavior as today
-- until someone actually sets a real fee.
INSERT INTO payment_method_configs (clinic_id, name, method_type, installments, fee_percent, sort_order)
SELECT a.id, seed.name, seed.method_type, 1, 0, seed.sort_order
FROM accounts a
CROSS JOIN (VALUES
  ('Pix', 'pix', 0),
  ('Dinheiro', 'dinheiro', 1),
  ('Cartão de Débito', 'debito', 2),
  ('Cartão de Crédito à vista', 'credito', 3),
  ('Transferência', 'transferencia', 4)
) AS seed(name, method_type, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM payment_method_configs pmc WHERE pmc.clinic_id = a.id
);
