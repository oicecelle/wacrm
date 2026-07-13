const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log('Fetching clinicas_config...');
    const configRes = await client.query("SELECT * FROM public.clinicas_config;");
    console.log(`clinicas_config rows: ${configRes.rows.length}`);
    configRes.rows.forEach(row => {
      console.log('Row:', {
        id: row.id,
        nome: row.nome,
        uazapi_token: row.uazapi_token,
        numero_whatsapp: row.numero_whatsapp,
        webhook_url: row.webhook_url,
        status: row.status
      });
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
