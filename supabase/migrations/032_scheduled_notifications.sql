-- ============================================================
-- 032_scheduled_notifications.sql
--
-- Tabela para armazenar o agendamento futuro de mensagens do sistema
-- (aniversários, lembretes de agendamento, etc.), permitindo que 
-- sejam visualizadas, editadas ou canceladas.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  template_id UUID REFERENCES public.system_message_templates(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
  message_text TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_account ON public.scheduled_notifications(account_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_status ON public.scheduled_notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_appt ON public.scheduled_notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_patient ON public.scheduled_notifications(patient_id);

-- Habilitar RLS
ALTER TABLE public.scheduled_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
DROP POLICY IF EXISTS "Account members can view scheduled notifications" ON public.scheduled_notifications;
CREATE POLICY "Account members can view scheduled notifications" ON public.scheduled_notifications
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Account agents can manage scheduled notifications" ON public.scheduled_notifications;
CREATE POLICY "Account agents can manage scheduled notifications" ON public.scheduled_notifications
  FOR ALL USING (is_account_member(account_id, 'agent'));

-- Trigger para atualizar a coluna updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.scheduled_notifications;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.scheduled_notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
