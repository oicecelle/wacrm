const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const targetTables = [
  'body_measurements',
  'financial_entries',
  'patient_records',
  'whatsapp_webhook_logs'
];

async function run() {
  await client.connect();
  console.log("=== INSPECTING COLUMNS FOR UNSECURED TABLES ===");

  for (const table of targetTables) {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1;
    `, [table]);

    console.log(`\nTable: ${table}`);
    res.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));
  }

  await client.end();
}

run().catch(console.error);
