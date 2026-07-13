const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093';
const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

const PRODUCTION_URL = 'https://wacrm-three-swart.vercel.app';

// Clean URL without '&' symbol to prevent any query parsing issues in UazAPI
const webhookUrl = `${PRODUCTION_URL}/api/whatsapp/uazapi-webhook?account_id=${accountId}`;

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function run() {
  console.log(`\n=== UPDATING WEBHOOK CONFIG ON UAZAPI TO A CLEAN URL ===`);
  console.log(`Clean Webhook Target URL: ${webhookUrl}`);

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

  const updateRes = await fetch(`${baseUrl}/webhook`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  
  const updateText = await updateRes.text();
  console.log(`Webhook update response: ${updateRes.status} ${updateRes.statusText}`);
  console.log(updateText);
}

run().catch(console.error);
