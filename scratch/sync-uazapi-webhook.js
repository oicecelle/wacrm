const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const baseUrl = 'https://customix.uazapi.com';
const token = '5d04747c-dff1-42b9-a70d-1baadb580093'; // Marcelle Profissional
const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

const headers = {
  'token': token,
  'apikey': token,
  'Content-Type': 'application/json',
};

async function getProfilePicture(phone) {
  const cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone) return null;

  // Try standard
  try {
    const res = await fetch(`${baseUrl}/get/profilePicture?number=${encodeURIComponent(cleanPhone)}`, {
      method: 'GET',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      const url = data?.profilePicUrl || data?.url;
      if (url && url.startsWith('http')) return url;
    }
  } catch (err) {
    console.error(`Error standard for ${cleanPhone}:`, err.message);
  }

  // Try JID
  try {
    const res = await fetch(`${baseUrl}/get/profilePicture?number=${encodeURIComponent(cleanPhone + '@s.whatsapp.net')}`, {
      method: 'GET',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      const url = data?.profilePicUrl || data?.url;
      if (url && url.startsWith('http')) return url;
    }
  } catch (err) {
    console.error(`Error JID for ${cleanPhone}:`, err.message);
  }

  return null;
}

async function run() {
  try {
    await client.connect();
    console.log('Fetching contacts for account:', accountId);
    
    const contactsRes = await client.query(
      "SELECT id, name, phone, avatar_url FROM contacts WHERE account_id = $1 AND phone IS NOT NULL;",
      [accountId]
    );

    console.log(`Found ${contactsRes.rows.length} contacts. Starting sync...`);

    for (let i = 0; i < contactsRes.rows.length; i++) {
      const contact = contactsRes.rows[i];
      console.log(`[${i+1}/${contactsRes.rows.length}] Checking contact: ${contact.name} (${contact.phone})`);
      
      const avatarUrl = await getProfilePicture(contact.phone);
      if (avatarUrl) {
        console.log(`  -> Found photo: ${avatarUrl.substring(0, 80)}...`);
        const updateRes = await client.query(
          "UPDATE contacts SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING id;",
          [avatarUrl, contact.id]
        );
        console.log(`  -> Updated database contact ID: ${contact.id}`);
      } else {
        console.log(`  -> No photo found.`);
      }

      // Small sleep to be nice to the API rate limits
      await new Promise(r => setTimeout(r, 100));
    }

    console.log('=== SYNC COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Sync failed:', err);
  } finally {
    await client.end();
  }
}

run();
