import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher';

// Lazy-initialized admin client to bypass RLS for background sweeps
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

/**
 * GET /api/cron/notifications
 *
 * Background sweeper for birthdays and appointment reminders.
 * Should be called hourly.
 */
export async function GET(request: Request) {
  try {
    const cronSecret = request.headers.get('x-cron-secret') || new URL(request.url).searchParams.get('secret');
    const expectedSecret = process.env.AUTOMATION_CRON_SECRET;

    if (!expectedSecret) {
      return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
    }

    if (cronSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || 'http';
    const triggerApiUrl = `${proto}://${host}/api/whatsapp/trigger`;

    const db = supabaseAdmin();
    const now = new Date();

    // 1. Get all connected WhatsApp configs
    const { data: configs, error: configsErr } = await db
      .from('whatsapp_config')
      .select('*')
      .eq('status', 'connected');

    if (configsErr) throw configsErr;
    if (!configs || configs.length === 0) {
      return NextResponse.json({ success: true, message: 'No connected WhatsApp channels' });
    }

    const results: any[] = [];

    for (const config of configs) {
      const accountId = config.account_id;
      const timezone = config.timezone || 'America/Sao_Paulo';

      // Get current local date/time info for timezone
      const localHourStr = now.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', hour12: false });
      const currentHour = parseInt(localHourStr) || 0;

      // Local date parts for birthday matching
      const localMonthDayStr = now.toLocaleDateString('pt-BR', {
        timeZone: timezone,
        month: '2-digit',
        day: '2-digit',
      }); // Format "DD/MM"
      const [localDay, localMonth] = localMonthDayStr.split('/');
      const targetBirthdaySuffix = `-${localMonth}-${localDay}`; // "-MM-DD"

      // A. ANNIVERSARY SWEEP
      // Fetch active anniversary templates
      const { data: bdayTemplates } = await db
        .from('system_message_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('event_type', 'aniversario')
        .eq('is_active', true);

      if (bdayTemplates && bdayTemplates.length > 0) {
        for (const template of bdayTemplates) {
          const sendTime = template.trigger_config?.send_time || '09:00';
          const templateHour = parseInt(sendTime.split(':')[0]) || 9;

          // Process only when current local hour matches configured send hour
          if (currentHour === templateHour) {
            // Find patients with birthday today
            const { data: patients } = await db
              .from('patients')
              .select('id, name, phone, birthday')
              .eq('clinic_id', accountId);

            if (patients && patients.length > 0) {
              const bdayPatients = patients.filter((p: any) => p.birthday && p.birthday.endsWith(targetBirthdaySuffix));

              for (const patient of bdayPatients) {
                // Check duplicate send today
                const todayStart = new Date(now);
                todayStart.setHours(0, 0, 0, 0);

                const { data: alreadySent } = await db
                  .from('patient_timeline')
                  .select('id')
                  .eq('patient_id', patient.id)
                  .eq('event_type', 'whatsapp')
                  .filter('payload->>event_type', 'eq', 'aniversario')
                  .filter('payload->>template_id', 'eq', template.id)
                  .gte('created_at', todayStart.toISOString())
                  .maybeSingle();

                if (!alreadySent) {
                  // Trigger notification
                  const triggerRes = await fetch(triggerApiUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-cron-secret': expectedSecret,
                    },
                    body: JSON.stringify({
                      event_type: 'aniversario',
                      patient_id: patient.id,
                      account_id: accountId,
                      user_id: config.user_id,
                      metadata: {
                        paciente: patient.name,
                        phone: patient.phone,
                      },
                    }),
                  }).catch(e => console.error('Error hitting trigger anniversary:', e));

                  results.push({
                    account_id: accountId,
                    event_type: 'aniversario',
                    patient_id: patient.id,
                    success: !!triggerRes?.ok,
                  });
                }
              }
            }
          }
        }
      }

      // B. APPOINTMENT REMINDERS SWEEP
      // Fetch active reminder templates
      const { data: reminderTemplates } = await db
        .from('system_message_templates')
        .select('*')
        .eq('account_id', accountId)
        .in('event_type', ['lembrete_agendamento', 'confirmacao_agendamento', 'pre_atendimento'])
        .eq('is_active', true);

      if (reminderTemplates && reminderTemplates.length > 0) {
        // Fetch appointments starting in next 3 days
        const limitDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        const { data: appts } = await db
          .from('appointments')
          .select(`
            id,
            patient_id,
            professional_id,
            room_id,
            type,
            status,
            start_time,
            patient:patients(id, name, phone),
            professional:clinic_users(name)
          `)
          .eq('clinic_id', accountId)
          .in('status', ['provisional', 'confirmed'])
          .gte('start_time', now.toISOString())
          .lte('start_time', limitDate.toISOString());

        if (appts && appts.length > 0) {
          for (const appt of appts) {
            const patientObj = (appt.patient as any);
            if (!patientObj || !patientObj.phone) continue;

            const startObj = new Date(appt.start_time);

            for (const template of reminderTemplates) {
              const trig = template.trigger_config || {};
              const type = trig.type || 'relative';

              let targetTime: Date | null = null;

              if (type === 'relative') {
                const offsetVal = trig.offset_value ?? 24;
                const offsetUnit = trig.offset_unit || 'hours';

                const multiplier = offsetUnit === 'days' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
                targetTime = new Date(startObj.getTime() - offsetVal * multiplier);
              } else if (type === 'absolute') {
                // Absolute: Day before at fix hour
                const sendTime = trig.send_time || '09:00';
                const [targetHour, targetMin] = sendTime.split(':').map(Number);

                // Get date of appointment in clinic's timezone
                const apptLocalStr = startObj.toLocaleDateString('en-US', { timeZone: timezone }); // MM/DD/YYYY
                const apptLocalDate = new Date(apptLocalStr);

                // Substract 1 day
                apptLocalDate.setDate(apptLocalDate.getDate() - 1);
                apptLocalDate.setHours(targetHour || 9, targetMin || 0, 0, 0);

                // Convert local date time to UTC/TargetTime
                // Simple representation in local timezone matching format
                const apptLocalISO = `${apptLocalDate.getFullYear()}-${String(apptLocalDate.getMonth() + 1).padStart(2, '0')}-${String(apptLocalDate.getDate()).padStart(2, '0')}T${sendTime}:00`;
                
                // Parse it back relative to the clinic's local timezone
                // We use standard Intl date format trick to offset it or just construct Date
                targetTime = new Date(apptLocalISO);
              }

              if (targetTime && now >= targetTime) {
                // Check if already sent
                const { data: alreadySent } = await db
                  .from('patient_timeline')
                  .select('id')
                  .eq('patient_id', patientObj.id)
                  .eq('event_type', 'whatsapp')
                  .filter('payload->>appointment_id', 'eq', appt.id)
                  .filter('payload->>template_id', 'eq', template.id)
                  .maybeSingle();

                if (!alreadySent) {
                  const professionalName = appt.professional?.name || '';
                  const formattedDate = startObj.toLocaleDateString('pt-BR', { timeZone: timezone });
                  const formattedTime = startObj.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });

                  // Trigger notification
                  const triggerRes = await fetch(triggerApiUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'x-cron-secret': expectedSecret,
                    },
                    body: JSON.stringify({
                      event_type: template.event_type,
                      appointment_id: appt.id,
                      patient_id: patientObj.id,
                      account_id: accountId,
                      user_id: config.user_id,
                      metadata: {
                        paciente: patientObj.name,
                        phone: patientObj.phone,
                        data: formattedDate,
                        hora: formattedTime,
                        profissional: professionalName,
                        procedimento: appt.type || '',
                      },
                    }),
                  }).catch(e => console.error('Error hitting trigger reminders:', e));

                  results.push({
                    account_id: accountId,
                    event_type: template.event_type,
                    appointment_id: appt.id,
                    success: !!triggerRes?.ok,
                  });
                }
              }
            }
          }
        }
      }

      // C. METRICS REPORT SWEEP
      const reportConfig = config.metric_reports_config;
      if (reportConfig && reportConfig.enabled && reportConfig.recipient_phone) {
        const reportTime = reportConfig.time || '17:00';
        const reportHour = parseInt(reportTime.split(':')[0]) || 17;

        if (currentHour === reportHour) {
          const todayDateStr = now.toISOString().slice(0, 10);
          let updatedConfig = false;
          const updatedReportConfig = { ...reportConfig };

          // 1. Daily Report
          if (reportConfig.frequency?.includes('daily') && reportConfig.last_daily_sent !== todayDateStr) {
            const reportText = await generateReportMessage(db, accountId, 'diario');
            const sent = await sendReportMessage(config, reportConfig.recipient_phone, reportText);
            if (sent) {
              updatedReportConfig.last_daily_sent = todayDateStr;
              updatedConfig = true;
            }
          }

          // 2. Biweekly Report
          const dayOfMonth = now.getDate();
          const isBiweeklyDay = dayOfMonth === 15 || dayOfMonth === 28 || dayOfMonth === 30 || dayOfMonth === 31;
          if (reportConfig.frequency?.includes('biweekly') && isBiweeklyDay && reportConfig.last_biweekly_sent !== todayDateStr) {
            const reportText = await generateReportMessage(db, accountId, 'quinzenal');
            const sent = await sendReportMessage(config, reportConfig.recipient_phone, reportText);
            if (sent) {
              updatedReportConfig.last_biweekly_sent = todayDateStr;
              updatedConfig = true;
            }
          }

          // 3. Monthly Report
          if (reportConfig.frequency?.includes('monthly') && dayOfMonth === 1 && reportConfig.last_monthly_sent !== todayDateStr) {
            const reportText = await generateReportMessage(db, accountId, 'mensal');
            const sent = await sendReportMessage(config, reportConfig.recipient_phone, reportText);
            if (sent) {
              updatedReportConfig.last_monthly_sent = todayDateStr;
              updatedConfig = true;
            }
          }

          if (updatedConfig) {
            await db
              .from('whatsapp_config')
              .update({ metric_reports_config: updatedReportConfig })
              .eq('id', config.id);

            results.push({
              account_id: accountId,
              event_type: 'metric_report_sent',
              success: true,
            });
          }
        }
      }
    }

    return NextResponse.json({ success: true, processed: results });
  } catch (error: any) {
    console.error('Error in cron GET:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

// ─── Helpers for Metric Reports ───

async function sendReportMessage(config: any, to: string, text: string): Promise<boolean> {
  try {
    const res = await dispatchSendMessage({
      config: {
        provider_type: config.provider_type || 'meta',
        phone_number_id: config.phone_number_id,
        access_token: config.access_token,
        uazapi_token: config.uazapi_token,
        uazapi_base_url: config.uazapi_base_url,
        uazapi_instance_name: config.uazapi_instance_name,
      },
      to,
      messageType: 'text',
      content_text: text,
    });
    return res.success;
  } catch (err) {
    console.error('Error sending report message:', err);
    return false;
  }
}

async function generateReportMessage(db: any, accountId: string, type: 'diario' | 'quinzenal' | 'mensal'): Promise<string> {
  const now = new Date();
  const days = type === 'diario' ? 1 : type === 'quinzenal' ? 15 : 30;
  const startRange = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  // 1. Fetch clinic name
  const { data: clinic } = await db.from('accounts').select('name').eq('id', accountId).maybeSingle();
  const clinicName = clinic?.name || 'LeadPluz Clínica';

  // 2. Fetch metrics
  const { count: leadsCount } = await db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('contact_type', 'lead')
    .gte('created_at', startRange);

  const { count: rescuesCount } = await db
    .from('contact_timeline')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('event_type', 'payment')
    .gte('created_at', startRange);

  const { count: followupsCount } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_type', 'bot')
    .gte('created_at', startRange);

  const { count: bookingsCount } = await db
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', accountId)
    .gte('created_at', startRange);

  const { count: compCount } = await db
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', accountId)
    .in('status', ['completed', 'confirmed'])
    .gte('created_at', startRange);

  const { count: cancCount } = await db
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', accountId)
    .in('status', ['cancelled', 'no_show'])
    .gte('created_at', startRange);

  const { count: unansweredCount } = await db
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .gt('unread_count', 0);

  const title = type === 'diario' ? 'Diário' : type === 'quinzenal' ? 'Quinzenal' : 'Mensal';
  
  return `📊 *LeadPluz CRM — Relatório ${title}*
Clínica: ${clinicName}
Data: ${new Date().toLocaleDateString('pt-BR')}

📈 *Indicadores Principais (${days} dia(s)):*
• Novos Leads: ${leadsCount || 0}
• Resgates Efetuados: ${rescuesCount || 0}
• Mensagens Enviadas: ${followupsCount || 0}
• Agendamentos Criados: ${bookingsCount || 0}
• Comparecimentos: ${compCount || 0}
• Cancelamentos: ${cancCount || 0}

⚠️ *Atenção (Inbox):*
• Leads Aguardando Retorno: ${unansweredCount || 0}

_Relatório enviado de forma automática._`;
}
