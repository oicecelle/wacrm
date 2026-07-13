const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO COLUNAS E VALORES DE LOGO NO BANCO ===\n");

  // 1. Clinics table columns and data for account ef927bc1-5aab-4728-a24b-9a85c4f66b2c
  const clinics = await client.query("SELECT * FROM clinics WHERE id = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';");
  console.log("Clinica:");
  console.log(clinics.rows[0]);
  console.log();

  // 2. Accounts table data
  const accounts = await client.query("SELECT * FROM accounts WHERE id = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';");
  console.log("Conta:");
  console.log(accounts.rows[0]);

  await client.end();
}

run().catch(console.error);
