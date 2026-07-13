async function run() {
  try {
    const res = await fetch('https://app.leadpluz.com/api/whatsapp/ticto-webhook', {
      method: 'GET'
    });
    console.log('TICTO GET STATUS:', res.status);
    console.log('TICTO GET BODY:', await res.text());
  } catch (e) {
    console.error('TICTO GET FAILED:', e.message);
  }
}
run();
