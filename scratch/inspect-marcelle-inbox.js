const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Querying last 50 webhook logs to inspect fields...');
    const res = await client.query('SELECT id, payload, received_at FROM public.whatsapp_webhook_logs ORDER BY received_at DESC LIMIT 50;');
    
    const tokenCounts = {};
    const ownerCounts = {};
    const instanceNameCounts = {};
    const keysCount = new Set();
    
    res.rows.forEach((row, i) => {
      const p = row.payload || {};
      // Extract possible tokens
      const token = p.uazapiToken || p.token || p.apikey || (p.metadata && p.metadata.token);
      tokenCounts[token] = (tokenCounts[token] || 0) + 1;
      
      // Extract possible owners/connected numbers
      const owner = p.owner || (p.chat && p.chat.owner) || p.instance || p.instancia || p.instanceName;
      ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;

      // Log keys present in the root payload
      Object.keys(p).forEach(k => keysCount.add(k));

      if (i < 5) {
        console.log(`\nLog ${i}: received_at=${row.received_at}`);
        console.log(`- keys:`, Object.keys(p));
        console.log(`- uazapiToken:`, p.uazapiToken);
        console.log(`- token:`, p.token);
        console.log(`- owner:`, p.owner || (p.chat && p.chat.owner));
        console.log(`- instance:`, p.instance || p.instancia || p.instanceName);
      }
    });

    console.log('\n=== Token Counts ===');
    console.log(tokenCounts);
    console.log('\n=== Owner/Instance Counts ===');
    console.log(ownerCounts);
    console.log('\n=== All Root Keys ===');
    console.log(Array.from(keysCount));
    
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
