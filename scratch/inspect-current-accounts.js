const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://scrhexfcbtdyubehbzml.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk';

const db = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('=== INSPECTING CLINICS AND ACCOUNTS ===');
  
  // Fetch all clinics/accounts
  const { data: clinics } = await db.from('clinics').select('*');
  console.log('Clinics:', clinics);

  // Fetch profiles
  const { data: profiles } = await db.from('profiles').select('id, email, full_name, active_clinic_id');
  console.log('Profiles:', profiles);

  // Fetch clinic users
  const { data: clinicUsers } = await db.from('clinic_users').select('id, clinic_id, user_id, name, email');
  console.log('Clinic Users:', clinicUsers);
}

run();
