const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const client = new Client({
  connectionString: "postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connected to DB!");

  // 1. Drop conflicting old tables to start fresh
  console.log("Dropping conflicting old tables...");
  await client.query(`
    DROP TABLE IF EXISTS public.patient_packages CASCADE;
    DROP TABLE IF EXISTS public.package_items CASCADE;
    DROP TABLE IF EXISTS public.packages CASCADE;
    DROP TABLE IF EXISTS public.budgets CASCADE;
    DROP TABLE IF EXISTS public.quote_items CASCADE;
    DROP TABLE IF EXISTS public.quotes CASCADE;
    DROP TABLE IF EXISTS public.quote_templates CASCADE;
    DROP TABLE IF EXISTS public.procedure_professionals CASCADE;
    DROP TABLE IF EXISTS public.contact_timeline CASCADE;
  `);
  console.log("Dropped successfully!");

  // 2. Read and run migrations 027 to 030
  const migrationsDir = path.join(__dirname, "../supabase/migrations");
  const migrationFiles = [
    "027_leadpluz_packages.sql",
    "028_leadpluz_quotes.sql",
    "029_leadpluz_crm_and_contacts.sql",
    "030_leadpluz_procedures_fields.sql"
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    console.log(`Running migration: ${file}...`);
    const sql = fs.readFileSync(filePath, "utf8");
    
    try {
      await client.query(sql);
      console.log(`✅ Completed ${file}`);
    } catch (e) {
      console.error(`❌ Error in ${file}:`, e.message);
      // Log the query causing error if useful
    }
  }

  await client.end();
}

main().catch(console.error);
