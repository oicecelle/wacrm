const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== FILTRANDO PERFIS DA MARCELLE ===");

  const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

  // Profiles of this account
  const pRes = await client.query("SELECT * FROM profiles WHERE account_id = $1;", [accountId]);
  console.log("Perfis da conta da Marcelle:");
  console.log(pRes.rows);

  // Check if there are conversations for this account_id in conversations
  const cRes = await client.query("SELECT * FROM conversations WHERE account_id = $1;", [accountId]);
  console.log("\nConversas criadas para esta conta:");
  console.log(cRes.rows);

  await client.end();
}

run().catch(console.error);
