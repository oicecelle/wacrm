const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const ct = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='contact_timeline' ORDER BY ordinal_position");
  console.log('CONTACT_TIMELINE:', JSON.stringify(ct.rows, null, 2));
  const pt = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='patient_timeline' ORDER BY ordinal_position");
  console.log('PATIENT_TIMELINE:', JSON.stringify(pt.rows, null, 2));
  await client.end();
}).catch(console.error);
