const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const res = await client.query("SELECT * FROM pg_policies WHERE tablename = 'patients'");
  console.log('POLICIES:', JSON.stringify(res.rows, null, 2));
  await client.end();
}).catch(console.error);
