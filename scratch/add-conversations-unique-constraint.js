const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://scrhexfcbtdyubehbzml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk'
);

async function run() {
  console.log('=== ADDING UNIQUE CONSTRAINT TO CONVERSATIONS ===\n');

  // Add unique constraint to conversations table
  const sql = `ALTER TABLE conversations ADD CONSTRAINT unique_account_contact UNIQUE (account_id, contact_id);`;

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
      console.log('✅ Unique constraint added successfully!');
    } else {
      console.log(`❌ Failed to add unique constraint: ${text}`);
    }
  } catch (e) {
    console.log(`⚠️ Error: ${e.message}`);
  }
}

run();
