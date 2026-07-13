const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='package_items' ORDER BY ordinal_position");
  console.log('PACKAGE_ITEMS SCHEMA:', JSON.stringify(res.rows, null, 2));
  const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='patient_packages' ORDER BY ordinal_position");
  console.log('PATIENT_PACKAGES SCHEMA:', JSON.stringify(res2.rows, null, 2));
  await client.end();
}).catch(console.error);
