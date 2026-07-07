import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DealFollowup } from '@/types'

// GET /api/followups — list follow-ups for the account
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'pending'
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('deal_followups')
      .select(`
        *,
        deal:deals(id, title, stage_id, contact_id),
        contact:contacts(id, name, phone)
      `)
      .eq('account_id', accountId)
      .order('scheduled_at', { ascending: true })
      .limit(limit)

    if (status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ followups: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/followups — create a manual follow-up
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
    const { deal_id, contact_id, conversation_id, scheduled_at, message, ai_generated } = body

    if (!scheduled_at || !message) {
      return NextResponse.json({ error: 'scheduled_at and message are required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('deal_followups')
      .insert({
        account_id: accountId,
        deal_id: deal_id || null,
        contact_id: contact_id || null,
        conversation_id: conversation_id || null,
        scheduled_at,
        message,
        ai_generated: ai_generated ?? false,
        type: 'manual',
        status: 'pending',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Update deal with followup reference
    if (deal_id) {
      await supabase
        .from('deals')
        .update({
          followup_scheduled_at: scheduled_at,
          followup_type: 'manual',
          followup_message: message,
        })
        .eq('id', deal_id)
    }

    return NextResponse.json({ followup: data }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
