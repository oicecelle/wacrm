const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO FUNÇÕES E TRIGGERS ===");

  // 1. Check triggers on profiles
  const triggers = await client.query(`
    SELECT tgname, tgtype, tgrelid::regclass as relname, proname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE tgrelid::regclass::text IN ('profiles', 'clinic_users', 'accounts');
  `);
  console.log("\nTriggers on core tables:");
  console.log(triggers.rows);

  // 2. Check get_active_clinic_id definition
  const funcDef = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname = 'get_active_clinic_id';
  `);
  console.log("\nDefinition of get_active_clinic_id:");
  if (funcDef.rows.length > 0) {
    console.log(funcDef.rows[0].prosrc);
  } else {
    console.log("Not found.");
  }

  // 3. Search for any functions containing 'app_metadata' or 'claims'
  const funcSearch = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE prosrc ILIKE '%app_metadata%' OR prosrc ILIKE '%claim%';
  `);
  console.log("\nFunctions referencing app_metadata or claim:");
  funcSearch.rows.forEach(f => {
    console.log(` - ${f.proname}`);
  });

  await client.end();
}

run().catch(console.error);
