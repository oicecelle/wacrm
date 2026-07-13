const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const token = '5d04747c-dff1-42b9-a70d-1baadb580093';
const phone = '5521990525962';

async function run() {
  try {
    await client.connect();
    console.log('Querying webhook logs for Marcelle token/phone...');
    const res = await client.query(`
      SELECT id, payload, received_at 
      FROM public.whatsapp_webhook_logs 
      WHERE 
        (payload::text LIKE $1)
        OR (payload::text LIKE $2)
      ORDER BY received_at DESC LIMIT 10;
    `, [`%${token}%`, `%${phone}%`]);
    
    console.log(`Found ${res.rows.length} logs.`);
    res.rows.forEach((row, i) => {
      console.log(`\nLog ${i}: received_at=${row.received_at} ID=${row.id}`);
      console.log('Payload keys:', Object.keys(row.payload || {}));
      console.log('Payload (truncated):', JSON.stringify(row.payload).substring(0, 800));
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
