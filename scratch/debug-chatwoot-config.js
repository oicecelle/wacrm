const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle token
const instanceName = 'Marcelle Profissional';

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function run() {
  console.log("=== INSPECIONANDO INTEGRACAO CHATWOOT NA UAZAPI ===");

  try {
    const res = await fetch(`${baseUrl}/chatwoot/find/${encodeURIComponent(instanceName)}`, {
      method: 'GET',
      headers
    });
    console.log(`Status /chatwoot/find: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log("Chatwoot Config:", text.substring(0, 1000));
  } catch (e) {
    console.error("Erro ao consultar chatwoot:", e.message);
  }
}

run().catch(console.error);
