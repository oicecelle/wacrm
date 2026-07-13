const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://scrhexfcbtdyubehbzml.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk'
);

async function run() {
  console.log('=== INSPECTING AUDIO MESSAGES ===\n');

  // Let's check the messages with media_url is null or not
  const { data: messages, error } = await supabase
    .from('messages')
    .select('*')
    .eq('content_type', 'audio')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error(error);
    return;
  }

  for (const msg of messages) {
    console.log(`Msg ID: ${msg.id}`);
    console.log(`Sender: ${msg.sender_type}`);
    console.log(`Message ID (from WA): ${msg.message_id}`);
    console.log(`Media URL: ${msg.media_url}`);
    console.log(`Content Text: ${msg.content_text}`);
    console.log(`Created At: ${msg.created_at}`);

    // Fetch webhook logs for this message_id
    const { data: logs } = await supabase
      .from('whatsapp_webhook_logs')
      .select('*')
      .eq('message_id', msg.message_id)
      .limit(1);

    if (logs && logs.length > 0) {
      console.log('Webhook Log payload preview:');
      console.log(JSON.stringify(logs[0].payload, null, 2).substring(0, 1000));
    } else {
      console.log('No webhook log found for this message_id');
    }
    console.log('-----------------------------------------\n');
  }
}

run();
