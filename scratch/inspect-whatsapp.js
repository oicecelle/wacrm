const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle Profissional
const contactPhone = '5521976640033'; // Marcelle Gonçalves

async function run() {
  const headers = {
    'token': token,
    'apikey': token,
    'Content-Type': 'application/json'
  };

  const endpoints = [
    `/get/profilePicture?number=${contactPhone}`,
    `/get/profilePic?number=${contactPhone}`,
    `/get/profile-picture?number=${contactPhone}`,
    `/get/avatar?number=${contactPhone}`,
    `/get/profile?number=${contactPhone}`,
    `/profile/picture?number=${contactPhone}`,
    `/profile/pic?number=${contactPhone}`,
    `/profile-picture?number=${contactPhone}`,
    `/avatar?number=${contactPhone}`
  ];

  for (const endpoint of endpoints) {
    try {
      const url = `${baseUrl}${endpoint}`;
      const res = await fetch(url, { headers });
      const text = await res.text();
      console.log(`Endpoint: ${endpoint} -> status: ${res.status}`);
      if (res.status !== 404) {
        console.log(`Response:`, text);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

run();
