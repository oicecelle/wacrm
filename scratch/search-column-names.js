const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== SEARCHING FOR WHATSAPP NAME COLUMNS ===");

  const res = await client.query(`
    SELECT table_name, column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND (column_name LIKE '%push%' OR column_name LIKE '%wa_name%' OR column_name LIKE '%whatsapp%');
  `);

  res.rows.forEach(c => console.log(` - ${c.table_name}.${c.column_name}: ${c.data_type}`));

  await client.end();
}

run().catch(console.error);
