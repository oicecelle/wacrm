const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

async function run() {
  try {
    await client.connect();
    const res = await client.query("SELECT id, name, phone, avatar_url, created_at FROM contacts WHERE account_id = $1;", [accountId]);
    console.log(`Contacts count: ${res.rows.length}`);
    console.log(res.rows);

    const convRes = await client.query("SELECT id, contact_id, last_message_text, last_message_at FROM conversations WHERE account_id = $1;", [accountId]);
    console.log(`Conversations count: ${convRes.rows.length}`);
    console.log(convRes.rows);

    const msgRes = await client.query("SELECT id, conversation_id, sender_type, content_text, created_at FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE account_id = $1) ORDER BY created_at DESC;", [accountId]);
    console.log(`Messages count: ${msgRes.rows.length}`);
    console.log(msgRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
