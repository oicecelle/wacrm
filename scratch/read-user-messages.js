const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO LOGS DE PAYLOAD DO WEBHOOK (WHATSAPP_WEBHOOK_LOGS) ===");

  const logs = await client.query("SELECT * FROM whatsapp_webhook_logs ORDER BY received_at DESC LIMIT 20;");
  console.log(`Encontrados ${logs.rows.length} logs de requisição:`);
  logs.rows.forEach((log, index) => {
    console.log(`\n--- Log #${index + 1} (${log.received_at}) ---`);
    console.log(`ID: ${log.id}`);
    console.log(`Payload (truncated):`, JSON.stringify(log.payload).substring(0, 1000));
    if (log.error_message) {
      console.log(`Erro: ${log.error_message}`);
    }
  });

  await client.end();
}

run().catch(console.error);
