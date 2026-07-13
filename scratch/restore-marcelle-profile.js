const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle Profissional Token
const instanceName = 'Marcelle Profissional';
const phoneNumber = '5521990525962';
const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c'; // Marcelle account ID
const clinicIds = ['ef927bc1-5aab-4728-a24b-9a85c4f66b2c', 'dd6883f0-3655-4f85-bbeb-7d9e2efeed6a'];

// n8n webhook URL for conversacional-universal
const webhookUrl = 'https://n8n-n8n.rpskbr.easypanel.host/webhook/conversacional-universal';

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function run() {
  console.log("=== RESTAURANDO INSTANCIA DA MARCELLE PROFISSIONAL ===");

  // 1. Configure webhook on UazAPI for the Marcelle Profissional instance
  console.log(`\nConfigurando webhook na UazAPI para a Marcelle Profissional...`);
  const events = [
    'messages.upsert',
    'messages.update',
    'connection.update',
    'send.message',
    'MESSAGES_UPSERT',
    'MESSAGES_UPDATE',
    'CONNECTION_UPDATE',
    'SEND_MESSAGE'
  ];

  const payload = {
    url: webhookUrl,
    enabled: true,
    events: events,
  };

  try {
    const updateRes = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    
    const updateText = await updateRes.text();
    console.log(`Resposta do webhook na UazAPI: ${updateRes.status} ${updateRes.statusText}`);
    console.log(updateText);
  } catch (err) {
    console.error("Erro ao chamar UazAPI:", err.message);
  }

  // 2. Update Database settings
  await client.connect();
  console.log(`\nAtualizando tabela whatsapp_config no banco de dados para a conta ${accountId}...`);

  const query = `
    UPDATE whatsapp_config 
    SET 
      uazapi_token = $1,
      uazapi_instance_name = $2,
      phone_number_id = $3,
      status = 'connected',
      connected_at = NOW(),
      updated_at = NOW()
    WHERE account_id = $4
    RETURNING id;
  `;

  const dbRes = await client.query(query, [token, instanceName, phoneNumber, accountId]);
  console.log(`whatsapp_config atualizada. Registros afetados: ${dbRes.rows.length}`);

  // 3. Update clinics table (numero_whatsapp, uazapi_token and status) by ID
  console.log(`\nAtualizando a tabela de clínicas...`);
  const clinicUpdateQuery = `
    UPDATE clinics 
    SET 
      numero_whatsapp = $1,
      uazapi_token = $2,
      name = $3,
      whatsapp_status = 'connected',
      updated_at = NOW()
    WHERE id = ANY($4)
    RETURNING id, name;
  `;
  const clinicDbRes = await client.query(clinicUpdateQuery, [phoneNumber, token, instanceName, clinicIds]);
  console.log(`Clinicas atualizadas:`, clinicDbRes.rows);

  // 4. Update clinicas_config
  console.log(`\nAtualizando clinicas_config...`);
  const configUpdateQuery = `
    UPDATE clinicas_config
    SET 
      uazapi_token = $1,
      nome = $2,
      numero_whatsapp = $3,
      webhook_url = $4,
      status = 'ativo'
    WHERE id = 'd54d6256-bcf4-4a05-8d9a-89ca4c6e23cb'
    RETURNING nome;
  `;
  const configDbRes = await client.query(configUpdateQuery, [token, instanceName, phoneNumber, webhookUrl]);
  console.log(`Configurações de clínicas (clinicas_config) atualizadas:`, configDbRes.rows);

  await client.end();
  console.log("\n=== RESTAURAÇÃO DE MARCELLE PROFISSIONAL CONCLUÍDA COM SUCESSO ===");
}

run().catch(console.error);
