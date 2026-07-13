async function run() {
  console.log('=== TESTANDO WEBHOOK EM PRODUCAO COM ESTRUTURA REAL UAZAPI (GRUPOS E FROMME) ===');

  const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';
  const BYPASS_SECRET = 'CNLFxNhApYNujgxtbc8OlP1H0rcUcxFL';
  const PRODUCTION_URL = 'https://wacrm-three-swart.vercel.app';

  // 1. Simulate GROUP message incoming in production
  const groupPayload = {
    event: 'messages.upsert',
    instance: 'Marcelle Profissional',
    data: {
      key: {
        remoteJid: '1203630248384@g.us', // group JID
        fromMe: false,
        id: `real-uaz-group-${Date.now()}`
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

  const webhookUrl = `${PRODUCTION_URL}/api/whatsapp/uazapi-webhook?account_id=${accountId}&x-vercel-protection-bypass=${BYPASS_SECRET}`;

  console.log(`\nDisparando mensagem de GRUPO em produção...`);
  const res1 = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(groupPayload)
  });
  console.log(`Status Grupo: ${res1.status} → ${await res1.text()}`);

  // 2. Simulate OUTBOUND message (fromMe) in production
  const outboundPayload = {
    event: 'messages.upsert',
    instance: 'Marcelle Profissional',
    data: {
      key: {
        remoteJid: '5521977778888@s.whatsapp.net',
        fromMe: true,
        id: `real-uaz-outbound-${Date.now()}`
      },
      message: {
        conversation: 'Sim, Pedro! Estamos abertos até às 20h hoje.'
      },
      messageType: 'conversation'
    }
  };

  console.log(`\nDisparando mensagem de OUTBOUND (fromMe) em produção...`);
  const res2 = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(outboundPayload)
  });
  console.log(`Status Outbound: ${res2.status} → ${await res2.text()}`);
}

run().catch(console.error);
