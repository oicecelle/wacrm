const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== APPLYING DOCUMENTS ANONYMOUS RLS POLICIES ===");

  // Drop policies if already exist to prevent duplicate errors
  await client.query("DROP POLICY IF EXISTS documents_anon_select ON public.documents;");
  await client.query("DROP POLICY IF EXISTS documents_anon_update ON public.documents;");

  // Create Select policy for anonymous users
  const createSelectPolicy = `
    CREATE POLICY documents_anon_select ON public.documents 
      FOR SELECT TO anon 
      USING (public_token IS NOT NULL);
  `;
  await client.query(createSelectPolicy);
  console.log(" - SELECT policy applied successfully!");

  // Create Update policy for anonymous users
  const createUpdatePolicy = `
    CREATE POLICY documents_anon_update ON public.documents 
      FOR UPDATE TO anon 
      USING (public_token IS NOT NULL)
      WITH CHECK (public_token IS NOT NULL);
  `;
  await client.query(createUpdatePolicy);
  console.log(" - UPDATE policy applied successfully!");

  await client.end();
}

run().catch(console.error);
