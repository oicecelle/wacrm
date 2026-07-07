import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FollowupSettings } from '@/types'

// GET /api/account/followup-settings
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 })

    const { data: account, error } = await supabase
      .from('accounts')
      .select(`
        followup_delay_hours,
        followup_schedule_type,
        followup_send_time,
        followup_hours_after,
        followup_use_ai,
        followup_default_template,
        lead_sources
      `)
      .eq('id', accountId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const settings: FollowupSettings = {
      followup_delay_hours: account.followup_delay_hours ?? 4,
      followup_schedule_type: account.followup_schedule_type ?? 'next_day_at_time',
      followup_send_time: account.followup_send_time ?? '10:00',
      followup_hours_after: account.followup_hours_after ?? 24,
      followup_use_ai: account.followup_use_ai ?? true,
      followup_default_template: account.followup_default_template ?? null,
      lead_sources: account.lead_sources ?? ['WhatsApp Orgânico', 'Instagram', 'Indicação', 'Site', 'Google', 'TikTok'],
    }

    return NextResponse.json({ settings })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/account/followup-settings
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('account_id').eq('user_id', user.id).maybeSingle()
    const accountId = profile?.account_id
    if (!accountId) return NextResponse.json({ error: 'Account not found' }, { status: 403 })

    const body = await request.json()
    const {
      followup_delay_hours,
      followup_schedule_type,
      followup_send_time,
      followup_hours_after,
      followup_use_ai,
      followup_default_template,
      lead_sources,
    } = body

    const updates: Partial<FollowupSettings> = {}
    if (followup_delay_hours !== undefined) updates.followup_delay_hours = Number(followup_delay_hours)
    if (followup_schedule_type !== undefined) updates.followup_schedule_type = followup_schedule_type
    if (followup_send_time !== undefined) updates.followup_send_time = followup_send_time
    if (followup_hours_after !== undefined) updates.followup_hours_after = Number(followup_hours_after)
    if (followup_use_ai !== undefined) updates.followup_use_ai = Boolean(followup_use_ai)
    if (followup_default_template !== undefined) updates.followup_default_template = followup_default_template
    if (lead_sources !== undefined) updates.lead_sources = lead_sources

    const { error } = await supabase
      .from('accounts')
      .update(updates)
      .eq('id', accountId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
