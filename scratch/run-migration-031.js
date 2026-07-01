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

  const filePath = path.join(__dirname, "../supabase/migrations/031_google_calendar.sql");
  console.log(`Running migration: 031_google_calendar.sql...`);
  const sql = fs.readFileSync(filePath, "utf8");
  
  try {
    await client.query(sql);
    console.log(`✅ Completed 031_google_calendar.sql`);
  } catch (e) {
    console.error(`❌ Error:`, e.message);
  }

  await client.end();
}

main().catch(console.error);
