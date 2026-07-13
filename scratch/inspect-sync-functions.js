const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECTING SYNC FUNCTIONS ===");

  const funcs = ['sync_leads_compat', 'sync_message_templates_compat', 'setup_nova_clinica'];
  for (const fn of funcs) {
    const res = await client.query(`
      SELECT proname, prosrc 
      FROM pg_proc 
      WHERE proname = $1;
    `, [fn]);
    console.log(`\n--- Function ${fn} ---`);
    if (res.rows.length > 0) {
      console.log(res.rows[0].prosrc);
    } else {
      console.log("Not found.");
    }
  }

  await client.end();
}

run().catch(console.error);
