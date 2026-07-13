const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  // Let's get the active clinics
  const clinics = await client.query("SELECT id, name FROM public.clinics LIMIT 5");
  console.log('CLINICS:', clinics.rows);
  
  if (clinics.rows.length > 0) {
    const cid = clinics.rows[0].id;
    const pts = await client.query("SELECT id, name FROM public.patients WHERE clinic_id = $1 LIMIT 5", [cid]);
    console.log(`PATIENTS FOR ${cid}:`, pts.rows);
    
    const staff = await client.query("SELECT user_id, name, is_active FROM public.clinic_users WHERE clinic_id = $1 LIMIT 5", [cid]);
    console.log(`STAFF FOR ${cid}:`, staff.rows);
  }
  
  await client.end();
}).catch(console.error);
