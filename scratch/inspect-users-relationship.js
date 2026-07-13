const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const pCount = await client.query("SELECT count(*) FROM public.profiles");
  console.log('PROFILES COUNT:', pCount.rows[0].count);
  const cuCount = await client.query("SELECT count(*) FROM public.clinic_users");
  console.log('CLINIC_USERS COUNT:', cuCount.rows[0].count);
  
  const cuSample = await client.query("SELECT * FROM public.clinic_users LIMIT 2");
  console.log('CLINIC_USERS SAMPLE:', JSON.stringify(cuSample.rows, null, 2));
  
  const pSample = await client.query("SELECT * FROM public.profiles LIMIT 2");
  console.log('PROFILES SAMPLE:', JSON.stringify(pSample.rows, null, 2));
  
  await client.end();
}).catch(console.error);
