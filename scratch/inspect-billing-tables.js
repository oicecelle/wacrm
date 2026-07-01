const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Inspect plans
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'plans';
    `);
    console.log("Columns in 'plans':");
    res.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));
  } catch (e) {
    console.error(e);
  }

  // Inspect subscriptions
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'subscriptions';
    `);
    console.log("\nColumns in 'subscriptions':");
    res.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));
  } catch (e) {
    console.error(e);
  }

  // Inspect system_alerts
  try {
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'system_alerts';
    `);
    console.log("\nColumns in 'system_alerts':");
    res.rows.forEach(r => console.log(` - ${r.column_name}: ${r.data_type}`));
  } catch (e) {
    console.error(e);
  }

  await client.end();
}

run().catch(console.error);
