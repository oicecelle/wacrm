const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

async function run() {
  try {
    await client.connect();
    console.log('Querying conversations for Marcelle...');
    const res = await client.query(`
      SELECT c.id, c.last_message_text, c.last_message_at, ct.name, ct.phone
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      WHERE c.account_id = $1
      ORDER BY c.last_message_at DESC LIMIT 20;
    `, [accountId]);
    console.log(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
