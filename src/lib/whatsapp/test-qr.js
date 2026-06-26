const token = 'qOAP0f3L5nSkBEcFmWHyevQhJrh03auQqu8QZcqVBC5fhnuczs';
const baseUrl = 'https://customix.uazapi.com';

async function test(ep) {
  try {
    const url = `${baseUrl}${ep}`;
    const res = await fetch(url, {
      headers: {
        'token': token,
        'apikey': token
      }
    });
    console.log(`GET ${ep} status: ${res.status}`);
    if (res.ok) {
      const text = await res.text();
      console.log(`  Body sample:`, text.substring(0, 300));
    }
  } catch (err) {
    console.log(`GET ${ep} failed:`, err.message);
  }
}

async function run() {
  const eps = [
    '/get/qr',
    '/instance/qr',
    '/qr',
    '/qrcode',
    '/get/qrcode',
    '/instance/qrcode',
    '/get/connect',
    '/connect'
  ];
  for (const ep of eps) {
    await test(ep);
  }
}

run();
