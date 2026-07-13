const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Searching for Marcelle or 5d04747c-dff1-42b9-a70d-1baadb580093 in tables...');
    
    const configRes = await client.query("SELECT * FROM public.clinicas_config WHERE nome ILIKE '%Marcelle%' OR uazapi_token = '5d04747c-dff1-42b9-a70d-1baadb580093';");
    console.log('clinicas_config search results:', configRes.rows);

    const clinicsRes = await client.query("SELECT * FROM public.clinics WHERE name ILIKE '%Marcelle%';");
    console.log('clinics search results:', clinicsRes.rows);

    const whatsappRes = await client.query("SELECT * FROM public.whatsapp_config WHERE account_id = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';");
    console.log('whatsapp_config search results:', whatsappRes.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
