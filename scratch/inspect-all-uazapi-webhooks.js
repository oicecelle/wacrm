const baseUrl = 'https://customix.uazapi.com';

const configs = [
  { name: 'Marcelle Profissional', token: '5d04747c-dff1-42b9-a70d-1baadb580093' },
  { name: 'Mariana Freire / Viviane Nunes', token: 'bf0db35c-b87d-4ffc-8a33-673810cb858d' },
  { name: 'Ana Bella', token: 'ab599e24-2d60-497c-bf26-e1b82a251d1c' },
  { name: 'Life Performance', token: '5d110784-851f-4fc9-b2a4-69d0fc42f8d4' }
];

async function run() {
  for (const config of configs) {
    try {
      console.log(`=== Webhook Config for ${config.name} ===`);
      const res = await fetch(`${baseUrl}/webhook`, {
        headers: {
          'token': config.token,
          'apikey': config.token
        }
      });
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
    } catch (err) {
      console.error(err);
    }
  }
}

run();
