const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== INSPECIONANDO POLITICAS DE RLS DO SUPABASE ===");

  const tables = ['conversations', 'messages', 'contacts', 'profiles'];

  for (const table of tables) {
    const res = await client.query(`
      SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = $1;
    `, [table]);
    
    console.log(`\nPolíticas para a tabela: ${table}`);
    if (res.rows.length === 0) {
      console.log("Nenhuma política cadastrada (ou RLS desativado).");
    } else {
      console.log(res.rows);
    }

    // Check if RLS is enabled
    const rlsRes = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname = $1;
    `, [table]);
    console.log("RLS Status:", rlsRes.rows);
  }

  await client.end();
}

run().catch(console.error);
