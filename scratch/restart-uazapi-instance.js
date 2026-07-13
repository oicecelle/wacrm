async function run() {
  console.log("=== ENVIANDO COMANDO DE RESTART PARA A INSTANCIA NA UAZAPI ===");

  const baseUrl = 'https://customix.uazapi.com';
  const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle token
  const instanceName = 'Marcelle Profissional';
  
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json',
  };

  try {
    // 1. Restart instance
    const res = await fetch(`${baseUrl}/instance/restart/${instanceName}`, {
      method: 'POST',
      headers
    });
    console.log(`POST /instance/restart: ${res.status} ${res.statusText}`);
    const text = await res.text();
    console.log("Response:", text.substring(0, 500));
  } catch (e) {
    console.error("Erro ao dar restart na instância:", e.message);
  }
}

run().catch(console.error);
