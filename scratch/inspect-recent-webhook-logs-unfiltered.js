const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Querying last 30 webhook logs (unfiltered)...');
    const res = await client.query('SELECT id, payload, received_at FROM public.whatsapp_webhook_logs ORDER BY received_at DESC LIMIT 30;');
    res.rows.forEach((row, i) => {
      console.log(`\n[${row.received_at}] Log ID: ${row.id}`);
      const p = row.payload || {};
      const token = p.uazapiToken || p.token || (p.body && p.body.uazapiToken) || (p.body && p.body.token);
      const owner = p.owner || (p.chat && p.chat.owner) || (p.body && p.body.owner);
      const fromMe = p.fromMe || (p.body && p.body.fromMe) || (p.message && p.message.fromMe);
      console.log(`- Token: ${token}`);
      console.log(`- Owner: ${owner}`);
      console.log(`- fromMe: ${fromMe}`);
      console.log(`- Payload:`, JSON.stringify(p).substring(0, 500));
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
