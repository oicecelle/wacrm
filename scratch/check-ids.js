const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const accs = await client.query('SELECT id FROM accounts;');
  const clins = await client.query('SELECT id FROM clinics;');
  
  const accIds = new Set(accs.rows.map(r => r.id));
  const clinIds = new Set(clins.rows.map(r => r.id));
  
  let overlap = 0;
  for (const id of accIds) {
    if (clinIds.has(id)) {
      overlap++;
    }
  }
  
  console.log("Accounts count:", accIds.size);
  console.log("Clinics count:", clinIds.size);
  console.log("Overlap count:", overlap);
  
  await client.end();
}

run().catch(console.error);
