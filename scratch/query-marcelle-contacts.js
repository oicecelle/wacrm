const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  console.log("=== CONTACTS FOR ef927bc1-5aab-4728-a24b-9a85c4f66b2c ===");
  const contacts = await client.query("SELECT id, name, phone, email FROM contacts WHERE account_id = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';");
  console.log(JSON.stringify(contacts.rows, null, 2));

  await client.end();
}

run().catch(console.error);
