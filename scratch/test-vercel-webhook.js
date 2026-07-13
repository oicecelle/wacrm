async function run() {
  try {
    const res = await fetch('https://wacrm-three-swart.vercel.app/api/whatsapp/ticto-webhook', {
      method: 'GET'
    });
    console.log('VERCEL DEPLOYMENT GET STATUS:', res.status);
    console.log('VERCEL DEPLOYMENT GET BODY:', await res.text());
  } catch (e) {
    console.error('VERCEL DEPLOYMENT GET FAILED:', e.message);
  }
}
run();
