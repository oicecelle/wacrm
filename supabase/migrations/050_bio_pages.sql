-- ============================================================
-- 050_bio_pages.sql
--
-- "Link na bio" personalizável — a vitrine pública da clínica em
-- leadpluz.com/{slug}. blocks guarda a lista ordenada de itens da
-- página (cards, banners, carrossel, depoimentos, link externo)
-- como JSONB, cada um com seu próprio tipo e configuração — assim a
-- página inteira é montada e reordenada sem precisar de coluna nova
-- a cada tipo de bloco novo que a clínica queira usar.
--
-- bio_forms guarda os formulários que um card pode abrir (nome,
-- interesse, queixas, unidade...), com o texto-modelo da mensagem que
-- vai pro WhatsApp já preenchido com as respostas.
--
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS bio_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT,
  subtitle TEXT,
  avatar_url TEXT,
  theme_color TEXT DEFAULT '#2563eb',
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bio_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Each field: { id, label, type: 'text'|'dropdown'|'textarea', options?: string[], required?: boolean }
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- e.g. "Olá! Meu nome é {{nome}}, tenho interesse em {{interesse}}..."
  whatsapp_message_template TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Testimonials collected straight from a WhatsApp reply (or entered
-- manually by the clinic), shown in the bio page's auto-scrolling
-- testimonials block.
CREATE TABLE IF NOT EXISTS bio_testimonials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  is_approved BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE bio_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE bio_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE bio_testimonials ENABLE ROW LEVEL SECURITY;

-- Public read for the published page itself and its approved
-- testimonials — same reasoning as portal_settings: visitors clicking
-- a clinic's bio link have no Supabase session at all.
DROP POLICY IF EXISTS "bio_pages_public_read" ON bio_pages;
CREATE POLICY "bio_pages_public_read" ON bio_pages
  FOR SELECT
  USING (is_published = true);

DROP POLICY IF EXISTS "bio_pages_account_write" ON bio_pages;
CREATE POLICY "bio_pages_account_write" ON bio_pages
  FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

DROP POLICY IF EXISTS "bio_forms_public_read" ON bio_forms;
CREATE POLICY "bio_forms_public_read" ON bio_forms
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "bio_forms_account_write" ON bio_forms;
CREATE POLICY "bio_forms_account_write" ON bio_forms
  FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));

DROP POLICY IF EXISTS "bio_testimonials_public_read" ON bio_testimonials;
CREATE POLICY "bio_testimonials_public_read" ON bio_testimonials
  FOR SELECT
  USING (is_approved = true);

DROP POLICY IF EXISTS "bio_testimonials_account_write" ON bio_testimonials;
CREATE POLICY "bio_testimonials_account_write" ON bio_testimonials
  FOR ALL
  USING (is_account_member(account_id))
  WITH CHECK (is_account_member(account_id));
