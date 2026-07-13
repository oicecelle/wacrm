const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Querying last 50 webhook logs...');
    const res = await client.query(`
      SELECT id, received_at, 
             payload->>'instanceName' as instance, 
             payload->'message'->>'chatid' as chat_id, 
             payload->'message'->>'senderName' as sender_name,
             (payload->'message'->>'fromMe')::boolean as from_me, 
             payload->'message'->>'text' as text
      FROM public.whatsapp_webhook_logs 
      ORDER BY received_at DESC 
      LIMIT 50;
    `);
    
    console.log(`Found ${res.rows.length} logs.`);
    res.rows.forEach((row, i) => {
      console.log(`[${row.received_at}] Log ID: ${row.id} | Inst: ${row.instance} | Chat: ${row.chat_id} (${row.sender_name}) | FromMe: ${row.from_me} | Text: "${row.text}"`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
