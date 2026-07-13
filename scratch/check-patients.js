const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CHECKING PATIENTS ===");

  const res = await client.query("SELECT id, name, clinic_id FROM public.patients LIMIT 5;");
  res.rows.forEach(r => console.log(` - ID: ${r.id} | Name: ${r.name} | Clinic: ${r.clinic_id}`));

  await client.end();
}

run().catch(console.error);
