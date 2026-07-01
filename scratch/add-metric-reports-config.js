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
    console.log('Connected! Modifying whatsapp_config to add metric_reports_config column...');
    await client.query(`
      ALTER TABLE whatsapp_config 
      ADD COLUMN IF NOT EXISTS metric_reports_config JSONB DEFAULT '{"enabled": false, "time": "17:00", "recipient_phone": "", "frequency": ["daily"], "metrics": ["leads", "rescues", "followups", "bookings", "comparecimentos", "cancelamentos", "unanswered"]}'::jsonb;
    `);
    console.log('metric_reports_config column added successfully!');
  } catch (err) {
    console.error('Error executing query:', err);
  } finally {
    await client.end();
  }
}

run();
