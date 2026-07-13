const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECTING FUNCTION apply_rls ===");

  const res = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'apply_rls';
  `);

  if (res.rows.length > 0) {
    console.log(res.rows[0].prosrc);
  } else {
    console.log("Function 'apply_rls' not found.");
  }

  await client.end();
}

run().catch(console.error);
