const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
client.connect().then(async () => {
  const res = await client.query("SELECT c.*, conv.id as conv_id, conv.is_pinned, conv.last_message_text, conv.last_message_at FROM public.contacts c LEFT JOIN public.conversations conv ON conv.contact_id = c.id WHERE c.name ILIKE '%Igor%' OR c.company ILIKE '%H2%'");
  console.log('IGOR SIMOR CONVERSATIONS:', JSON.stringify(res.rows, null, 2));
  await client.end();
}).catch(console.error);
