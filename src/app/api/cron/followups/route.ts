import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'
import OpenAI from 'openai'
import { getEnv } from '@/lib/env'

let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' })
  }
  return _openai
}

// GET /api/cron/followups
// Protected by AUTOMATION_CRON_SECRET header
// Called hourly by cron-job.org
export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret')
  const expected = getEnv('AUTOMATION_CRON_SECRET', '')

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const now = new Date()
  const results = { processed: 0, sent: 0, failed: 0, new_scheduled: 0 }

  // ─── 1. Send due follow-ups ───────────────────────────────────────
  const { data: duFollowups, error: dueErr } = await admin
    .from('deal_followups')
    .select('*, contact:contacts(phone, name)')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .limit(100)

  if (dueErr) {
    console.error('[cron/followups] Error fetching due followups:', dueErr.message)
  }

  for (const followup of (duFollowups || [])) {
    results.processed++

    // Get WhatsApp config for this account
    const { data: config } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', followup.account_id)
      .maybeSingle()

    if (!config) {
      await admin.from('deal_followups').update({
        status: 'failed',
        error_message: 'WhatsApp not configured for this account',
        updated_at: now.toISOString(),
      }).eq('id', followup.id)
      results.failed++
      continue
    }

    const phone = followup.contact?.phone
    if (!phone) {
      await admin.from('deal_followups').update({
        status: 'failed',
        error_message: 'Contact phone not found',
        updated_at: now.toISOString(),
      }).eq('id', followup.id)
      results.failed++
      continue
    }

    const result = await dispatchSendMessage({
      config: {
        provider_type: config.provider_type,
        phone_number_id: config.phone_number_id,
        access_token: config.access_token,
        uazapi_token: config.uazapi_token,
        uazapi_base_url: config.uazapi_base_url,
        uazapi_instance_name: config.uazapi_instance_name,
      },
      to: phone,
      messageType: 'text',
      content_text: followup.message,
    })

    const nowIso = new Date().toISOString()
    if (result.success) {
      await admin.from('deal_followups').update({
        status: 'sent',
        sent_at: nowIso,
        updated_at: nowIso,
      }).eq('id', followup.id)

      if (followup.deal_id) {
        await admin.from('deals').update({
          followup_scheduled_at: null,
          followup_type: null,
          followup_message: null,
        }).eq('id', followup.deal_id)
      }

      if (followup.conversation_id) {
        await admin.from('messages').insert({
          conversation_id: followup.conversation_id,
          sender_type: 'agent',
          content_type: 'text',
          content_text: followup.message,
          message_id: result.messageId || `followup-cron-${Date.now()}`,
          status: 'sent',
        })
        await admin.from('conversations').update({
          last_message_text: followup.message,
          last_message_at: nowIso,
          updated_at: nowIso,
        }).eq('id', followup.conversation_id)
      }

      results.sent++
    } else {
      await admin.from('deal_followups').update({
        status: 'failed',
        error_message: result.error,
        updated_at: nowIso,
      }).eq('id', followup.id)
      results.failed++
    }
  }

  // ─── 2. Detect deals needing a new auto follow-up ────────────────
  // Find deals where waiting_side = 'lead' and last update was > followup_delay_hours ago
  // and there's no pending followup already scheduled
  const { data: accounts } = await admin
    .from('accounts')
    .select('id, followup_delay_hours, followup_schedule_type, followup_send_time, followup_hours_after, followup_use_ai, followup_default_template')

  for (const account of (accounts || [])) {
    const delayHours = account.followup_delay_hours ?? 4
    const cutoff = new Date(now.getTime() - delayHours * 60 * 60 * 1000).toISOString()

    // Deals where we're waiting on lead for more than delay_hours and no pending followup
    const { data: staleDeals } = await admin
      .from('deals')
      .select('id, title, contact_id, conversation_id, followup_scheduled_at')
      .eq('account_id', account.id)
      .eq('status', 'open')
      .eq('waiting_side', 'lead')
      .lt('updated_at', cutoff)
      .is('followup_scheduled_at', null)
      .limit(50)

    for (const deal of (staleDeals || [])) {
      if (!deal.contact_id) continue

      // Calculate when to send
      let scheduledAt: Date
      if (account.followup_schedule_type === 'hours_after') {
        const hoursAfter = account.followup_hours_after ?? 24
        scheduledAt = new Date(now.getTime() + hoursAfter * 60 * 60 * 1000)
      } else {
        // next_day_at_time: tomorrow at followup_send_time
        const [hours, minutes] = (account.followup_send_time ?? '10:00').split(':').map(Number)
        scheduledAt = new Date(now)
        scheduledAt.setDate(scheduledAt.getDate() + 1)
        scheduledAt.setHours(hours, minutes, 0, 0)
      }

      // Generate AI message or use template
      let message = account.followup_default_template || 'Olá! Tudo bem? Só passando para saber se você ainda tem interesse. Posso te ajudar com algo?'

      if (account.followup_use_ai && process.env.OPENAI_API_KEY) {
        try {
          const { data: contact } = await admin
            .from('contacts')
            .select('name')
            .eq('id', deal.contact_id)
            .single()

          const completion = await getOpenAI().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'Você é um assistente de vendas. Escreva uma mensagem curta de follow-up no WhatsApp em português brasileiro, calorosa e natural. Máximo 3 linhas, sem emojis excessivos.',
              },
              {
                role: 'user',
                content: `Follow-up para ${contact?.name || 'o lead'} sobre "${deal.title}". O lead não respondeu há mais de ${delayHours} horas.`,
              },
            ],
            max_tokens: 100,
            temperature: 0.7,
          })
          message = completion.choices[0]?.message?.content?.trim() || message
        } catch (aiErr: any) {
          console.error('[cron/followups] AI generation failed:', aiErr.message)
        }
      }

      // Create the followup record
      const { error: insertErr } = await admin.from('deal_followups').insert({
        account_id: account.id,
        deal_id: deal.id,
        contact_id: deal.contact_id,
        conversation_id: deal.conversation_id || null,
        scheduled_at: scheduledAt.toISOString(),
        message,
        ai_generated: account.followup_use_ai,
        type: 'auto',
        status: 'pending',
      })

      if (!insertErr) {
        // Update deal to reflect scheduled followup
        await admin.from('deals').update({
          followup_scheduled_at: scheduledAt.toISOString(),
          followup_type: 'auto',
          followup_message: message,
        }).eq('id', deal.id)

        results.new_scheduled++
      }
    }
  }

  console.log('[cron/followups] Results:', results)
  return NextResponse.json({ ok: true, ...results })
}
