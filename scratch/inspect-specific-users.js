const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT cu.user_id, cu.name, cu.email, cu.role, cu.is_active, c.name as clinic_name, c.id as clinic_id
    FROM clinic_users cu
    JOIN clinics c ON c.id = cu.clinic_id
    WHERE c.id IN ('ef927bc1-5aab-4728-a24b-9a85c4f66b2c', 'dd6883f0-3655-4f85-bbeb-7d9e2efeed6a');
  `);
  console.log('Clinic users:', JSON.stringify(res.rows, null, 2));
  await client.end();
}
run().catch(console.error);
