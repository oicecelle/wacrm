const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%waitlist%'");
  console.log('WAITLIST TABLES:', res.rows);
  await client.end();
}).catch(console.error);
