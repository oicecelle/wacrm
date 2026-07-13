const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093';

async function check() {
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json'
  };

  const endpoints = ['/get/status', '/instance/status', '/status', '/get/me'];
  for (const endpoint of endpoints) {
    try {
      const url = `${baseUrl}${endpoint}`;
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(`Endpoint: ${endpoint} -> status: ${res.status}`);
      console.log(`Response:`, text.substring(0, 500));
    } catch (err) {
      console.error(`Failed for ${endpoint}:`, err.message);
    }
  }
}

check();
