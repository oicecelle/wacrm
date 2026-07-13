const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle Profissional

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json'
};

async function run() {
  const payload = {
    url: 'https://n8n-n8n.rpskbr.easypanel.host/webhook/conversacional-universal',
    enabled: true,
    events: ['messages'],
    excludeMessages: ['isGroupYes']
  };

  try {
    console.log('Setting webhook for Marcelle Profissional in Uazapi...');
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
