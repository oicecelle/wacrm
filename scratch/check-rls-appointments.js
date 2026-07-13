const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://scrhexfcbtdyubehbzml.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk';

const db = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log('=== CHECKING RLS POLICIES FOR appointments ===');
  
  const { data: policies, error } = await db.rpc('get_policies_for_table', { table_name: 'appointments' });
  
  if (error) {
    // If rpc helper doesn't exist, we can query pg_policies using an arbitrary sql execute or select
    console.log('Error calling RPC, querying pg_policies...');
    const { data: sqlData, error: sqlErr } = await db.from('pg_policies').select('*').eq('tablename', 'appointments');
    // Note: pg_policies might not be exposed as a table, let's query via postgres functions or check direct queries
  }

  // Let's run a query to check pg_policies using custom select if possible
  const { data, error: rawErr } = await db.rpc('execute_sql', { 
    sql_query: "SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies WHERE tablename = 'appointments';" 
  });

  console.log('Policies:', data);
  console.log('Error:', rawErr);
}

run();
