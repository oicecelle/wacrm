const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Querying clinics with IDs ef927bc1-5aab-4728-a24b-9a85c4f66b2c and dd6883f0-3655-4f85-bbeb-7d9e2efeed6a...');
    const res = await client.query("SELECT id, name, numero_whatsapp, uazapi_token, whatsapp_status FROM public.clinics WHERE id IN ('ef927bc1-5aab-4728-a24b-9a85c4f66b2c', 'dd6883f0-3655-4f85-bbeb-7d9e2efeed6a');");
    console.log('Clinics:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
