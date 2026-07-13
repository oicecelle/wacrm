const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== SEARCHING DB SOURCES ===");

  const res = await client.query(`
    SELECT proname, pronamespace::regnamespace as schema, prosrc
    FROM pg_proc 
    WHERE prosrc ILIKE '%raw_app_meta_data%'
       OR prosrc ILIKE '%app_metadata%'
       OR prosrc ILIKE '%raw_user_meta_data%';
  `);

  console.log(`Found ${res.rows.length} functions.`);
  res.rows.forEach(r => {
    console.log(`\n--- Function ${r.schema}.${r.proname} ---`);
    console.log(r.prosrc.substring(0, 1000));
  });

  await client.end();
}

run().catch(console.error);
