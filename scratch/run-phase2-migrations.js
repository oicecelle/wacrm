const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const sql = `
-- 1. Table for procedure commissions per professional
CREATE TABLE IF NOT EXISTS public.procedure_commissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE CASCADE,
  clinic_user_id uuid REFERENCES public.clinic_users(id) ON DELETE CASCADE,
  commission_type text CHECK (commission_type IN ('percentage', 'fixed')) NOT NULL,
  commission_value numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(procedure_id, clinic_user_id)
);

-- Enable RLS on procedure_commissions
ALTER TABLE public.procedure_commissions ENABLE ROW LEVEL SECURITY;

-- 2. Table for appointment reminders configuration
CREATE TABLE IF NOT EXISTS public.appointment_reminders_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE UNIQUE,
  is_active boolean DEFAULT true,
  hours_before integer[] DEFAULT '{24, 2}',
  message_template text DEFAULT 'Olá {{nome}}! Lembramos que você tem uma consulta agendada para {{data}} às {{hora}}. Confirme respondendo "Confirmar" ou cancele respondendo "Cancelar".',
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on appointment_reminders_config
ALTER TABLE public.appointment_reminders_config ENABLE ROW LEVEL SECURITY;

-- 3. Columns for client science in patient records
ALTER TABLE public.patient_records 
  ADD COLUMN IF NOT EXISTS patient_acknowledged boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS ciente_sent_at timestamptz;

-- 4. Table for Ticto Webhook Logs
CREATE TABLE IF NOT EXISTS public.ticto_webhook_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  event_status text NOT NULL,
  order_hash text NOT NULL,
  transaction_hash text,
  payload jsonb NOT NULL,
  processed_at timestamptz,
  error text,
  received_at timestamptz DEFAULT now()
);

-- Idempotency constraint index
CREATE UNIQUE INDEX IF NOT EXISTS ticto_idempotency_idx ON public.ticto_webhook_logs(order_hash, event_status);

-- Enable RLS on ticto_webhook_logs
ALTER TABLE public.ticto_webhook_logs ENABLE ROW LEVEL SECURITY;

-- 5. Table for Ticto Status Mappings
CREATE TABLE IF NOT EXISTS public.ticto_status_actions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  ticto_status text NOT NULL,
  action text NOT NULL, -- 'mark_paid', 'mark_refused', 'mark_cancelled', 'create_lead', 'send_whatsapp', 'move_stage'
  config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on ticto_status_actions
ALTER TABLE public.ticto_status_actions ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for clinics isolation for procedure_commissions
DROP POLICY IF EXISTS procedure_commissions_all ON public.procedure_commissions;
CREATE POLICY procedure_commissions_all ON public.procedure_commissions
  FOR ALL TO authenticated
  USING (
    procedure_id IN (SELECT id FROM public.procedures WHERE clinic_id = (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid() LIMIT 1))
  );

-- Add RLS policies for reminders configuration
DROP POLICY IF EXISTS reminders_config_all ON public.appointment_reminders_config;
CREATE POLICY reminders_config_all ON public.appointment_reminders_config
  FOR ALL TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid() LIMIT 1)
  );

-- Add RLS policies for Ticto webhooks logs
DROP POLICY IF EXISTS ticto_logs_all ON public.ticto_webhook_logs;
CREATE POLICY ticto_logs_all ON public.ticto_webhook_logs
  FOR ALL TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid() LIMIT 1)
  );

-- Add RLS policies for Ticto status actions
DROP POLICY IF EXISTS ticto_actions_all ON public.ticto_status_actions;
CREATE POLICY ticto_actions_all ON public.ticto_status_actions
  FOR ALL TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM public.clinic_users WHERE user_id = auth.uid() LIMIT 1)
  );
`;

async function run() {
  await client.connect();
  console.log("Connecting to Supabase...");
  await client.query(sql);
  console.log("Migrations applied successfully!");
  await client.end();
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
