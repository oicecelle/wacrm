/**
 * test-ticto-webhook.js
 * Simula um payload Ticto "authorized" e envia para o endpoint local.
 * Uso: node scratch/test-ticto-webhook.js
 */

const TICTO_TOKEN = 'ybQmIZCZZOKrgsUGnVWDnhjanKYl0p0Zb6Pe1Keh8mF0xZBmIWLWCrgkd3vorvbemq9vyDPtJdu04l5O8IZTad8DGgUrVbnD7xQJ';
const ENDPOINT = 'http://localhost:3000/api/whatsapp/ticto-webhook';

const payload = {
  token: TICTO_TOKEN,
  status: 'authorized',
  status_date: new Date().toISOString(),
  payment_method: 'pix',
  customer: {
    name: 'Teste Automático',
    email: 'teste@leadpluz.com',
    cpf: '00000000000',
    phone: { ddi: '55', ddd: '11', number: '999999999' }
  },
  order: {
    id: 'TEST-' + Date.now(),
    hash: 'test-hash-' + Date.now(),
    transaction_hash: 'test-tx-' + Date.now(),
    paid_amount: 15000,
    installments: 1
  },
  item: {
    product_name: 'Consulta Avulsa',
    amount: 15000
  }
};

async function testHealthCheck() {
  console.log('--- HEALTH CHECK ---');
  try {
    const res = await fetch(ENDPOINT, { method: 'GET' });
    const data = await res.json();
    console.log('GET', ENDPOINT, '->', res.status);
    console.log('Response:', JSON.stringify(data));
  } catch (err) {
    console.error('Health check falhou:', err.message);
    console.log('AVISO: Certifique-se que o servidor local esta rodando: npm run dev');
    process.exit(1);
  }
}

async function testTictoWebhook() {
  console.log('\n--- POST TEST ---');
  console.log('Payload:', JSON.stringify(payload, null, 2));
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    console.log('Status HTTP:', res.status, res.statusText);
    console.log('Resposta:', JSON.stringify(data, null, 2));
    if (res.status === 200) {
      console.log('\nSUCESSO! Webhook Ticto funcionando corretamente.');
    } else if (res.status === 401) {
      console.log('\nERRO 401 - Token nao confere.');
    } else if (res.status === 400) {
      console.log('\nERRO 400 - clinic_id nao resolvido ou payload invalido.');
    } else if (res.status === 500) {
      console.log('\nERRO 500 - Erro interno. Verificar se ticto_webhook_logs existe no banco.');
    }
  } catch (err) {
    console.error('Erro de conexao:', err.message);
  }
}

testHealthCheck().then(() => testTictoWebhook());
