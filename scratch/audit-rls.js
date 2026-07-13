const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const coreTables = [
  'accounts',
  'clinic_users',
  'profiles',
  'contacts',
  'deals',
  'pipelines',
  'pipeline_stages',
  'whatsapp_chats',
  'whatsapp_messages',
  'messages',
  'appointments',
  'patients',
  'contact_timeline',
  'documents',
  'transactions'
];

async function run() {
  await client.connect();
  console.log("=== COMPREHENSIVE RLS AUDIT ===");

  for (const table of coreTables) {
    // Check if table exists first
    const tableExistsRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name = $1
      );
    `, [table]);

    if (!tableExistsRes.rows[0].exists) {
      console.log(`\nTable ${table} does not exist in schema.`);
      continue;
    }

    // Check RLS status
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1;
    `, [table]);
    
    const rlsRow = rlsRes.rows[0] || {};
    console.log(`\nTable: ${table} (RLS Enabled: ${rlsRow.relrowsecurity}, Force RLS: ${rlsRow.relforcerowsecurity})`);

    // Get policies
    const res = await client.query(`
      SELECT policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = $1;
    `, [table]);

    if (res.rows.length === 0) {
      console.log(" -> NO POLICIES FOUND OR RLS IS DISABLED FOR THIS TABLE.");
    } else {
      res.rows.forEach(policy => {
        console.log(` -> Policy: "${policy.policyname}" | Cmd: ${policy.cmd} | Roles: ${policy.roles}`);
        console.log(`    Qual:       ${policy.qual}`);
        console.log(`    With Check: ${policy.with_check}`);
      });
    }
  }

  await client.end();
}

run().catch(console.error);
