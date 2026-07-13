const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Querying whatsapp_config details for Marcelle...');
    const res = await client.query("SELECT id, user_id, account_id, uazapi_token, uazapi_instance_name, phone_number_id FROM whatsapp_config WHERE account_id = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';");
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
