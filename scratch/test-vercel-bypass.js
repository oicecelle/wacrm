// Comprehensive Vercel bypass test
const PRODUCTION_URL = 'https://wacrm-three-swart.vercel.app';
const BYPASS_SECRET = 'CNLFxNhApYNujgxtbc8OlP1H0rcUcxFL';
const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';
const endpoint = `/api/whatsapp/uazapi-webhook?account_id=${accountId}`;

async function test(label, url, headers = {}) {
  try {
    const res = await fetch(url, { method: 'GET', headers });
    const text = await res.text();
    console.log(`[${label}] ${res.status} → ${text.substring(0, 200)}`);
    return res.ok;
  } catch (e) {
    console.error(`[${label}] Error: ${e.message}`);
    return false;
  }
}

async function run() {
  console.log('=== TESTING VERCEL BYPASS ===\n');
  
  // Test 1: No bypass
  await test('No bypass', `${PRODUCTION_URL}${endpoint}`);
  
  // Test 2: x-vercel-protection-bypass header
  await test('Header bypass', `${PRODUCTION_URL}${endpoint}`, {
    'x-vercel-protection-bypass': BYPASS_SECRET,
  });
  
  // Test 3: As query param in URL
  await test('Query param bypass', `${PRODUCTION_URL}${endpoint}&x-vercel-protection-bypass=${BYPASS_SECRET}`);
  
  // Test 4: Both header and set bypass cookie
  await test('Header + set cookie', `${PRODUCTION_URL}${endpoint}`, {
    'x-vercel-protection-bypass': BYPASS_SECRET,
    'x-vercel-set-bypass-cookie': 'true',
  });
  
  // Test 5: Try the /api/health or / route to see Vercel's own message
  const healthRes = await fetch(`${PRODUCTION_URL}/api/health`, { method: 'GET' });
  const healthText = await healthRes.text();
  console.log(`\n[/api/health without bypass] ${healthRes.status} → ${healthText.substring(0, 200)}`);
  
  const healthRes2 = await fetch(`${PRODUCTION_URL}/api/health`, {
    method: 'GET',
    headers: { 'x-vercel-protection-bypass': BYPASS_SECRET },
  });
  const healthText2 = await healthRes2.text();
  console.log(`[/api/health with header bypass] ${healthRes2.status} → ${healthText2.substring(0, 200)}`);
}

run().catch(console.error);
