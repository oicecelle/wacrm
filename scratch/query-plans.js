const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const plans = await client.query('SELECT * FROM plans;');
  console.log("Plans inside database:");
  console.log(plans.rows);
  const subs = await client.query('SELECT * FROM subscriptions LIMIT 10;');
  console.log("\nSubscriptions inside database:");
  console.log(subs.rows);
  const alerts = await client.query('SELECT * FROM system_alerts LIMIT 10;');
  console.log("\nSystem Alerts inside database:");
  console.log(alerts.rows);
  await client.end();
}

run().catch(console.error);
