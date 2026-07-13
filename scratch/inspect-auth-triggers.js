const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO TRIGGERS EM AUTH.USERS ===");

  const triggers = await client.query(`
    SELECT tgname, tgtype, tgrelid::regclass as relname, proname
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE tgrelid::regclass::text = 'auth.users';
  `);
  console.log("Triggers on auth.users:");
  console.log(triggers.rows);

  // Check the trigger functions on profiles and auth.users
  const triggerFuncs = await client.query(`
    SELECT proname, prosrc 
    FROM pg_proc 
    WHERE proname IN (
      SELECT DISTINCT proname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE tgrelid::regclass::text IN ('profiles', 'auth.users')
    );
  `);
  console.log("\nTrigger function sources:");
  triggerFuncs.rows.forEach(f => {
    console.log(`\n--- Function ${f.proname} ---`);
    console.log(f.prosrc.substring(0, 1000));
  });

  await client.end();
}

run().catch(console.error);
