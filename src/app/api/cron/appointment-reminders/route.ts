import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher';

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk')
    );
  }
  return _adminClient;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get('authorization');
    const cronKey = searchParams.get('key');
    
    // Simple cron security check: match env CRON_SECRET or default fallback
    const expectedKey = getEnv('CRON_SECRET', 'leadpluz_cron_secret_key_123');
    if (cronKey !== expectedKey && authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = supabaseAdmin();
    console.log('[Reminder Cron] Fetching active reminder configurations...');

    const { data: configs, error: configErr } = await db
      .from('appointment_reminders_config')
      .select('*')
      .eq('is_active', true);

    if (configErr) {
      console.error('[Reminder Cron] Error fetching configurations:', configErr);
      return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 });
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ status: 'success', message: 'No active reminder configurations found.' });
    }

    let totalSent = 0;

    for (const config of configs) {
      const clinicId = config.clinic_id;
      const hoursBeforeArray = config.hours_before || [24, 2];
      const messageTemplate = config.message_template;

      // Get WhatsApp configuration for this clinic
      const { data: wsConfig } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', clinicId)
        .maybeSingle();

      if (!wsConfig) {
        console.warn(`[Reminder Cron] No active WhatsApp config found for clinic: ${clinicId}. Skipping reminders.`);
        continue;
      }

      for (const hoursBefore of hoursBeforeArray) {
        // Find appointments starting between (now + hoursBefore) and (now + hoursBefore + 1 hour)
        const now = new Date();
        const startWindow = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000);
        const endWindow = new Date(startWindow.getTime() + 60 * 60 * 1000); // 1-hour window

        console.log(`[Reminder Cron] Clinic: ${clinicId} | Milestone: ${hoursBefore}h | Window: ${startWindow.toISOString()} to ${endWindow.toISOString()}`);

        const { data: appointments, error: apptErr } = await db
          .from('appointments')
          .select('*, patient:patients(*)')
          .eq('clinic_id', clinicId)
          .eq('status', 'provisional')
          .gte('start_time', startWindow.toISOString())
          .lt('start_time', endWindow.toISOString());

        if (apptErr) {
          console.error(`[Reminder Cron] Error fetching appointments for clinic ${clinicId}:`, apptErr);
          continue;
        }

        if (!appointments || appointments.length === 0) {
          continue;
        }

        for (const appt of appointments) {
          const patient = appt.patient;
          if (!patient) continue;

          const phone = patient.phone || patient.whatsapp;
          if (!phone) continue;

          // Check if reminder was already sent for this appointment and milestone
          const { data: alreadySent } = await db
            .from('contact_timeline')
            .select('id')
            .eq('account_id', clinicId)
            .eq('contact_id', patient.id)
            .eq('event_type', 'reminder_sent')
            .contains('metadata', { appointment_id: appt.id, hours_before: hoursBefore })
            .limit(1)
            .maybeSingle();

          if (alreadySent) {
            console.log(`[Reminder Cron] Reminder already sent for appt: ${appt.id} milestone: ${hoursBefore}h. Skipping.`);
            continue;
          }

          // Format details
          const formattedDate = new Date(appt.start_time).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const formattedTime = new Date(appt.start_time).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

          // Interpolate template
          let text = messageTemplate
            .replace(/\{\{nome\}\}/g, patient.name || 'Cliente')
            .replace(/\{\{data\}\}/g, formattedDate)
            .replace(/\{\{hora\}\}/g, formattedTime)
            .replace(/\{\{procedimento\}\}/g, appt.type || 'Consulta');

          console.log(`[Reminder Cron] Sending reminder to: ${phone} | Text: ${text}`);

          // Send message
          const dispatchRes = await dispatchSendMessage({
            config: {
              provider_type: wsConfig.provider_type,
              phone_number_id: wsConfig.phone_number_id,
              access_token: wsConfig.access_token,
              uazapi_token: wsConfig.uazapi_token,
              uazapi_base_url: wsConfig.uazapi_base_url,
              uazapi_instance_name: wsConfig.uazapi_instance_name,
            },
            to: phone,
            messageType: 'text',
            content_text: text,
          });

          if (dispatchRes.success) {
            totalSent++;
            // Write timeline log
            await db.from('contact_timeline').insert({
              account_id: clinicId,
              contact_id: patient.id,
              event_type: 'reminder_sent',
              title: 'Lembrete de agendamento enviado',
              description: `Lembrete automático de agendamento enviado via WhatsApp (${hoursBefore}h antes).`,
              metadata: { appointment_id: appt.id, hours_before: hoursBefore, message: text }
            });
          } else {
            console.error(`[Reminder Cron] Failed to send WhatsApp reminder to ${phone}:`, dispatchRes.error);
          }
        }
      }
    }

    return NextResponse.json({ status: 'success', sent: totalSent });
  } catch (err: any) {
    console.error('[Reminder Cron] Cron execution error:', err);
    return NextResponse.json({ error: 'Server error', details: err.message }, { status: 500 });
  }
}
