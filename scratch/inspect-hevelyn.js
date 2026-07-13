const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

async function run() {
  try {
    await client.connect();
    
    console.log('=== Contacts for Hevelyn ===');
    const res = await client.query("SELECT id, name, phone, created_at FROM contacts WHERE name ILIKE '%Hevelyn%' OR phone ILIKE '%3195840169%';");
    console.log(res.rows);

    console.log('=== Conversations for Hevelyn ===');
    const convRes = await client.query("SELECT id, contact_id, last_message_text, last_message_at, created_at FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE name ILIKE '%Hevelyn%' OR phone ILIKE '%3195840169%');");
    console.log(convRes.rows);

    console.log('=== Messages for Hevelyn ===');
    const msgRes = await client.query("SELECT id, conversation_id, sender_type, content_text, media_url, created_at FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id IN (SELECT id FROM contacts WHERE name ILIKE '%Hevelyn%' OR phone ILIKE '%3195840169%')) ORDER BY created_at DESC;");
    console.log(msgRes.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
