const { Pool } = require('pg');

const connectionString = 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres';
const pool = new Pool({ connectionString });

const userId = '71523537-0541-4ab6-845e-7c576819f881'; // marcelle.profissional@gmail.com
const clinicId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';

async function run() {
  console.log('=== CLINIC USERS RLS TRACE ===');
  const client = await pool.connect();
  try {
    // 1. Check policies on clinic_users table
    console.log('\n--- Active Policies on clinic_users ---');
    const policiesRes = await client.query(`
      SELECT policyname, cmd, qual, with_check 
      FROM pg_policies 
      WHERE tablename = 'clinic_users'
    `);
    console.log(policiesRes.rows);

    // 2. Query as superuser to verify row exists
    console.log('\n--- Querying as Superuser (RLS disabled) ---');
    const directRes = await client.query(`
      SELECT id, clinic_id, user_id, name, email, role, is_active 
      FROM clinic_users 
      WHERE user_id = $1
    `, [userId]);
    console.log(directRes.rows);

    // 3. Query as authenticated user
    console.log('\n--- Querying as Authenticated User (RLS enabled) ---');
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    
    const authenticatedRes = await client.query(`
      SELECT id, clinic_id, user_id, name, email, role, is_active 
      FROM clinic_users
    `);
    console.log('Returned rows under RLS:', authenticatedRes.rows);
    
    await client.query('COMMIT');
  } catch (err) {
    console.error('Error during trace:', err);
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
  } finally {
    client.release();
    await pool.end();
  }
}

run();
