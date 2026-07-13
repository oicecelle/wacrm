const { createClient } = require('@supabase/supabase-js');

// Read from env
require('dotenv').config({ path: '.env.local' });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  require('dotenv').config({ path: '.env' });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://scrhexfcbtdyubehbzml.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: audios, error } = await supabase
    .from('messages')
    .select('*')
    .eq('content_type', 'audio')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching audios:', error);
    return;
  }

  console.log(`Latest 10 audio messages:`);
  audios.forEach(m => {
    console.log(`- Msg ID: ${m.id}, Sender: ${m.sender_type}, Media URL: ${m.media_url}, Status: ${m.status}, Created At: ${m.created_at}`);
  });
}

check();
