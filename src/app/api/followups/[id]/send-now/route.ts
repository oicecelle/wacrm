import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'

async function sendFollowupNow(
  followupId: string,
  accountId: string,
  supabase: any
): Promise<{ success: boolean; error?: string }> {
  const admin = supabaseAdmin()

  // Fetch the follow-up
  const { data: followup, error: fErr } = await supabase
    .from('deal_followups')
    .select('*')
    .eq('id', followupId)
    .eq('account_id', accountId)
    .eq('status', 'pending')
    .single()

  if (fErr || !followup) return { success: false, error: 'Follow-up not found or already processed' }

  // Fetch WhatsApp config
  const { data: config } = await admin
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (!config) return { success: false, error: 'WhatsApp not configured' }

  // Resolve contact phone
  const { data: contact } = await admin
    .from('contacts')
    .select('phone, name')
    .eq('id', followup.contact_id)
    .single()

  if (!contact?.phone) return { success: false, error: 'Contact phone not found' }

  // Send the message
  const result = await dispatchSendMessage({
    config: {
      provider_type: config.provider_type,
      phone_number_id: config.phone_number_id,
      access_token: config.access_token,
      uazapi_token: config.uazapi_token,
      uazapi_base_url: config.uazapi_base_url,
      uazapi_instance_name: config.uazapi_instance_name,
    },
    to: contact.phone,
    messageType: 'text',
    content_text: followup.message,
  })

  const now = new Date().toISOString()

  if (result.success) {
    await admin.from('deal_followups').update({
      status: 'sent',
      sent_at: now,
      updated_at: now,
    }).eq('id', followupId)

    // Clear follow-up fields on deal
    if (followup.deal_id) {
      await admin.from('deals').update({
        followup_scheduled_at: null,
        followup_type: null,
        followup_message: null,
      }).eq('id', followup.deal_id)
    }

    // Record message in conversation
    if (followup.conversation_id) {
      await admin.from('messages').insert({
        conversation_id: followup.conversation_id,
        sender_type: 'agent',
        content_type: 'text',
        content_text: followup.message,
        message_id: result.messageId || `followup-${Date.now()}`,
        status: 'sent',
      })
      await admin.from('conversations').update({
        last_message_text: followup.message,
        last_message_at: now,
        updated_at: now,
      }).eq('id', followup.conversation_id)
    }

    return { success: true }
  } else {
    await admin.from('deal_followups').update({
      status: 'failed',
      error_message: result.error,
      updated_at: now,
    }).eq('id', followupId)
    return { success: false, error: result.error }
  }
}

// POST /api/followups/[id]/send-now — send immediately
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 })

    const { id } = await params
    const result = await sendFollowupNow(id, accountId, supabase)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export { sendFollowupNow }
