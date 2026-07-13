async function run() {
  console.log('=== TESTANDO WEBHOOK LOCALMENTE (GRUPOS E FROMME) ===');

  const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';
  const LOCAL_URL = 'http://localhost:3000';

  // 1. Simulate GROUP message incoming
  const groupPayload = {
    event: 'messages.upsert',
    instance: 'Marcelle Profissional',
    data: {
      key: {
        remoteJid: '1203630248384@g.us', // group JID
        fromMe: false,
        id: `local-uaz-group-${Date.now()}`
      },
      message: {
        conversation: 'Pessoal, a clínica está aberta hoje?'
      },
      messageType: 'conversation',
      sender: {
        name: 'Cliente Grupo Teste'
      },
      chat: {
        id: '1203630248384@g.us',
        name: 'Grupo de Testes Marcelle'
      }
    }
  };

  const webhookUrl = `${LOCAL_URL}/api/whatsapp/uazapi-webhook?account_id=${accountId}`;

  console.log(`\nDisparando mensagem de GRUPO localmente...`);
  const res1 = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(groupPayload)
  });
  console.log(`Status Grupo: ${res1.status} → ${await res1.text()}`);
}

run().catch(console.error);
