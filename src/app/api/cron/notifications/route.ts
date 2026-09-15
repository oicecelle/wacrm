import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher';

function interpolateSystemTemplate(text: string, vars: Record<string, string>): string {
  let result = text;
  Object.entries(vars).forEach(([key, val]) => {
    result = result.replaceAll(key, val || '');
  });
  return result;
}

function getTemplateParamsInOrder(text: string, vars: Record<string, string>): string[] {
  const matches: string[] = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const placeholder = `{{${match[1]}}}`;
    if (vars[placeholder] !== undefined) {
      matches.push(vars[placeholder]);
    }
  }
  return matches;
}

async function getOrCreateConversation(supabase: any, contactId: string, accountId: string, userId: string) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contactId,
      status: 'open',
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating conversation:', error);
    throw error;
  }

  return created.id;
}

async function findOrCreateContactForPatient(supabase: any, accountId: string, userId: string, phone: string, name: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('account_id', accountId)
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (existing) {
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: userId,
      phone: cleanPhone,
      name: name || cleanPhone,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error creating contact:', error);
    throw error;
  }

  return created.id;
}

// Lazy-initialized admin client to bypass RLS for background sweeps
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
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

      // A. SYNC ANNIVERSARY (BIRTHDAYS) FOR THIS CLINIC
      const { data: bdayTemplates } = await db
        .from('system_message_templates')
        .select('*')
        .eq('account_id', accountId)
        .eq('event_type', 'aniversario')
        .eq('is_active', true);

      if (bdayTemplates && bdayTemplates.length > 0) {
        // Find patients in this clinic
        const { data: patients } = await db
          .from('patients')
          .select('id, name, phone, birthday')
          .eq('clinic_id', accountId);

        if (patients && patients.length > 0) {
          for (const template of bdayTemplates) {
            const sendTime = template.trigger_config?.send_time || '09:00';

            for (const patient of patients) {
              if (!patient.birthday || !patient.phone) continue;

              const [, bdayMonth, bdayDay] = patient.birthday.split('-');
              if (!bdayMonth || !bdayDay) continue;

              const currentYear = now.getFullYear();
              let bdayDate = new Date(`${currentYear}-${bdayMonth}-${bdayDay}T${sendTime}:00`);

              if (bdayDate.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
                bdayDate = new Date(`${currentYear + 1}-${bdayMonth}-${bdayDay}T${sendTime}:00`);
              }

              const diffDays = (bdayDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
              if (diffDays >= 0 && diffDays <= 7) {
                const bdayYear = bdayDate.getFullYear();

                const { data: exists } = await db
                  .from('scheduled_notifications')
                  .select('id, status')
                  .eq('account_id', accountId)
                  .eq('patient_id', patient.id)
                  .eq('template_id', template.id)
                  .eq('event_type', 'aniversario')
                  .gte('scheduled_for', `${bdayYear}-01-01T00:00:00Z`)
                  .lte('scheduled_for', `${bdayYear}-12-31T23:59:59Z`)
                  .maybeSingle();

                if (!exists) {
                  const varsDict: Record<string, string> = {
                    '{{paciente}}': patient.name,
                    '{{clinica}}': config.clinic_name || 'Clínica',
                    '{{link}}': '#',
                  };
                  const messageText = interpolateSystemTemplate(template.message_text, varsDict);

                  await db.from('scheduled_notifications').insert({
                    account_id: accountId,
                    patient_id: patient.id,
                    event_type: 'aniversario',
                    template_id: template.id,
                    recipient_name: patient.name,
                    recipient_phone: patient.phone.replace(/\D/g, ''),
                    scheduled_for: bdayDate.toISOString(),
                    message_text: messageText,
                    variables: varsDict,
                    status: 'pending',
                  });
                }
              }
            }
          }
        }
      }

      // B. SYNC APPOINTMENT REMINDERS FOR THIS CLINIC
      const { data: reminderTemplates } = await db
        .from('system_message_templates')
        .select('*')
        .eq('account_id', accountId)
        .in('event_type', ['lembrete_agendamento', 'confirmacao_agendamento', 'pre_atendimento'])
        .eq('is_active', true);

      if (reminderTemplates && reminderTemplates.length > 0) {
        const limitDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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
            const professionalName = appt.professional?.name || '';

            const { data: clinicRow } = await db.from('accounts').select('name').eq('id', accountId).maybeSingle();
            const clinicName = clinicRow?.name || 'Clínica';

            const formattedDate = startObj.toLocaleDateString('pt-BR', { timeZone: timezone });
            const formattedTime = startObj.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });

            const varsDict: Record<string, string> = {
              '{{paciente}}': patientObj.name,
              '{{data}}': formattedDate,
              '{{hora}}': formattedTime,
              '{{profissional}}': professionalName,
              '{{clinica}}': clinicName,
              '{{procedimento}}': appt.type || '',
              '{{link}}': '#',
            };

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
                const sendTime = trig.send_time || '09:00';
                const [targetHour, targetMin] = sendTime.split(':').map(Number);
                const apptLocalStr = startObj.toLocaleDateString('en-US', { timeZone: timezone });
                const apptLocalDate = new Date(apptLocalStr);
                apptLocalDate.setDate(apptLocalDate.getDate() - 1);
                apptLocalDate.setHours(targetHour || 9, targetMin || 0, 0, 0);

                const apptLocalISO = `${apptLocalDate.getFullYear()}-${String(apptLocalDate.getMonth() + 1).padStart(2, '0')}-${String(apptLocalDate.getDate()).padStart(2, '0')}T${sendTime}:00`;
                targetTime = new Date(apptLocalISO);
              }

              if (targetTime) {
                const { data: exists } = await db
                  .from('scheduled_notifications')
                  .select('id, status, scheduled_for')
                  .eq('account_id', accountId)
                  .eq('appointment_id', appt.id)
                  .eq('template_id', template.id)
                  .maybeSingle();

                const messageText = interpolateSystemTemplate(template.message_text, varsDict);

                if (!exists) {
                  if (targetTime.getTime() >= now.getTime() - 2 * 60 * 60 * 1000) {
                    await db.from('scheduled_notifications').insert({
                      account_id: accountId,
                      patient_id: patientObj.id,
                      appointment_id: appt.id,
                      event_type: template.event_type,
                      template_id: template.id,
                      recipient_name: patientObj.name,
                      recipient_phone: patientObj.phone.replace(/\D/g, ''),
                      scheduled_for: targetTime.toISOString(),
                      message_text: messageText,
                      variables: varsDict,
                      status: 'pending',
                    });
                  }
                } else if (exists.status === 'pending') {
                  const existingTime = new Date(exists.scheduled_for);
                  if (Math.abs(existingTime.getTime() - targetTime.getTime()) > 60 * 1000) {
                    await db
                      .from('scheduled_notifications')
                      .update({
                        scheduled_for: targetTime.toISOString(),
                        message_text: messageText,
                        variables: varsDict,
                      })
                      .eq('id', exists.id);
                  }
                }
              }
            }
          }
        }
      }

      // C. CLEAN UP PENDING FOR THIS CLINIC
      const { data: pendingNotifs } = await db
        .from('scheduled_notifications')
        .select('id, appointment_id')
        .eq('account_id', accountId)
        .eq('status', 'pending')
        .not('appointment_id', 'is', null);

      if (pendingNotifs && pendingNotifs.length > 0) {
        const apptIds = pendingNotifs.map((n: any) => n.appointment_id);
        const { data: activeAppts } = await db
          .from('appointments')
          .select('id, status, start_time')
          .in('id', apptIds);

        const activeApptIds = new Set((activeAppts ?? []).map((a: any) => a.id));
        const cancelledOrPastApptIds = new Set(
          (activeAppts ?? [])
            .filter((a: any) => !['provisional', 'confirmed'].includes(a.status) || new Date(a.start_time).getTime() < now.getTime())
            .map((a: any) => a.id)
        );

        for (const notif of pendingNotifs) {
          if (!activeApptIds.has(notif.appointment_id) || cancelledOrPastApptIds.has(notif.appointment_id)) {
            await db
              .from('scheduled_notifications')
              .delete()
              .eq('id', notif.id);
          }
        }
      }

    // D. DISPATCH DUE NOTIFICATIONS FOR THIS CLINIC
    const { data: dueNotifications } = await db
      .from('scheduled_notifications')
      .select('*, template:system_message_templates(*)')
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .lte('scheduled_for', now.toISOString());

    if (dueNotifications && dueNotifications.length > 0) {
      for (const notif of dueNotifications) {
        const template = notif.template;
        if (!template || !template.is_active) {
          await db
            .from('scheduled_notifications')
            .update({
              status: 'failed',
              error_message: 'Message template deactivated',
              updated_at: new Date().toISOString(),
            })
            .eq('id', notif.id);
          continue;
        }

        const provider = template.provider_type || config.provider_type;
        let success = false;
        let messageId = null;
        let errMsg = null;

        if (provider === 'uazapi') {
          const res = await dispatchSendMessage({
            config: {
              provider_type: 'uazapi',
              uazapi_token: config.uazapi_token,
              uazapi_base_url: config.uazapi_base_url,
              uazapi_instance_name: config.uazapi_instance_name,
            },
            to: notif.recipient_phone,
            messageType: 'text',
            content_text: notif.message_text,
          });

          success = res.success;
          messageId = res.messageId;
          errMsg = res.error;
        } else {
          const templateParams = getTemplateParamsInOrder(template.message_text, notif.variables || {});
          const res = await dispatchSendMessage({
            config: {
              provider_type: 'meta',
              phone_number_id: config.phone_number_id,
              access_token: config.access_token,
            },
            to: notif.recipient_phone,
            messageType: 'template',
            template_name: template.meta_template_name,
            template_language: template.meta_template_language || 'pt_BR',
            template_params: templateParams,
          });

          success = res.success;
          messageId = res.messageId;
          errMsg = res.error;
        }

        if (success) {
          await db
            .from('scheduled_notifications')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', notif.id);

          if (notif.patient_id) {
            await db.from('patient_timeline').insert({
              patient_id: notif.patient_id,
              event_type: 'whatsapp',
              title: provider === 'uazapi' ? `Mensagem enviada via Uazapi: ${template.name}` : `Template Meta enviado: ${template.meta_template_name}`,
              payload: {
                event_type: notif.event_type,
                phone: notif.recipient_phone,
                message: notif.message_text,
                appointment_id: notif.appointment_id,
                template_id: template.id,
              },
            });

            try {
              const sysUserId = config.user_id;
              const contactId = await findOrCreateContactForPatient(db, notif.account_id, sysUserId, notif.recipient_phone, notif.recipient_name);
              const conversationId = await getOrCreateConversation(db, contactId, notif.account_id, sysUserId);

              await db.from('messages').insert({
                conversation_id: conversationId,
                sender_type: 'bot',
                content_type: provider === 'uazapi' ? 'text' : 'template',
                template_name: provider === 'uazapi' ? null : template.meta_template_name,
                content_text: notif.message_text,
                message_id: messageId || `${provider}-${Date.now()}`,
                status: 'sent',
              });

              await db.from('conversations').update({
                last_message_text: provider === 'uazapi' ? notif.message_text : `[Template: ${template.meta_template_name}]`,
                last_message_at: new Date().toISOString(),
              }).eq('id', conversationId);
            } catch (dbErr) {
              console.error('Failed to log message in chat history:', dbErr);
            }
          }
        } else {
          await db
            .from('scheduled_notifications')
            .update({
              status: 'failed',
              error_message: errMsg || 'Unknown sending error',
              updated_at: new Date().toISOString(),
            })
            .eq('id', notif.id);
        }

        results.push({
          notification_id: notif.id,
          success,
          error: errMsg,
        });
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

async function fetchMetricsForPeriod(db: any, accountId: string, startIso: string, endIso: string) {
  const [
    { count: leads },
    { count: rescues },
    { count: messages },
    { count: bookings },
    { count: confirmed },
    { count: attended },
    { count: cancelled },
    { count: noShow }
  ] = await Promise.all([
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('contact_type', 'lead').gte('created_at', startIso).lte('created_at', endIso),
    db.from('contact_timeline').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('event_type', 'payment').gte('created_at', startIso).lte('created_at', endIso),
    db.from('messages').select('id', { count: 'exact', head: true }).eq('sender_type', 'bot').gte('created_at', startIso).lte('created_at', endIso),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).gte('created_at', startIso).lte('created_at', endIso),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).eq('status', 'confirmed').gte('created_at', startIso).lte('created_at', endIso),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).eq('status', 'attended').gte('created_at', startIso).lte('created_at', endIso),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).eq('status', 'cancelled').gte('created_at', startIso).lte('created_at', endIso),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', accountId).eq('status', 'no_show').gte('created_at', startIso).lte('created_at', endIso),
  ]);

  return {
    leads: leads || 0,
    rescues: rescues || 0,
    messages: messages || 0,
    bookings: bookings || 0,
    confirmed: confirmed || 0,
    attended: attended || 0,
    cancelled: cancelled || 0,
    noShow: noShow || 0,
  };
}

async function generateReportMessage(db: any, accountId: string, type: 'diario' | 'quinzenal' | 'mensal'): Promise<string> {
  const now = new Date();
  const days = type === 'diario' ? 1 : type === 'quinzenal' ? 15 : 30;

  const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const currentEnd = now.toISOString();

  const previousStart = new Date(now.getTime() - 2 * days * 24 * 60 * 60 * 1000).toISOString();
  const previousEnd = currentStart;

  // 1. Fetch clinic name
  const { data: clinic } = await db.from('accounts').select('name').eq('id', accountId).maybeSingle();
  const clinicName = clinic?.name || 'LEAD PLUZ Clínica';

  // 2. Fetch metrics in parallel
  const [currentMetrics, previousMetrics, unansweredRes, dealsObjections] = await Promise.all([
    fetchMetricsForPeriod(db, accountId, currentStart, currentEnd),
    fetchMetricsForPeriod(db, accountId, previousStart, previousEnd),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gt('unread_count', 0),
    db.from('deals').select('main_objection').eq('account_id', accountId).not('main_objection', 'is', null).gte('created_at', currentStart).lte('created_at', currentEnd),
  ]);

  const unansweredCount = unansweredRes.count || 0;

  // 3. Process objections
  const objectionsMap: Record<string, number> = {};
  (dealsObjections.data || []).forEach((d: any) => {
    if (d.main_objection) {
      objectionsMap[d.main_objection] = (objectionsMap[d.main_objection] || 0) + 1;
    }
  });

  const sortedObjections = Object.entries(objectionsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([obj, count]) => `${obj} (${count})`);

  const objectionsText = sortedObjections.length > 0 ? sortedObjections.join(', ') : 'Nenhuma registrada';

  // Helper to format changes
  const formatChange = (curr: number, prev: number) => {
    if (type === 'diario') {
      return `(vs ontem: ${prev})`;
    }
    if (prev === 0) {
      return curr > 0 ? '(Crescimento: +100%)' : '(Crescimento: 0%)';
    }
    const pct = ((curr - prev) / prev) * 100;
    return `(Crescimento: ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
  };

  const title = type === 'diario' ? 'Diário' : type === 'quinzenal' ? 'Quinzenal' : 'Mensal';
  const periodLabel = type === 'diario' ? 'Últimas 24h' : type === 'quinzenal' ? 'Últimos 15 dias' : 'Últimos 30 dias';

  return `📊 *LEAD PLUZ — Relatório ${title}*
Clínica: ${clinicName}
Data: ${new Date().toLocaleDateString('pt-BR')}

📈 *Indicadores Principais (${periodLabel}):*
• Novos Leads: ${currentMetrics.leads} ${formatChange(currentMetrics.leads, previousMetrics.leads)}
• Resgates Efetuados: ${currentMetrics.rescues} ${formatChange(currentMetrics.rescues, previousMetrics.rescues)}
• Mensagens Enviadas: ${currentMetrics.messages} ${formatChange(currentMetrics.messages, previousMetrics.messages)}
• Agendamentos Criados: ${currentMetrics.bookings} ${formatChange(currentMetrics.bookings, previousMetrics.bookings)}
• Agendamentos Confirmados: ${currentMetrics.confirmed} ${formatChange(currentMetrics.confirmed, previousMetrics.confirmed)}
• Comparecimentos: ${currentMetrics.attended} ${formatChange(currentMetrics.attended, previousMetrics.attended)}
• Cancelamentos: ${currentMetrics.cancelled} ${formatChange(currentMetrics.cancelled, previousMetrics.cancelled)}
• Faltas (No Show): ${currentMetrics.noShow} ${formatChange(currentMetrics.noShow, previousMetrics.noShow)}

🎯 *Principais Objeções:*
• ${objectionsText}

⚠️ *Atenção (Inbox):*
• Leads Aguardando Retorno: ${unansweredCount}

_Relatório enviado de forma automática._`;
}
