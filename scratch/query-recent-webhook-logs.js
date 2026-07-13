const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Querying last 10 webhook logs...');
    const res = await client.query('SELECT id, payload, received_at FROM public.whatsapp_webhook_logs ORDER BY received_at DESC LIMIT 10;');
    res.rows.forEach(row => {
      console.log(`[${row.received_at}] Log ID: ${row.id}`);
      console.log('Payload:', JSON.stringify(row.payload).substring(0, 500));
      console.log('---');
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
