/**
 * LeadPluz — Migração de novas tabelas (PRD Completo)
 * Execute este script via Supabase SQL Editor ou pg client
 *
 * Tabelas criadas:
 *   - patient_records        (prontuário / anexos)
 *   - body_measurements      (evolução corporal)
 *   - packages               (pacotes de serviços)
 *   - patient_packages       (pacotes contratados por paciente)
 *   - budgets                (orçamentos)
 *   - financial_entries      (financeiro: sinais, receitas, despesas, comissões)
 *
 * Colunas adicionadas:
 *   - contacts.cpf, .sex, .birthday, .type, .avatar_url
 *   - clinic_users.invitation_status, .invited_at
 *   - deals (ou patients): score, temperature, main_objection, next_action, waiting_since, waiting_side
 */

const { Client } = require("pg");

const client = new Client({
  connectionString:
    "postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

const migrations = [
  /* ─── contacts: novos campos clínicos ─── */
  `ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS cpf TEXT,
    ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('M','F','O')),
    ADD COLUMN IF NOT EXISTS birthday DATE,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'lead'
      CHECK (type IN ('lead','patient'));`,

  /* ─── clinic_users: convite por e-mail ─── */
  `ALTER TABLE clinic_users
    ADD COLUMN IF NOT EXISTS invitation_status TEXT NOT NULL DEFAULT 'active'
      CHECK (invitation_status IN ('invited','active')),
    ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;`,

  /* ─── patient_records (prontuário) ─── */
  `CREATE TABLE IF NOT EXISTS patient_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    clinic_id       UUID NOT NULL,
    type            TEXT NOT NULL DEFAULT 'note'
                    CHECK (type IN ('note','image','pdf','video','audio')),
    title           TEXT,
    content         TEXT,
    file_url        TEXT,
    file_name       TEXT,
    file_size       BIGINT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_patient_records_patient ON patient_records(patient_id);`,
  `CREATE INDEX IF NOT EXISTS idx_patient_records_clinic  ON patient_records(clinic_id);`,

  /* ─── body_measurements (evolução corporal) ─── */
  `CREATE TABLE IF NOT EXISTS body_measurements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    clinic_id       UUID NOT NULL,
    measured_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    weight          NUMERIC(6,2),
    height          NUMERIC(5,2),
    bmi             NUMERIC(5,2),
    arm_right       NUMERIC(5,2),
    arm_left        NUMERIC(5,2),
    waist           NUMERIC(5,2),
    abdomen         NUMERIC(5,2),
    hip             NUMERIC(5,2),
    thigh_right     NUMERIC(5,2),
    thigh_left      NUMERIC(5,2),
    calf            NUMERIC(5,2),
    body_fat_pct    NUMERIC(5,2),
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_body_meas_patient ON body_measurements(patient_id);`,

  /* ─── packages (pacotes de serviços) ─── */
  `CREATE TABLE IF NOT EXISTS packages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    services        JSONB NOT NULL DEFAULT '[]',
    sessions_total  INT NOT NULL DEFAULT 1,
    validity_days   INT,
    price           NUMERIC(10,2) NOT NULL DEFAULT 0,
    color           TEXT DEFAULT '#6366f1',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_packages_clinic ON packages(clinic_id);`,

  /* ─── patient_packages (pacotes contratados) ─── */
  `CREATE TABLE IF NOT EXISTS patient_packages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    clinic_id           UUID NOT NULL,
    package_id          UUID NOT NULL REFERENCES packages(id) ON DELETE RESTRICT,
    sessions_used       INT NOT NULL DEFAULT 0,
    sessions_remaining  INT NOT NULL,
    expires_at          TIMESTAMPTZ,
    total_paid          NUMERIC(10,2) NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','completed','expired','cancelled')),
    purchased_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes               TEXT
  );`,

  `CREATE INDEX IF NOT EXISTS idx_patient_pkgs_patient ON patient_packages(patient_id);`,
  `CREATE INDEX IF NOT EXISTS idx_patient_pkgs_clinic  ON patient_packages(clinic_id);`,

  /* ─── budgets (orçamentos) ─── */
  `CREATE TABLE IF NOT EXISTS budgets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           UUID NOT NULL,
    patient_id          UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    items               JSONB NOT NULL DEFAULT '[]',
    subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount_type       TEXT DEFAULT 'none' CHECK (discount_type IN ('none','percentage','fixed')),
    discount_value      NUMERIC(10,2) DEFAULT 0,
    total               NUMERIC(10,2) NOT NULL DEFAULT 0,
    special_conditions  TEXT,
    status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','accepted','refused','expired')),
    sent_at             TIMESTAMPTZ,
    responded_at        TIMESTAMPTZ,
    notes               TEXT,
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_budgets_clinic   ON budgets(clinic_id);`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_patient  ON budgets(patient_id);`,
  `CREATE INDEX IF NOT EXISTS idx_budgets_status   ON budgets(status);`,

  /* ─── financial_entries (financeiro completo) ─── */
  `CREATE TABLE IF NOT EXISTS financial_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL,
    patient_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    appointment_id  UUID,
    type            TEXT NOT NULL
                    CHECK (type IN ('income','expense','commission','signal','refund')),
    category        TEXT,
    description     TEXT NOT NULL,
    amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
    paid_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
    remaining_amount NUMERIC(10,2) GENERATED ALWAYS AS (amount - paid_amount) STORED,
    due_date        DATE,
    paid_at         TIMESTAMPTZ,
    payment_method  TEXT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','partial','paid','cancelled')),
    notes           TEXT,
    created_by      UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_fin_entries_clinic   ON financial_entries(clinic_id);`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_patient  ON financial_entries(patient_id);`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_type     ON financial_entries(type);`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_status   ON financial_entries(status);`,
  `CREATE INDEX IF NOT EXISTS idx_fin_entries_due      ON financial_entries(due_date);`,
];

async function runMigrations() {
  await client.connect();
  console.log("✅ Conectado ao banco de dados\n");

  for (let i = 0; i < migrations.length; i++) {
    const sql = migrations[i].trim();
    const preview = sql.split("\n")[0].substring(0, 80);
    try {
      await client.query(sql);
      console.log(`✅ [${i + 1}/${migrations.length}] ${preview}`);
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (
        msg.includes("already exists") ||
        msg.includes("column") ||
        msg.includes("duplicate")
      ) {
        console.log(`⚠️  [${i + 1}/${migrations.length}] já existe — skip: ${preview}`);
      } else {
        console.error(`❌ [${i + 1}/${migrations.length}] ERRO: ${msg}`);
        console.error("SQL:", sql.substring(0, 200));
      }
    }
  }

  await client.end();
  console.log("\n🏁 Migrações concluídas!");
}

runMigrations().catch(console.error);
