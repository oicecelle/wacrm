const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== CONNECTING TO DB TO ADD UNIQUE CONSTRAINT ===\n');
  await client.connect();

  try {
    // 1. Add UNIQUE constraint to conversations
    console.log('Adding UNIQUE constraint to conversations table...');
    const res = await client.query(`
      ALTER TABLE public.conversations
      ADD CONSTRAINT unique_account_contact UNIQUE (account_id, contact_id);
    `);
    console.log('✅ Unique constraint added successfully!');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('ℹ️ Constraint already exists.');
    } else {
      console.error('❌ Error adding unique constraint:', err.message);
    }
  } finally {
    await client.end();
  }
}

run().catch(console.error);
