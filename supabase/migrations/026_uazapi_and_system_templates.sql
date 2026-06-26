-- ============================================================
-- 026_uazapi_and_system_templates.sql
--
-- Idempotent migration to support Uazapi integration and
-- customizable system message templates (birthdays, appointment reminders).
-- ============================================================

-- 1. Alter whatsapp_config to support Uazapi settings and timezone override
ALTER TABLE whatsapp_config
  ALTER COLUMN phone_number_id DROP NOT NULL,
  ALTER COLUMN access_token DROP NOT NULL;

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'meta' CHECK (provider_type IN ('meta', 'uazapi')),
  ADD COLUMN IF NOT EXISTS uazapi_token TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_instance_name TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_base_url TEXT DEFAULT 'https://customix.uazapi.com',
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';

-- 2. Create system_message_templates table
CREATE TABLE IF NOT EXISTS system_message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'aniversario', 
    'boas_vindas', 
    'lembrete_retorno', 
    'lembrete_agendamento', 
    'agendamento_criado', 
    'agendamento_alterado', 
    'confirmacao_agendamento', 
    'agendamento_confirmado', 
    'agendamento_cancelado', 
    'pre_atendimento', 
    'orcamento', 
    'lembrete_fatura', 
    'pos_procedimento'
  )),
  provider_type TEXT NOT NULL CHECK (provider_type IN ('meta', 'uazapi')),
  name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_template_name TEXT,
  meta_template_language TEXT DEFAULT 'pt_BR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexing for lookup performance
CREATE INDEX IF NOT EXISTS idx_sys_templates_account ON system_message_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_sys_templates_event ON system_message_templates(event_type) WHERE is_active = TRUE;

-- Enable RLS and create security policies matching the account sharing layout
ALTER TABLE system_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_message_templates_select ON system_message_templates;
CREATE POLICY system_message_templates_select ON system_message_templates 
  FOR SELECT USING (is_account_member(account_id));

DROP POLICY IF EXISTS system_message_templates_insert ON system_message_templates;
CREATE POLICY system_message_templates_insert ON system_message_templates 
  FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS system_message_templates_update ON system_message_templates;
CREATE POLICY system_message_templates_update ON system_message_templates 
  FOR UPDATE USING (is_account_member(account_id, 'admin')) WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS system_message_templates_delete ON system_message_templates;
CREATE POLICY system_message_templates_delete ON system_message_templates 
  FOR DELETE USING (is_account_member(account_id, 'admin'));

-- Trigger to automatically update updated_at column
DROP TRIGGER IF EXISTS set_updated_at ON system_message_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON system_message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
