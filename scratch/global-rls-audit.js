const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== GLOBAL DB RLS AUDIT ===");

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `);

  const tables = tablesRes.rows.map(r => r.table_name);
  console.log(`Found ${tables.length} tables in public schema.`);

  const rlsStatus = [];
  const noRls = [];

  for (const table of tables) {
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = $1;
    `, [table]);

    const row = rlsRes.rows[0];
    if (row) {
      const isEnabled = row.relrowsecurity;
      rlsStatus.push({ table, isEnabled });
      if (!isEnabled) {
        noRls.push(table);
      }
    }
  }

  console.log("\n--- TABLES WITH RLS DISABLED ---");
  if (noRls.length === 0) {
    console.log("All tables have RLS enabled!");
  } else {
    noRls.forEach(t => console.log(` - ${t}`));
  }

  console.log("\n--- DETAILED POLICIES FOR ALL TABLES WITH RLS ENABLED ---");
  for (const item of rlsStatus) {
    if (!item.isEnabled) continue;
    const res = await client.query(`
      SELECT policyname, cmd, roles, qual, with_check 
      FROM pg_policies 
      WHERE tablename = $1;
    `, [item.table]);

    console.log(`\nTable: ${item.table}`);
    if (res.rows.length === 0) {
      console.log(" -> WARNING: RLS is enabled but NO POLICIES exist! All access is blocked for non-superusers.");
    } else {
      res.rows.forEach(p => {
        console.log(` -> "${p.policyname}" | Cmd: ${p.cmd} | Roles: ${p.roles}`);
        if (p.qual) console.log(`    Qual: ${p.qual}`);
        if (p.with_check) console.log(`    Check: ${p.with_check}`);
      });
    }
  }

  await client.end();
}

run().catch(console.error);
