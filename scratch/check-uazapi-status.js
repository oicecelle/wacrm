/**
 * check-uazapi-status.js
 * Verifica o status de conexao da instancia UazAPI e envia uma mensagem de teste.
 * Uso: node scratch/check-uazapi-status.js
 * 
 * Os valores sao buscados do banco via API local -- certifique-se que o servidor esta rodando.
 * Para testar direto: edite UAZAPI_TOKEN, UAZAPI_BASE_URL e TEST_PHONE abaixo.
 */

const UAZAPI_BASE_URL = 'https://customix.uazapi.com';
const UAZAPI_TOKEN = 'qOAP0f3L5nSkBEcFmWHyevQhJrh03auQqu8QZcqVBC5fhnuczs';
const TEST_PHONE = '5511999999999'; // <-- Altere para um numero real para testar envio

async function req(endpoint, method = 'GET', body = null) {
  const opts = {
    method,
    headers: {
      'token': UAZAPI_TOKEN,
      'apikey': UAZAPI_TOKEN,
      'Content-Type': 'application/json',
    }
  };
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(`${UAZAPI_BASE_URL}${endpoint}`, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message } };
  }
}

async function checkStatus() {
  console.log('=== UAZAPI STATUS CHECK ===');
  console.log('Base URL:', UAZAPI_BASE_URL);
  console.log('Token:', UAZAPI_TOKEN.substring(0, 10) + '...');
  console.log('');

  const endpoints = [
    '/get/status',
    '/instance/status',
    '/status',
  ];

  let connected = false;
  for (const ep of endpoints) {
    const r = await req(ep);
    console.log(`GET ${ep} -> HTTP ${r.status}`);
    console.log('  Response:', JSON.stringify(r.data).substring(0, 200));
    if (r.ok) {
      const d = r.data;
      connected = d?.connected === true || d?.status === 'connected' || d?.state === 'connected';
      console.log('  >> Connected:', connected);
      break;
    }
  }

  return connected;
}

async function testSendMessage() {
  console.log('\n=== SEND MESSAGE TEST ===');
  console.log('Sending to:', TEST_PHONE);
  const text = `[LeadPluz Teste] Mensagem de teste enviada em ${new Date().toLocaleString('pt-BR')}. Se recebeu isto, a integracao UazAPI esta funcionando!`;
  
  const r = await req('/send/text', 'POST', { number: TEST_PHONE, text });
  console.log('POST /send/text -> HTTP', r.status);
  console.log('Response:', JSON.stringify(r.data, null, 2));
  
  if (r.ok) {
    console.log('\nSUCESSO! Mensagem enviada com sucesso.');
  } else {
    console.log('\nERRO ao enviar mensagem.');
    console.log('Verifique se:');
    console.log('  1. A instancia esta conectada no painel UazAPI');
    console.log('  2. O numero de destino eh valido (formato: 5511999999999)');
    console.log('  3. O token esta correto');
  }
}

async function run() {
  const connected = await checkStatus();
  if (connected) {
    await testSendMessage();
  } else {
    console.log('\nINSTANCIA NAO CONECTADA. Teste de envio ignorado.');
    console.log('Acesse o painel UazAPI para reconectar o WhatsApp da clinica.');
  }
}

run().catch(console.error);
