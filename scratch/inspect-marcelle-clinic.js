const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO CLINICA DA MARCELLE IN CLINIC_USERS ===");

  const userId1 = '1644aa99-11bc-4537-9191-f9210bb49c5c'; // Owner
  const userId2 = '71523537-0541-4ab6-845e-7c576819f881'; // Agent

  const res1 = await client.query("SELECT * FROM clinic_users WHERE user_id = $1;", [userId1]);
  console.log("Clinic user mapping para Owner (userId1):");
  console.log(res1.rows);

  const res2 = await client.query("SELECT * FROM clinic_users WHERE user_id = $1;", [userId2]);
  console.log("\nClinic user mapping para Agent (userId2):");
  console.log(res2.rows);

  // If we found any clinic_id, inspect it in clinics
  const clinicIds = [...res1.rows, ...res2.rows].map(r => r.clinic_id);
  if (clinicIds.length > 0) {
    const clRes = await client.query("SELECT id, name, numero_whatsapp, uazapi_token, whatsapp_status FROM clinics WHERE id = ANY($1);", [clinicIds]);
    console.log("\nDetalhes das clínicas encontradas:");
    console.log(clRes.rows);
  } else {
    console.log("\nNenhuma clínica mapeada para esses usuários.");
  }

  await client.end();
}

run().catch(console.error);
