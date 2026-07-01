const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connected to DB!");

  // Check clinic_users columns
  try {
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'clinic_users';
    `);
    console.log("\nColumns in 'clinic_users':");
    cols.rows.forEach(c => console.log(` - ${c.column_name}: ${c.data_type}`));
  } catch (e) {
    console.log("Could not check clinic_users columns", e.message);
  }

  await client.end();
}

main().catch(console.error);
