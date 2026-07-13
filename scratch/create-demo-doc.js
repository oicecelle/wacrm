const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CREATING SIMULATED DOCUMENT FOR TESTING ===");

  const ptId = 'd5fd1152-ee3b-4e20-94ef-182c826fcef8'; // Ana Carolina Lima
  const clinicId = 'dd6883f0-3655-4f85-bbeb-7d9e2efeed6a';
  const templateId = '8795f100-d293-45bd-966d-782dfe1ffef2'; // Botox Term
  const token = 'doc_demo_botox_token';

  // Delete existing if any to avoid duplicates
  await client.query("DELETE FROM public.documents WHERE public_token = $1;", [token]);

  const insertQuery = `
    INSERT INTO public.documents (
      clinic_id,
      patient_id,
      title,
      type,
      template_id,
      status,
      sent_via,
      sent_at,
      public_token,
      content
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id;
  `;

  const values = [
    clinicId,
    ptId,
    'Termo de Consentimento - Aplicação de Toxina Botulínica',
    'consentimento',
    templateId,
    'pending',
    'whatsapp',
    new Date().toISOString(),
    token,
    JSON.stringify({ text: "Este documento representa o termo de consentimento para aplicação de Toxina Botulínica para fins estéticos." })
  ];

  const res = await client.query(insertQuery, values);
  console.log(`Document created successfully with ID: ${res.rows[0].id}`);
  console.log(`\nPortal URL to test digital signature:`);
  console.log(`http://localhost:3000/portal/documento/${token}`);

  await client.end();
}

run().catch(console.error);
