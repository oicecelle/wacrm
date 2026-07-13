const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const res = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log('TABLES:', res.rows.map(r => r.table_name).join('\n'));
  
  // Check procedures table schema
  const proc = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='procedures' ORDER BY ordinal_position`);
  console.log('\nPROCEDURES SCHEMA:', JSON.stringify(proc.rows, null, 2));
  
  // Check if financial tables exist
  const fin = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='financial_transactions' ORDER BY ordinal_position`);
  console.log('\nFINANCIAL_TRANSACTIONS SCHEMA:', JSON.stringify(fin.rows, null, 2));
  
  // Check patient_records  
  const pr = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='patient_records' ORDER BY ordinal_position`);
  console.log('\nPATIENT_RECORDS SCHEMA:', JSON.stringify(pr.rows, null, 2));
  
  // Check clinic_users/account_users
  const cu = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='clinic_users' ORDER BY ordinal_position`);
  console.log('\nCLINIC_USERS SCHEMA:', JSON.stringify(cu.rows, null, 2));
  
  await client.end();
}).catch(console.error);
