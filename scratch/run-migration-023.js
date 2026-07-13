const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

const steps = [
  {
    label: "ADD COLUMNS to deals",
    sql: `
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS followup_scheduled_at timestamptz,
        ADD COLUMN IF NOT EXISTS followup_type text CHECK (followup_type IN ('auto', 'manual')),
        ADD COLUMN IF NOT EXISTS followup_message text,
        ADD COLUMN IF NOT EXISTS future_task_date timestamptz,
        ADD COLUMN IF NOT EXISTS future_task_note text,
        ADD COLUMN IF NOT EXISTS alert_scheduled_at timestamptz,
        ADD COLUMN IF NOT EXISTS alert_note text,
        ADD COLUMN IF NOT EXISTS objections text[] DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS source text,
        ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL
    `
  },
  {
    label: "CREATE TABLE deal_followups",
    sql: `
      CREATE TABLE IF NOT EXISTS deal_followups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        deal_id uuid REFERENCES deals(id) ON DELETE CASCADE,
        contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
        conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
        scheduled_at timestamptz NOT NULL,
        message text NOT NULL,
        ai_generated boolean DEFAULT true,
        type text NOT NULL DEFAULT 'auto' CHECK (type IN ('auto', 'manual')),
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
        sent_at timestamptz,
        error_message text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `
  },
  {
    label: "ADD COLUMNS to accounts (followup settings)",
    sql: `
      ALTER TABLE accounts
        ADD COLUMN IF NOT EXISTS followup_delay_hours int DEFAULT 4,
        ADD COLUMN IF NOT EXISTS followup_schedule_type text DEFAULT 'next_day_at_time'
          CHECK (followup_schedule_type IN ('next_day_at_time', 'hours_after')),
        ADD COLUMN IF NOT EXISTS followup_send_time text DEFAULT '10:00',
        ADD COLUMN IF NOT EXISTS followup_hours_after int DEFAULT 24,
        ADD COLUMN IF NOT EXISTS followup_use_ai boolean DEFAULT true,
        ADD COLUMN IF NOT EXISTS followup_default_template text,
        ADD COLUMN IF NOT EXISTS lead_sources text[] DEFAULT ARRAY['WhatsApp Orgânico','Instagram','Indicação','Site','Google','TikTok']
    `
  },
  {
    label: "ENABLE RLS on deal_followups",
    sql: `ALTER TABLE deal_followups ENABLE ROW LEVEL SECURITY`
  },
  {
    label: "DROP old RLS policy if exists",
    sql: `DROP POLICY IF EXISTS "account members can manage followups" ON deal_followups`
  },
  {
    label: "CREATE RLS policy on deal_followups",
    sql: `
      CREATE POLICY "account members can manage followups"
        ON deal_followups FOR ALL
        USING (is_account_member(account_id, 'viewer'))
        WITH CHECK (is_account_member(account_id, 'agent'))
    `
  },
  {
    label: "CREATE INDEX deal_followups_pending_scheduled",
    sql: `
      CREATE INDEX IF NOT EXISTS deal_followups_pending_scheduled
        ON deal_followups (account_id, scheduled_at)
        WHERE status = 'pending'
    `
  },
  {
    label: "CREATE INDEX deal_followups_deal_id",
    sql: `
      CREATE INDEX IF NOT EXISTS deal_followups_deal_id
        ON deal_followups (deal_id)
        WHERE status = 'pending'
    `
  }
];

async function main() {
  await client.connect();
  console.log("✅ Connected to Supabase DB!\n");

  let ok = 0;
  let fail = 0;

  for (const step of steps) {
    try {
      await client.query(step.sql);
      console.log(`✅ ${step.label}`);
      ok++;
    } catch (e) {
      console.error(`❌ ${step.label}`);
      console.error(`   Error: ${e.message}\n`);
      fail++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Migration 023 complete: ${ok} OK, ${fail} FAILED`);
  console.log(`========================================`);

  await client.end();
}

main().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
