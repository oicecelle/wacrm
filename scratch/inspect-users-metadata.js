const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECTING AUTH.USERS METADATA ===");

  const res = await client.query(`
    SELECT id, email, raw_app_meta_data, raw_user_meta_data 
    FROM auth.users 
    WHERE email IN ('marcelle.profissional@gmail.com', 'marcelle@pluztech.com', 'camilaalexandrino@pluztech.com')
       OR raw_app_meta_data::text LIKE '%clinic_id%'
    LIMIT 5;
  `);

  res.rows.forEach(r => {
    console.log(`\nUser: ${r.email} (${r.id})`);
    console.log("raw_app_meta_data:", JSON.stringify(r.raw_app_meta_data, null, 2));
    console.log("raw_user_meta_data:", JSON.stringify(r.raw_user_meta_data, null, 2));
  });

  await client.end();
}

run().catch(console.error);
