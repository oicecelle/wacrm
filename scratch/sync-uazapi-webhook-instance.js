const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle token
const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';
const instanceName = 'Marcelle Profissional';

const PRODUCTION_URL = 'https://wacrm-three-swart.vercel.app';
const webhookUrl = `${PRODUCTION_URL}/api/whatsapp/uazapi-webhook?account_id=${accountId}`;

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function run() {
  console.log(`=== CONFIGURANDO WEBHOOK DE INSTANCIA ESPECIFICA NA UAZAPI ===`);
  console.log(`Instância: ${instanceName}`);
  console.log(`Webhook URL: ${webhookUrl}`);

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

  // Try path /webhook/set/{instanceName}
  try {
    console.log(`\nTentando POST /webhook/set/${encodeURIComponent(instanceName)}...`);
    const res = await fetch(`${baseUrl}/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`Status /webhook/set/instance: ${res.status} ${res.statusText}`);
    console.log("Response:", text.substring(0, 1000));
  } catch (e) {
    console.error("Erro no POST /webhook/set/instance:", e.message);
  }

  // Also try path /webhook/set (using headers to resolve instanceName/apikey)
  try {
    console.log(`\nTentando POST /webhook/set...`);
    const res = await fetch(`${baseUrl}/webhook/set`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log(`Status /webhook/set: ${res.status} ${res.statusText}`);
    console.log("Response:", text.substring(0, 1000));
  } catch (e) {
    console.error("Erro no POST /webhook/set:", e.message);
  }
}

run().catch(console.error);
