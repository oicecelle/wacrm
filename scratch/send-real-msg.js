const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle token
const toPhone = '5521976640033'; // Target phone specified by Marcelle

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function run() {
  console.log(`=== DISPARANDO MENSAGEM REAL VIA UAZAPI PARA VINCULAR CONVERSA ===`);
  console.log(`De: Marcelle Profissional`);
  console.log(`Para: ${toPhone}`);

  const payload = {
    number: toPhone,
    text: "Olá! Esta é uma mensagem de teste real enviada a partir da API da UazAPI integrada ao seu CRM LeadPluz. Esta mensagem vai criar a conversa de forma automática na sua Caixa de Entrada!",
  };

  const res = await fetch(`${baseUrl}/send/text`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`Status do envio: ${res.status} ${res.statusText}`);
  console.log("Resposta UazAPI:", text);
}

run().catch(console.error);
