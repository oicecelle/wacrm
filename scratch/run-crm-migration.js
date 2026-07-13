// Run migration: add new CRM fields to deals table
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://scrhexfcbtdyubehbzml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk'
);

async function run() {
  console.log('=== RUNNING CRM MIGRATION ===\n');

  const statements = [
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS followup_scheduled_at timestamptz`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS followup_type text`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS followup_message text`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS future_task_date timestamptz`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS future_task_note text`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS alert_scheduled_at timestamptz`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS alert_note text`,
    `ALTER TABLE deals ADD COLUMN IF NOT EXISTS objections text[] DEFAULT '{}'`,
  ];

  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { query: sql }).single().catch(() => ({ error: null }));
    // Try direct execution via REST
    try {
      const res = await fetch('https://scrhexfcbtdyubehbzml.supabase.co/rest/v1/rpc/exec_sql', {
        method: 'POST',
        headers: {
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk',
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      const text = await res.text();
      if (res.ok) {
        console.log(`✅ ${sql.substring(0, 60)}...`);
      } else {
        console.log(`ℹ️  ${sql.substring(0, 60)}... → ${text.substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`⚠️  ${sql.substring(0, 60)}... → ${e.message}`);
    }
  }

  // Check current columns
  console.log('\n=== CHECKING CURRENT DEALS COLUMNS ===');
  const { data, error } = await supabase
    .from('deals')
    .select('followup_scheduled_at, followup_type, followup_message, future_task_date, future_task_note, alert_scheduled_at, alert_note, objections')
    .limit(1);

  if (error) {
    console.log('❌ Columns not yet present:', error.message);
    console.log('\nNeed to run SQL manually in Supabase Dashboard:');
    console.log(`
ALTER TABLE deals ADD COLUMN IF NOT EXISTS followup_scheduled_at timestamptz;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS followup_type text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS followup_message text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS future_task_date timestamptz;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS future_task_note text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS alert_scheduled_at timestamptz;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS alert_note text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS objections text[] DEFAULT '{}';
    `);
  } else {
    console.log('✅ All new columns are present!');
    if (data && data[0]) console.log('Sample row keys:', Object.keys(data[0]).join(', '));
  }
}

run().catch(console.error);
