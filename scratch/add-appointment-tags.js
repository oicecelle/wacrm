const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Conectado ao PostgreSQL...");

  const queries = [
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tag TEXT;`,
    `ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tag_color TEXT;`
  ];

  for (const q of queries) {
    try {
      await client.query(q);
      console.log("Sucesso:", q);
    } catch (err) {
      console.error("Erro na query:", q, err.message);
    }
  }

  await client.end();
  console.log("Concluído!");
}

main().catch(console.error);
