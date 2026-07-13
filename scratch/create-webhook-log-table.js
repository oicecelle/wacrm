const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CRIANDO TABELA DE LOG DO WEBHOOK ===");

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_logs (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        received_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
        payload jsonb,
        error_message text
    );
  `);
  
  console.log("Tabela public.whatsapp_webhook_logs criada ou já existente.");
  await client.end();
}

run().catch(console.error);
