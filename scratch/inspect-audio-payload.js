const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT id, payload->>'fromMe' as from_me, payload->'message'->>'messageType' as type, payload->'message'->>'messageid' as msg_id, received_at 
      FROM whatsapp_webhook_logs 
      WHERE (payload->>'phone' = '553195840169' OR payload->'message'->>'chatid' = '553195840169@s.whatsapp.net' OR payload->'chat'->>'phone' LIKE '%3195840169%')
      ORDER BY received_at DESC;
    `);
    
    console.log(`=== Webhook Logs count: ${res.rows.length} ===`);
    for (const row of res.rows) {
      console.log(`Received At: ${row.received_at} | fromMe: ${row.from_me} | Type: ${row.type} | MsgID: ${row.msg_id}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
