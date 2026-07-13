const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.scrhexfcbtdyubehbzml:%40Marcelle%232026@aws-0-us-west-2.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== CONNECTING TO DB TO ADD last_message_from_me ===\n');
  await client.connect();

  try {
    // 1. Add column
    console.log('Adding last_message_from_me column to conversations...');
    await client.query(`
      ALTER TABLE public.conversations
      ADD COLUMN IF NOT EXISTS last_message_from_me boolean DEFAULT false;
    `);

    // 2. Backfill existing records
    console.log('Backfilling last_message_from_me values...');
    await client.query(`
      UPDATE public.conversations c
      SET last_message_from_me = (
        SELECT sender_type IN ('agent', 'bot')
        FROM public.messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1 FROM public.messages m WHERE m.conversation_id = c.id
      );
    `);

    // 3. Create function and trigger
    console.log('Creating database trigger for automatic updates...');
    await client.query(`
      CREATE OR REPLACE FUNCTION public.update_last_message_from_me()
      RETURNS TRIGGER AS $$
      BEGIN
        UPDATE public.conversations
        SET last_message_from_me = (NEW.sender_type IN ('agent', 'bot'))
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      DROP TRIGGER IF EXISTS trigger_update_last_message_from_me ON public.messages;
      
      CREATE TRIGGER trigger_update_last_message_from_me
      AFTER INSERT ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.update_last_message_from_me();
    `);

    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Error during migration:', err.message);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
