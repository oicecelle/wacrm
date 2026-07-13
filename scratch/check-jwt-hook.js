const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CHECKING CUSTOM JWT HOOK ===");

  const hookRes = await client.query(`
    SELECT proname, pronamespace::regnamespace as schema, prosrc
    FROM pg_proc 
    WHERE proname = 'custom_access_token_hook';
  `);
  console.log("Found hooks:", hookRes.rows);

  const authFuncs = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE pronamespace::regnamespace::text = 'auth';
  `);
  console.log("\nFunctions in auth schema:");
  authFuncs.rows.forEach(f => {
    console.log(` - ${f.proname}`);
  });

  await client.end();
}

run().catch(console.error);
