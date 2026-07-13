const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const sqlStatements = `
-- 1. Redefine a funcao de clinica ativa para ler diretamente de public.profiles
CREATE OR REPLACE FUNCTION auth.get_active_clinic_id()
RETURNS uuid AS $$
  SELECT account_id FROM public.profiles WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 2. Habilitar RLS e criar politicas para tabelas desprotegidas
ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_body_measurements ON public.body_measurements;
CREATE POLICY clinic_isolation_body_measurements ON public.body_measurements
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_financial_entries ON public.financial_entries;
CREATE POLICY clinic_isolation_financial_entries ON public.financial_entries
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

ALTER TABLE public.patient_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_isolation_patient_records ON public.patient_records;
CREATE POLICY clinic_isolation_patient_records ON public.patient_records
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

ALTER TABLE public.whatsapp_webhook_logs ENABLE ROW LEVEL SECURITY;

-- 3. Corrigir a politica quebrada da tabela de pacientes
DROP POLICY IF EXISTS clinic_isolation_patients ON public.patients;
CREATE POLICY clinic_isolation_patients ON public.patients
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

-- 4. Ajustar isolamento das tabelas operacionais para clinica ativa estrita
DROP POLICY IF EXISTS clinic_isolation_appointments ON public.appointments;
CREATE POLICY clinic_isolation_appointments ON public.appointments
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

DROP POLICY IF EXISTS clinic_isolation_whatsapp_chats ON public.whatsapp_chats;
CREATE POLICY clinic_isolation_whatsapp_chats ON public.whatsapp_chats
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

DROP POLICY IF EXISTS clinic_isolation_whatsapp_messages ON public.whatsapp_messages;
CREATE POLICY clinic_isolation_whatsapp_messages ON public.whatsapp_messages
  FOR ALL TO authenticated USING (chat_id IN (
    SELECT id FROM public.whatsapp_chats WHERE clinic_id = auth.get_active_clinic_id()
  ));

DROP POLICY IF EXISTS clinic_isolation_documents ON public.documents;
CREATE POLICY clinic_isolation_documents ON public.documents
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());

DROP POLICY IF EXISTS clinic_isolation_transactions ON public.transactions;
CREATE POLICY clinic_isolation_transactions ON public.transactions
  FOR ALL TO authenticated USING (clinic_id = auth.get_active_clinic_id());
`;

async function run() {
  await client.connect();
  console.log("=== APPLYING DATABASE RLS FIXES ===");
  await client.query(sqlStatements);
  console.log("Database RLS fixes applied successfully!");
  await client.end();
}

run().catch(console.error);
