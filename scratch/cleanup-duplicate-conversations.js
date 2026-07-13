const { createClient } = require('@supabase/supabase-js');

// Read from env
require('dotenv').config({ path: '.env.local' });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://scrhexfcbtdyubehbzml.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching conversations...');
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error:', error);
    return;
  }

  // Find duplicates by (account_id, contact_id)
  const map = {};
  for (const c of convs) {
    const key = `${c.account_id}:${c.contact_id}`;
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(c);
  }

  for (const [key, list] of Object.entries(map)) {
    if (list.length > 1) {
      console.log(`Duplicate found for key ${key}: ${list.length} conversations`);
      const survivor = list[0]; // Earliest created_at
      const losers = list.slice(1);
      const loserIds = losers.map(l => l.id);

      console.log(`Survivor: ${survivor.id}`);
      console.log(`Losers: ${loserIds.join(', ')}`);

      // 1. Move messages
      console.log('Moving messages...');
      const { data: msgData, error: msgErr } = await supabase
        .from('messages')
        .update({ conversation_id: survivor.id })
        .in('conversation_id', loserIds);
      if (msgErr) console.error('Error moving messages:', msgErr);

      // 2. Move other tables
      console.log('Moving followups...');
      const { error: fErr } = await supabase
        .from('deal_followups')
        .update({ conversation_id: survivor.id })
        .in('conversation_id', loserIds);
      if (fErr) console.error('Error moving followups:', fErr);

      // 3. Delete duplicates
      console.log('Deleting duplicate conversations...');
      const { error: delErr } = await supabase
        .from('conversations')
        .delete()
        .in('id', loserIds);
      if (delErr) console.error('Error deleting duplicate conversations:', delErr);
      
      console.log('Merge complete!');
    }
  }

  console.log('All duplicates cleaned up.');
}

run();
