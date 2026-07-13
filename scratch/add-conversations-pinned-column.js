const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== CONNECTING TO DB TO ADD PINNED COLUMN ===\n');
  await client.connect();

  try {
    console.log('Adding is_pinned column to conversations table...');
    await client.query(`
      ALTER TABLE public.conversations
      ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
    `);
    console.log('✅ Column is_pinned added successfully!');
  } catch (err) {
    console.error('❌ Error adding is_pinned column:', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
