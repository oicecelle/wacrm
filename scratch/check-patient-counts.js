const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const pCount = await client.query("SELECT count(*) FROM public.patients");
  console.log('TOTAL PATIENTS:', pCount.rows[0].count);
  
  const cCount = await client.query("SELECT count(*) FROM public.contacts");
  console.log('TOTAL CONTACTS:', cCount.rows[0].count);
  
  const pSample = await client.query("SELECT clinic_id, count(*) FROM public.patients GROUP BY clinic_id");
  console.log('PATIENTS BY CLINIC:', pSample.rows);
  
  const cSample = await client.query("SELECT account_id, count(*) FROM public.contacts GROUP BY account_id");
  console.log('CONTACTS BY CLINIC:', cSample.rows);
  
  await client.end();
}).catch(console.error);
