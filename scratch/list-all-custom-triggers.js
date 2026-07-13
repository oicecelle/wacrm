const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== LISTING ALL CUSTOM TRIGGERS ===");

  const res = await client.query(`
    SELECT 
      t.tgname AS trigger_name,
      c.relname AS table_name,
      n.nspname AS schema_name,
      p.proname AS function_name
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    JOIN pg_proc p ON t.tgfoid = p.oid
    WHERE t.tgisinternal = false
    ORDER BY schema_name, table_name, trigger_name;
  `);

  console.log("Custom triggers found:");
  res.rows.forEach(r => {
    console.log(` - [${r.schema_name}.${r.table_name}] Trigger: ${r.trigger_name} -> Function: ${r.function_name}`);
  });

  // Let's also check trigger function source code for any triggers on profiles
  const triggerFuncs = res.rows.filter(r => r.table_name === 'profiles' || r.table_name === 'users');
  for (const tf of triggerFuncs) {
    const srcRes = await client.query(`
      SELECT prosrc FROM pg_proc WHERE proname = $1;
    `, [tf.function_name]);
    console.log(`\nSource code for function ${tf.function_name}:`);
    console.log(srcRes.rows[0]?.prosrc);
  }

  await client.end();
}

run().catch(console.error);
