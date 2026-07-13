const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CHECKING DOCUMENT TEMPLATES ===");

  const res = await client.query("SELECT id, name, type, clinic_id FROM public.document_templates LIMIT 10;");
  console.log(`Templates count: ${res.rows.length}`);
  res.rows.forEach(r => console.log(` - ID: ${r.id} | Name: ${r.name} | Type: ${r.type} | Clinic: ${r.clinic_id}`));

  await client.end();
}

run().catch(console.error);
