const baseUrl = 'https://customix.uazapi.com';
const token = 'ae2659ed-47d3-4266-9515-f052fc0af8ed'; // Other clinic token
const testPhone = '5521997239241'; // Mari, who had messages with this token

async function test() {
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json'
  };

  const urls = [
    `${baseUrl}/get/profilePicture?number=${encodeURIComponent(testPhone)}`,
    `${baseUrl}/get/profilePicture?number=${encodeURIComponent(testPhone + '@s.whatsapp.net')}`
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(`URL: ${url} -> status: ${res.status}`);
      console.log(`Response:`, text);
    } catch (err) {
      console.error(`Failed:`, err.message);
    }
  }
}

test();
