-- Migração para adicionar a tabela de tokens do Google Calendar e a coluna de id do evento no Google
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT unique_account_user UNIQUE (account_id, user_id)
);

-- Habilitar RLS
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- Política de acesso
DROP POLICY IF EXISTS "Membros podem ver e gerenciar seus tokens do Google" ON public.google_calendar_tokens;
CREATE POLICY "Membros podem ver e gerenciar seus tokens do Google" 
ON public.google_calendar_tokens 
FOR ALL 
USING (account_id = (auth.jwt() ->> 'account_id')::uuid);

-- Adicionar coluna na tabela de compromissos
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
