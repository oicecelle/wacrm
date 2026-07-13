const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CHECKING CONTACTS COLUMNS ===");

  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'contacts';
  `);

  res.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));

  await client.end();
}

run().catch(console.error);
