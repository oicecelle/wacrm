const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle token
const instanceName = 'Marcelle'; // We will also try 'Marcelle Profissional'

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function run() {
  console.log("=== INSPECIONANDO SETTINGS DA INSTANCIA NA UAZAPI ===");

  const instances = ['Marcelle Profissional', 'Marcelle'];

  for (const inst of instances) {
    try {
      console.log(`\nConsultando settings para a instância: ${inst}...`);
      const res = await fetch(`${baseUrl}/settings/find/${encodeURIComponent(inst)}`, {
        method: 'GET',
        headers,
      });
      console.log(`Status settings: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.log(text.substring(0, 1000));
    } catch (e) {
      console.error(`Erro ao consultar settings para ${inst}:`, e.message);
    }
  }

  // Also query webhook status via GET /webhook/find
  try {
    console.log(`\nConsultando configurações de webhook registradas...`);
    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'GET',
      headers,
    });
    console.log(`Status webhook: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log(text.substring(0, 1000));
  } catch (e) {
    console.error("Erro ao consultar webhook:", e.message);
  }
}

run().catch(console.error);
