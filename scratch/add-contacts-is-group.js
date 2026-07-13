const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== CONNECTING TO DB TO ADD is_group TO CONTACTS ===\n');
  await client.connect();

  try {
    // 1. Add column
    console.log('Adding is_group column to contacts...');
    await client.query(`
      ALTER TABLE public.contacts
      ADD COLUMN IF NOT EXISTS is_group boolean DEFAULT false;
    `);

    // 2. Backfill existing records
    console.log('Backfilling is_group values based on phone length...');
    await client.query(`
      UPDATE public.contacts
      SET is_group = true
      WHERE length(phone) >= 15;
    `);

    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Error during migration:', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
