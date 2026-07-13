const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

const accountId = 'ef927bc1-5aab-4728-a24b-9a85c4f66b2c';
const patientPhones = ['5521976640033', '5521966177727', '5511977791981', '5511991897375', '5521990525962'];

async function run() {
  try {
    await client.connect();
    
    // Get all contacts for Marcelle that do NOT match the real patient phones
    const contactsRes = await client.query(
      `SELECT id, name, phone FROM contacts 
       WHERE account_id = $1 
       AND NOT (phone = ANY($2));`,
      [accountId, patientPhones]
    );

    console.log(`Found ${contactsRes.rows.length} leaked contacts to delete.`);

    if (contactsRes.rows.length === 0) {
      console.log('No contacts to delete.');
      return;
    }

    const contactIds = contactsRes.rows.map(r => r.id);

    // 1. Delete messages in conversations belonging to these contacts
    console.log('Deleting messages...');
    const delMsgs = await client.query(
      `DELETE FROM messages 
       WHERE conversation_id IN (
         SELECT id FROM conversations WHERE contact_id = ANY($1)
       );`,
      [contactIds]
    );
    console.log(`Deleted ${delMsgs.rowCount} messages.`);

    // 2. Delete conversations belonging to these contacts
    console.log('Deleting conversations...');
    const delConvs = await client.query(
      `DELETE FROM conversations WHERE contact_id = ANY($1);`,
      [contactIds]
    );
    console.log(`Deleted ${delConvs.rowCount} conversations.`);

    // 3. Delete contacts
    console.log('Deleting contacts...');
    const delContacts = await client.query(
      `DELETE FROM contacts WHERE id = ANY($1);`,
      [contactIds]
    );
    console.log(`Deleted ${delContacts.rowCount} contacts.`);

    console.log('=== CLEANUP COMPLETED SUCCESSFULLY ===');
  } catch (err) {
    console.error('Cleanup failed:', err);
  } finally {
    await client.end();
  }
}

run();
