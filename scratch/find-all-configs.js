async function run() {
  console.log("=== PROBING UAZAPI INSTANCE ENDPOINTS ===");

  const baseUrl = 'https://customix.uazapi.com';
  const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle token
  
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  const endpoints = [
    '/instance/connectionState',
    '/instance/connectionState/Marcelle%20Profissional',
    '/instance/connectionState/Marcelle_Profissional',
    '/instance/status',
    '/instance/status/Marcelle%20Profissional'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${baseUrl}${ep}`, { method: 'GET', headers });
      console.log(`GET ${ep} → Status: ${res.status}`);
      if (res.ok) {
        const data = await res.json();
        console.log("Data:", JSON.stringify(data, null, 2));
        break;
      }
    } catch (e) {
      console.error(`Error on ${ep}:`, e.message);
    }
  }
}

run().catch(console.error);
