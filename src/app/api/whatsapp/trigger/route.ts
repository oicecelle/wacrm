import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dispatchSendMessage, interpolateTemplateBody } from '@/lib/whatsapp/sender-dispatcher';

/**
 * Extracts and maps variables in order of appearance in template text.
 */
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

/**
 * Interpolates custom system templates variables.
 */
function interpolateSystemTemplate(text: string, vars: Record<string, string>): string {
  let result = text;
  Object.entries(vars).forEach(([key, val]) => {
    result = result.replaceAll(key, val || '');
  });
  return result;
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

/**
 * POST /api/whatsapp/trigger
 *
 * Scopes active system_message_templates, interpolates variables,
 * and sends notifications via the unified sender-dispatcher.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    let accountId: string | null = null;
    let userId: string | null = null;

    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.AUTOMATION_CRON_SECRET;
    const body = await request.json().catch(() => ({}));

    if (cronSecret && expectedSecret && cronSecret === expectedSecret) {
      accountId = body.account_id || null;
      userId = body.user_id || null;
    } else {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      userId = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('user_id', user.id)
        .maybeSingle();
      accountId = profile?.account_id || null;
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'Account ID is required' },
        { status: 400 }
      );
    }

    const { event_type, appointment_id, patient_id, metadata = {} } = body;

    if (!event_type) {
      return NextResponse.json(
        { error: 'event_type is required' },
        { status: 400 }
      );
    }

    // 1. Fetch active templates for this event type
    const { data: templates, error: templatesErr } = await supabase
      .from('system_message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('event_type', event_type)
      .eq('is_active', true);

    if (templatesErr) {
      console.error('Error fetching templates:', templatesErr);
      return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
    }

    if (!templates || templates.length === 0) {
      return NextResponse.json({ success: true, message: 'No active templates for event_type' });
    }

    // 2. Fetch WhatsApp config
    const { data: config, error: configErr } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (configErr) {
      console.error('Error fetching config:', configErr);
      return NextResponse.json({ error: 'Failed to fetch WhatsApp configuration' }, { status: 500 });
    }

    if (!config || config.status !== 'connected') {
      return NextResponse.json({ success: false, error: 'WhatsApp config is missing or disconnected' });
    }

    const timezone = config.timezone || 'America/Sao_Paulo';

    // 3. Resolve metadata details
    let finalPatientName = metadata.paciente || '';
    let finalPatientPhone = metadata.phone || '';
    let finalDate = metadata.data || '';
    let finalHora = metadata.hora || '';
    let finalProfissional = metadata.profissional || '';
    let finalProcedimento = metadata.procedimento || '';
    let finalClinica = metadata.clinica || '';
    let finalLink = metadata.link || '';
    let finalValor = metadata.valor || '';
    let finalVencimento = metadata.vencimento || '';

    let resolvedPatientId = patient_id || null;

    // Fetch clinic/account name if empty
    if (!finalClinica) {
      const { data: accountRow } = await supabase
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .maybeSingle();
      finalClinica = accountRow?.name || '';
    }

    // Query DB if details are missing and we have IDs
    if ((!finalPatientName || !finalPatientPhone) && appointment_id) {
      const { data: appt } = await supabase
        .from('appointments')
        .select('*, patient:contacts(id, name, phone), professional:clinic_users(name)')
        .eq('id', appointment_id)
        .maybeSingle();

      if (appt) {
        resolvedPatientId = appt.patient?.id || resolvedPatientId;
        finalPatientName = appt.patient?.name || '';
        finalPatientPhone = appt.patient?.phone || '';
        finalProfissional = appt.professional?.name || '';
        finalProcedimento = appt.type || '';

        if (appt.start_time) {
          const startObj = new Date(appt.start_time);
          finalDate = startObj.toLocaleDateString('pt-BR', { timeZone: timezone });
          finalHora = startObj.toLocaleTimeString('pt-BR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
        }
      }
    }

    if ((!finalPatientName || !finalPatientPhone) && resolvedPatientId) {
      const { data: pat } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', resolvedPatientId)
        .maybeSingle();

      if (pat) {
        finalPatientName = pat.name || '';
        finalPatientPhone = pat.phone || '';
      }
    }

    if (!finalPatientPhone) {
      return NextResponse.json({ success: false, error: 'Patient phone number could not be resolved' });
    }

    // Build the variables dictionary
    const varsDict: Record<string, string> = {
      '{{paciente}}': finalPatientName,
      '{{data}}': finalDate,
      '{{hora}}': finalHora,
      '{{profissional}}': finalProfissional,
      '{{clinica}}': finalClinica,
      '{{procedimento}}': finalProcedimento,
      '{{valor}}': finalValor,
      '{{vencimento}}': finalVencimento,
      '{{link}}': finalLink || '#',
    };

    // 4. Send messages for each template
    const results: any[] = [];
    const sysUserId = userId || config.user_id;

    for (const template of templates) {
      let messageId: string | undefined;
      let success = false;
      let error: string | undefined;

      const provider = template.provider_type || config.provider_type;

      if (provider === 'uazapi') {
        const text = interpolateSystemTemplate(template.message_text, varsDict);
        const res = await dispatchSendMessage({
          config: {
            provider_type: 'uazapi',
            uazapi_token: config.uazapi_token,
            uazapi_base_url: config.uazapi_base_url,
            uazapi_instance_name: config.uazapi_instance_name,
          },
          to: finalPatientPhone,
          messageType: 'text',
          content_text: text,
        });

        success = res.success;
        messageId = res.messageId;
        error = res.error;

        if (success && resolvedPatientId) {
          // Log timeline
          await supabase.from('patient_timeline').insert({
            patient_id: resolvedPatientId,
            event_type: 'whatsapp',
            title: `Mensagem enviada via Uazapi: ${template.name}`,
            payload: {
              event_type,
              phone: finalPatientPhone,
              message: text,
            },
          });

          // Save to database messages
          try {
            const contactId = await findOrCreateContactForPatient(supabase, accountId, sysUserId, finalPatientPhone, finalPatientName);
            const conversationId = await getOrCreateConversation(supabase, contactId, accountId, sysUserId);
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              sender_type: 'bot',
              content_type: 'text',
              content_text: text,
              message_id: messageId || `uaz-${Date.now()}`,
              status: 'sent',
            });
            await supabase.from('conversations').update({
              last_message_text: text,
              last_message_at: new Date().toISOString(),
            }).eq('id', conversationId);
          } catch (dbErr) {
            console.error('Failed to log message in chat history:', dbErr);
          }
        }
      } else {
        // Meta template
        const templateParams = getTemplateParamsInOrder(template.message_text, varsDict);
        const res = await dispatchSendMessage({
          config: {
            provider_type: 'meta',
            phone_number_id: config.phone_number_id,
            access_token: config.access_token,
          },
          to: finalPatientPhone,
          messageType: 'template',
          template_name: template.meta_template_name,
          template_language: template.meta_template_language || 'pt_BR',
          template_params: templateParams,
        });

        success = res.success;
        messageId = res.messageId;
        error = res.error;

        if (success && resolvedPatientId) {
          const fallbackText = interpolateSystemTemplate(template.message_text, varsDict);

          // Log timeline
          await supabase.from('patient_timeline').insert({
            patient_id: resolvedPatientId,
            event_type: 'whatsapp',
            title: `Template Meta enviado: ${template.meta_template_name}`,
            payload: {
              event_type,
              phone: finalPatientPhone,
              template_name: template.meta_template_name,
              message: fallbackText,
            },
          });

          // Save to database messages
          try {
            const contactId = await findOrCreateContactForPatient(supabase, accountId, sysUserId, finalPatientPhone, finalPatientName);
            const conversationId = await getOrCreateConversation(supabase, contactId, accountId, sysUserId);
            await supabase.from('messages').insert({
              conversation_id: conversationId,
              sender_type: 'bot',
              content_type: 'template',
              template_name: template.meta_template_name,
              content_text: fallbackText,
              message_id: messageId || `meta-${Date.now()}`,
              status: 'sent',
            });
            await supabase.from('conversations').update({
              last_message_text: `[Template: ${template.meta_template_name}]`,
              last_message_at: new Date().toISOString(),
            }).eq('id', conversationId);
          } catch (dbErr) {
            console.error('Failed to log message in chat history:', dbErr);
          }
        }
      }

      results.push({
        template_id: template.id,
        template_name: template.name,
        success,
        messageId,
        error,
      });
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Error in trigger POST:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
