const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("=== CHECK RELATIONSHIP BETWEEN ACCOUNTS & CLINICS ===");

  // Check profiles columns
  const profilesCols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles';
  `);
  console.log("\nColumns in 'profiles':");
  profilesCols.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));

  // Check some profile rows
  const profiles = await client.query(`
    SELECT user_id, email, account_id, account_role
    FROM profiles
    LIMIT 5;
  `);
  console.log("\nSample profiles:");
  console.log(profiles.rows);

  // Check if clinics table matches accounts
  const accounts = await client.query(`
    SELECT id, name FROM accounts LIMIT 5;
  `);
  console.log("\nSample accounts:");
  console.log(accounts.rows);

  const clinics = await client.query(`
    SELECT id, name FROM clinics LIMIT 5;
  `);
  console.log("\nSample clinics:");
  console.log(clinics.rows);

  await client.end();
}

run().catch(console.error);
