import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendUazapiTextMessage } from '@/lib/whatsapp/uazapi-api'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'
import { decrypt } from '@/lib/whatsapp/encryption'

// PATCH /api/followups/[id] — edit message and/or scheduled_at
export async function PATCH(
  request: Request,
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
    const body = await request.json()
    const { message, scheduled_at } = body

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (message !== undefined) updates.message = message
    if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at

    const { data, error } = await supabase
      .from('deal_followups')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Follow-up not found or already sent' }, { status: 404 })

    // Sync updated fields back to deal
    if (data.deal_id) {
      const dealUpdates: Record<string, any> = {}
      if (message !== undefined) dealUpdates.followup_message = message
      if (scheduled_at !== undefined) dealUpdates.followup_scheduled_at = scheduled_at
      if (Object.keys(dealUpdates).length > 0) {
        await supabase.from('deals').update(dealUpdates).eq('id', data.deal_id)
      }
    }

    return NextResponse.json({ followup: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/followups/[id] — cancel a follow-up
export async function DELETE(
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

    const { data, error } = await supabase
      .from('deal_followups')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', accountId)
      .eq('status', 'pending')
      .select('id, deal_id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Follow-up not found or already sent' }, { status: 404 })

    // Clear followup fields on deal
    if (data.deal_id) {
      await supabase.from('deals').update({
        followup_scheduled_at: null,
        followup_type: null,
        followup_message: null,
      }).eq('id', data.deal_id)
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
