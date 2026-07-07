import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'

// POST /api/followups/bulk
// body: { ids: string[], action: 'cancel' | 'send_now' | 'reschedule', scheduled_at?: string }
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 })

    const body = await request.json()
    const { ids, action, scheduled_at } = body

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }
    if (!['cancel', 'send_now', 'reschedule'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const now = new Date().toISOString()
    const results = { success: 0, failed: 0, errors: [] as string[] }

    if (action === 'cancel') {
      // Fetch followups to clear deal fields
      const { data: followups } = await admin
        .from('deal_followups')
        .select('id, deal_id')
        .in('id', ids)
        .eq('account_id', accountId)
        .eq('status', 'pending')

      if (followups && followups.length > 0) {
        const { error } = await admin
          .from('deal_followups')
          .update({ status: 'cancelled', updated_at: now })
          .in('id', followups.map((f: any) => f.id))

        if (error) {
          results.failed = ids.length
          results.errors.push(error.message)
        } else {
          results.success = followups.length
          // Clear deal fields
          for (const f of followups) {
            if (f.deal_id) {
              await admin.from('deals').update({
                followup_scheduled_at: null,
                followup_type: null,
                followup_message: null,
              }).eq('id', f.deal_id)
            }
          }
        }
      }
    } else if (action === 'reschedule') {
      if (!scheduled_at) {
        return NextResponse.json({ error: 'scheduled_at required for reschedule' }, { status: 400 })
      }
      const { error } = await admin
        .from('deal_followups')
        .update({ scheduled_at, updated_at: now })
        .in('id', ids)
        .eq('account_id', accountId)
        .eq('status', 'pending')

      if (error) {
        results.failed = ids.length
        results.errors.push(error.message)
      } else {
        results.success = ids.length
      }
    } else if (action === 'send_now') {
      // Fetch config once
      const { data: config } = await admin
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', accountId)
        .maybeSingle()

      if (!config) {
        return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 400 })
      }

      const { data: followups } = await admin
        .from('deal_followups')
        .select('*, contact:contacts(phone, name)')
        .in('id', ids)
        .eq('account_id', accountId)
        .eq('status', 'pending')

      for (const followup of (followups || [])) {
        const phone = followup.contact?.phone
        if (!phone) {
          results.failed++
          results.errors.push(`No phone for contact in followup ${followup.id}`)
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

        if (result.success) {
          await admin.from('deal_followups').update({
            status: 'sent', sent_at: now, updated_at: now
          }).eq('id', followup.id)

          if (followup.deal_id) {
            await admin.from('deals').update({
              followup_scheduled_at: null, followup_type: null, followup_message: null
            }).eq('id', followup.deal_id)
          }

          if (followup.conversation_id) {
            await admin.from('messages').insert({
              conversation_id: followup.conversation_id,
              sender_type: 'agent',
              content_type: 'text',
              content_text: followup.message,
              message_id: result.messageId || `followup-${Date.now()}`,
              status: 'sent',
            })
          }

          results.success++
        } else {
          await admin.from('deal_followups').update({
            status: 'failed', error_message: result.error, updated_at: now
          }).eq('id', followup.id)
          results.failed++
          results.errors.push(result.error || 'Unknown error')
        }
      }
    }

    return NextResponse.json(results)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
