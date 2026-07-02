-- ============================================================
-- 033_portal_settings.sql
--
-- Tabela para armazenar as configurações e dados de personalização
-- do Portal do Paciente por clínica (account_id), e os códigos OTP.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE UNIQUE,
  enabled_scheduling BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_cancellation BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_rescheduling BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_title TEXT NOT NULL DEFAULT 'Bem-vindo ao nosso Portal',
  welcome_subtitle TEXT NOT NULL DEFAULT 'Aqui você pode gerenciar suas consultas, financeiro e assinar documentos.',
  logo_url TEXT,
  banners_carousel JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de objetos: { image_url, link, active }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de OTPs temporários para autenticação de pacientes
CREATE TABLE IF NOT EXISTS public.portal_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_portal_settings_account ON public.portal_settings(account_id);
CREATE INDEX IF NOT EXISTS idx_portal_otps_phone_clinic ON public.portal_otps(phone, clinic_id);

-- Habilitar RLS
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_otps ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso para portal_settings
-- 1. Qualquer visitante (inclusive não logado) pode ler as configurações visuais do portal (para carregar o logo e banners)
DROP POLICY IF EXISTS "Public can view portal settings" ON public.portal_settings;
CREATE POLICY "Public can view portal settings" ON public.portal_settings
  FOR SELECT USING (true);

-- 2. Apenas membros da equipe com privilégios de Admin/Owner podem gerenciar/editar essas configurações
DROP POLICY IF EXISTS "Account admins can manage portal settings" ON public.portal_settings;
CREATE POLICY "Account admins can manage portal settings" ON public.portal_settings
  FOR ALL USING (is_account_member(account_id, 'admin'));

-- Políticas de acesso para portal_otps (apenas acessível pelo serviço do sistema/admin)
DROP POLICY IF EXISTS "Admin full access on portal otps" ON public.portal_otps;
CREATE POLICY "Admin full access on portal otps" ON public.portal_otps
  FOR ALL USING (true); -- Permitido pois é gerenciado pelas API routes que usam service role/bypass RLS

-- Trigger para atualizar a coluna updated_at em portal_settings
DROP TRIGGER IF EXISTS set_updated_at ON public.portal_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.portal_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
