const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO WHATSAPP_CONFIG DA MARCELLE ===");

  const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

  const res = await client.query("SELECT * FROM whatsapp_config WHERE account_id = $1;", [accountId]);
  console.log("Configurações encontradas:");
  console.log(res.rows);

  await client.end();
}

run().catch(console.error);
