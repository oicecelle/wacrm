const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== RECENT DOCUMENTS ===");

  const res = await client.query("SELECT id, title, public_token, status, created_at FROM public.documents ORDER BY created_at DESC LIMIT 10;");
  res.rows.forEach(r => {
    console.log(` - ID: ${r.id} | Title: ${r.title} | Token: ${r.public_token} | Status: ${r.status} | Created: ${r.created_at}`);
  });

  await client.end();
}

run().catch(console.error);
