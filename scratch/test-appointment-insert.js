const { Client } = require("pg");

const client = new Client({
  connectionString: "postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log("Connected to Supabase Postgres!");

  // 1. Fetch clinic (account_id)
  const clinicsRes = await client.query("SELECT id, name FROM clinics LIMIT 1;");
  if (clinicsRes.rows.length === 0) {
    console.error("No clinics found!");
    await client.end();
    return;
  }
  const clinic = clinicsRes.rows[0];
  console.log(`Using clinic: ${clinic.name} (${clinic.id})`);

  // 2. Fetch professional (clinic_users)
  const staffRes = await client.query("SELECT id, name FROM clinic_users WHERE clinic_id = $1 LIMIT 1;", [clinic.id]);
  if (staffRes.rows.length === 0) {
    console.error("No staff/clinic users found for this clinic!");
    await client.end();
    return;
  }
  const staff = staffRes.rows[0];
  console.log(`Using professional: ${staff.name} (${staff.id})`);

  // 3. Fetch patient (patients)
  let patient;
  const patientRes = await client.query("SELECT id, name FROM patients WHERE clinic_id = $1 LIMIT 1;", [clinic.id]);
  if (patientRes.rows.length === 0) {
    console.log("No patients found for this clinic. Creating a test patient...");
    const newPatientRes = await client.query(
      `INSERT INTO patients (clinic_id, name, phone, email) 
       VALUES ($1, $2, $3, $4) RETURNING id, name;`,
      [clinic.id, "Paciente de Teste Antigravity", "11999999999", "teste.paciente@leadpluz.com.br"]
    );
    patient = newPatientRes.rows[0];
    console.log(`Created test patient: ${patient.name} (${patient.id})`);
  } else {
    patient = patientRes.rows[0];
    console.log(`Using patient: ${patient.name} (${patient.id})`);
  }

  // 4. Perform a test appointment insert
  const start_time = new Date();
  start_time.setHours(10, 0, 0, 0); // 10:00 AM today
  const end_time = new Date(start_time);
  end_time.setHours(11, 0, 0, 0); // 11:00 AM today

  console.log("\nInserting test appointment...");
  const insertRes = await client.query(
    `INSERT INTO appointments (
      clinic_id, 
      patient_id, 
      professional_id, 
      type, 
      status, 
      start_time, 
      end_time, 
      notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;`,
    [
      clinic.id,
      patient.id,
      staff.id,
      "Limpeza de Pele Profunda",
      "confirmed",
      start_time.toISOString(),
      end_time.toISOString(),
      "Agendamento de teste para validar estabilidade da tela."
    ]
  );
  
  const newApptId = insertRes.rows[0].id;
  console.log(`Successfully inserted appointment! ID: ${newApptId}`);

  // 5. Query it back to verify
  const verifyRes = await client.query("SELECT * FROM appointments WHERE id = $1;", [newApptId]);
  console.log("\nVerified appointment details in DB:", verifyRes.rows[0]);

  await client.end();
}

main().catch(console.error);
