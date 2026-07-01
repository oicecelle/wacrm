-- ============================================================
-- 029_leadpluz_crm_and_contacts.sql
-- Campos de CRM/IA nos deals, tipo de contato (lead/cliente),
-- campo invite_status nos clinic_users, e tabela de timeline
-- de contatos (contact_timeline).
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- CONTACTS — adicionar campo contact_type (lead | client)
-- ============================================================
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS contact_type TEXT NOT NULL DEFAULT 'lead'
    CHECK (contact_type IN ('lead', 'client')),
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS birthday DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  ADD COLUMN IF NOT EXISTS tags_visual TEXT[] DEFAULT '{}'; -- etiquetas rápidas visíveis na listagem

CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(account_id, contact_type);

-- ============================================================
-- DEALS — campos de CRM inteligente atualizados pela IA
-- ============================================================
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS interest TEXT,                    -- principal interesse do lead
  ADD COLUMN IF NOT EXISTS crm_stage TEXT,                   -- estágio no processo (não confundir com pipeline_stage)
  ADD COLUMN IF NOT EXISTS temperature TEXT DEFAULT 'warm'
    CHECK (temperature IN ('hot', 'warm', 'cold')),          -- temperatura do lead
  ADD COLUMN IF NOT EXISTS main_objection TEXT,             -- principal objeção identificada pela IA
  ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50
    CHECK (score BETWEEN 0 AND 100),                         -- score de engajamento (0-100)
  ADD COLUMN IF NOT EXISTS waiting_since TIMESTAMPTZ,       -- desde quando aguarda resposta
  ADD COLUMN IF NOT EXISTS waiting_side TEXT DEFAULT 'lead'
    CHECK (waiting_side IN ('us', 'lead')),                   -- quem está aguardando: 'us' = nossa equipe, 'lead' = lead
  ADD COLUMN IF NOT EXISTS next_action TEXT,                -- próxima ação recomendada pela IA
  ADD COLUMN IF NOT EXISTS last_message_summary TEXT,       -- resumo da última mensagem relevante (IA)
  ADD COLUMN IF NOT EXISTS source TEXT,                     -- origem do lead (Instagram, Google, Indicação, etc.)
  ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_temperature ON deals(account_id, temperature);
CREATE INDEX IF NOT EXISTS idx_deals_waiting ON deals(account_id, waiting_side, waiting_since);

-- ============================================================
-- CLINIC_USERS — invite_status e permissões granulares
-- ============================================================
-- invite_status: track do convite enviado por email
ALTER TABLE clinic_users
  ADD COLUMN IF NOT EXISTS invite_status TEXT DEFAULT 'active'
    CHECK (invite_status IN ('pending', 'active', 'disabled')),
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_email TEXT,
  ADD COLUMN IF NOT EXISTS permissions_json JSONB DEFAULT '{}'::jsonb;

-- Exemplo de permissions_json:
-- {
--   "view_crm": true,
--   "edit_crm": false,
--   "view_agenda": true,
--   "edit_agenda": true,
--   "view_financeiro": false,
--   "edit_financeiro": false,
--   "view_documentos": true,
--   "generate_documentos": false,
--   "view_relatorios": false,
--   "configurar_marketing": false,
--   "gerenciar_equipe": false,
--   "acessar_configuracoes": false
-- }

-- ============================================================
-- CONTACT_TIMELINE — linha do tempo dos contatos
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'message', 'appointment', 'appointment_cancelled',
                             -- 'appointment_rescheduled', 'document_sent', 'document_signed',
                             -- 'payment', 'quote_sent', 'quote_accepted', 'status_change',
                             -- 'note', 'deal_stage_change', 'follow_up'
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,  -- dados extras (ex: appointment_id, document_id, value)
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_timeline_contact ON contact_timeline(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_timeline_account ON contact_timeline(account_id, created_at DESC);

ALTER TABLE contact_timeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Account members can view timeline" ON contact_timeline;
DROP POLICY IF EXISTS "Account agents can insert timeline" ON contact_timeline;

CREATE POLICY "Account members can view timeline" ON contact_timeline
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

CREATE POLICY "Account agents can insert timeline" ON contact_timeline
  FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));

CREATE POLICY "Account agents can delete own timeline entries" ON contact_timeline
  FOR DELETE USING (
    is_account_member(account_id, 'agent') AND
    created_by_user_id = auth.uid()
  );

-- REALTIME for contact_timeline
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'contact_timeline'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE contact_timeline;
  END IF;
END $$;
