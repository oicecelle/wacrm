const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  const res = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clinics';
  `);
  console.log("Columns in 'clinics':");
  res.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));

  const counts = await client.query('SELECT count(*) FROM clinics;');
  console.log("Clinics count:", counts.rows[0].count);

  await client.end();
}

run().catch(console.error);
