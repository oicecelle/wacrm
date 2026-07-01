const { Client } = require('pg');

const connectionString = 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres';

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function run() {
  try {
    console.log('Connecting to Supabase pooler...');
    await client.connect();
    console.log('Connected! Modifying whatsapp_config to add source_rules column...');
    await client.query("ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS source_rules JSONB DEFAULT '[]'::jsonb;");
    console.log('Source rules column added successfully!');
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    await client.end();
  }
}

run();
