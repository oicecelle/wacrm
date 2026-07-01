const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB!");

    // 1. Seed plans
    console.log("Seeding plans...");
    await client.query(`
      INSERT INTO plans (id, name, features_enabled, created_at)
      VALUES 
        ('basic', 'Plano Básico', '{"copilot": false, "reports": false}', NOW()),
        ('professional', 'Plano Profissional', '{"copilot": true, "reports": true}', NOW()),
        ('enterprise', 'Plano Enterprise', '{"copilot": true, "reports": true}', NOW()),
        ('master', 'Plano Master', '{"copilot": true, "reports": true}', NOW())
      ON CONFLICT (id) DO UPDATE 
      SET name = EXCLUDED.name, features_enabled = EXCLUDED.features_enabled;
    `);
    console.log("Plans seeded successfully!");

    // 2. Fetch all clinics
    const clinics = await client.query('SELECT id FROM clinics;');
    console.log(`Found ${clinics.rows.length} clinics. Creating active subscriptions...`);

    for (const c of clinics.rows) {
      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 6); // 6 months expiration

      await client.query(`
        INSERT INTO subscriptions (id, clinic_id, status, plan_id, expires_at, created_at)
        VALUES (
          gen_random_uuid(),
          $1,
          'active',
          'professional',
          $2,
          NOW()
        )
        ON CONFLICT (clinic_id) DO UPDATE
        SET status = EXCLUDED.status, plan_id = EXCLUDED.plan_id, expires_at = EXCLUDED.expires_at;
      `, [c.id, expiresAt.toISOString()]);
    }
    console.log("Subscriptions seeded successfully for all clinics!");

  } catch (err) {
    console.error("Migration error:", err);
  } finally {
    await client.end();
  }
}

run();
