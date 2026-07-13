const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== DOCUMENTS RLS POLICIES ===");

  const res = await client.query("SELECT * FROM pg_policies WHERE tablename = 'documents';");
  res.rows.forEach(r => {
    console.log(` - Policy: ${r.policyname} | Cmd: ${r.cmd} | Roles: ${r.roles} | Qual: ${r.qual} | WithCheck: ${r.with_check}`);
  });

  await client.end();
}

run().catch(console.error);
