// Check what the wacrm-three-swart.vercel.app domain resolves to and test the webhook
async function run() {
  const endpoints = [
    'https://wacrm-three-swart.vercel.app',
    'https://wacrm-6wkw9arlb-oicecelles-projects.vercel.app',
  ];
  const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

  for (const base of endpoints) {
    console.log(`\n=== Testing: ${base} ===`);
    
    // Test GET
    try {
      const res = await fetch(`${base}/api/whatsapp/uazapi-webhook?account_id=${accountId}`, {
        method: 'GET',
      });
      const text = await res.text();
      console.log(`  GET: ${res.status} ${res.statusText} → ${text.substring(0, 200)}`);
    } catch (e) {
      console.error(`  GET error: ${e.message}`);
    }

    // Test a minimal POST
    try {
      const res = await fetch(`${base}/api/whatsapp/uazapi-webhook?account_id=${accountId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', instanceName: 'Marcelle Profissional' }),
      });
      const text = await res.text();
      console.log(`  POST: ${res.status} ${res.statusText} → ${text.substring(0, 300)}`);
    } catch (e) {
      console.error(`  POST error: ${e.message}`);
    }
  }
}

run().catch(console.error);
