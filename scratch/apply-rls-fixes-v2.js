const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const sqlStatements = `
-- 1. Criar a funcao no schema public
CREATE OR REPLACE FUNCTION public.get_active_clinic_id()
RETURNS uuid AS $$
  SELECT account_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Criar a nova tabela para armazenar o nome original do WhatsApp sem alterar tabelas existentes
CREATE TABLE IF NOT EXISTS public.contact_whatsapp_names (
  contact_id uuid PRIMARY KEY REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS na nova tabela
ALTER TABLE public.contact_whatsapp_names ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_contact_whatsapp_names ON public.contact_whatsapp_names;
CREATE POLICY clinic_isolation_contact_whatsapp_names ON public.contact_whatsapp_names
  FOR ALL TO authenticated USING (
    contact_id IN (SELECT id FROM public.contacts WHERE account_id = public.get_active_clinic_id())
  );

-- 3. Habilitar RLS e criar politicas para tabelas desprotegidas
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_body_measurements ON public.body_measurements;
CREATE POLICY clinic_isolation_body_measurements ON public.body_measurements
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_financial_entries ON public.financial_entries;
CREATE POLICY clinic_isolation_financial_entries ON public.financial_entries
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

ALTER TABLE public.patient_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_patient_records ON public.patient_records;
CREATE POLICY clinic_isolation_patient_records ON public.patient_records
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

ALTER TABLE public.whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;

-- 4. Corrigir a politica quebrada da tabela de pacientes
DROP POLICY IF EXISTS clinic_isolation_patients ON public.patients;
CREATE POLICY clinic_isolation_patients ON public.patients
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- 5. Ajustar isolamento das tabelas operacionais para a clinica ativa estrita
DROP POLICY IF EXISTS clinic_isolation_appointments ON public.appointments;
CREATE POLICY clinic_isolation_appointments ON public.appointments
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

DROP POLICY IF EXISTS clinic_isolation_whatsapp_chats ON public.whatsapp_chats;
CREATE POLICY clinic_isolation_whatsapp_chats ON public.whatsapp_chats
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

DROP POLICY IF EXISTS clinic_isolation_whatsapp_messages ON public.whatsapp_messages;
CREATE POLICY clinic_isolation_whatsapp_messages ON public.whatsapp_messages
  FOR ALL TO authenticated USING (chat_id IN (
    SELECT id FROM public.whatsapp_chats WHERE clinic_id = public.get_active_clinic_id()
  ));

DROP POLICY IF EXISTS clinic_isolation_documents ON public.documents;
CREATE POLICY clinic_isolation_documents ON public.documents
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

DROP POLICY IF EXISTS clinic_isolation_transactions ON public.transactions;
CREATE POLICY clinic_isolation_transactions ON public.transactions
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- 6. Recriar politicas das tabelas que usavam a funcao antiga do schema auth
-- financial_transactions
DROP POLICY IF EXISTS select_transactions_policy ON public.financial_transactions;
DROP POLICY IF EXISTS insert_transactions_policy ON public.financial_transactions;
DROP POLICY IF EXISTS update_transactions_policy ON public.financial_transactions;

CREATE POLICY select_transactions_policy ON public.financial_transactions
  FOR SELECT TO authenticated USING (clinic_id = public.get_active_clinic_id());
CREATE POLICY insert_transactions_policy ON public.financial_transactions
  FOR INSERT TO authenticated WITH CHECK (clinic_id = public.get_active_clinic_id());
CREATE POLICY update_transactions_policy ON public.financial_transactions
  FOR UPDATE TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- body_evaluations
DROP POLICY IF EXISTS body_evaluations_policy ON public.body_evaluations;
CREATE POLICY body_evaluations_policy ON public.body_evaluations
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- clinical_evolutions
DROP POLICY IF EXISTS clinical_evolutions_policy ON public.clinical_evolutions;
CREATE POLICY clinical_evolutions_policy ON public.clinical_evolutions
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- invoices
DROP POLICY IF EXISTS invoices_policy ON public.invoices;
CREATE POLICY invoices_policy ON public.invoices
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- notifications
DROP POLICY IF EXISTS notifications_policy ON public.notifications;
CREATE POLICY notifications_policy ON public.notifications
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- triage_workflows
DROP POLICY IF EXISTS triage_workflows_policy ON public.triage_workflows;
CREATE POLICY triage_workflows_policy ON public.triage_workflows
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- role_permissions
DROP POLICY IF EXISTS role_permissions_policy ON public.role_permissions;
CREATE POLICY role_permissions_policy ON public.role_permissions
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- security_anomalies
DROP POLICY IF EXISTS security_anomalies_policy ON public.security_anomalies;
CREATE POLICY security_anomalies_policy ON public.security_anomalies
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- subscriptions
DROP POLICY IF EXISTS subscriptions_policy ON public.subscriptions;
CREATE POLICY subscriptions_policy ON public.subscriptions
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());

-- system_alerts
DROP POLICY IF EXISTS system_alerts_policy ON public.system_alerts;
CREATE POLICY system_alerts_policy ON public.system_alerts
  FOR ALL TO authenticated USING (clinic_id = public.get_active_clinic_id());
`;

async function run() {
  await client.connect();
  console.log("=== APPLYING DATABASE RLS FIXES V2 ===");
  await client.query(sqlStatements);
  console.log("Database RLS fixes applied successfully!");
  await client.end();
}

run().catch(console.error);
