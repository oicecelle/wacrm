const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== BUSCANDO MENCOES A ARQUIVOS DE LOGO/IMAGEM NO BANCO ===\n");

  // Query clinics
  const clinics = await client.query("SELECT id, name, logo_url, icon_url, foto_url FROM clinics WHERE logo_url IS NOT NULL OR icon_url IS NOT NULL OR foto_url IS NOT NULL;");
  console.log("Clinics com imagens:");
  console.log(clinics.rows);

  // Query any storage objects if table exists
  try {
    const storageObjects = await client.query("SELECT id, name, bucket_id FROM storage.objects;");
    console.log("Arquivos no Supabase Storage:");
    console.log(storageObjects.rows);
  } catch (e) {
    console.log("Nao foi possivel ler storage.objects:", e.message);
  }

  await client.end();
}

run().catch(console.error);
