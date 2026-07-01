import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'
import { syncGoogleEventsToDatabase } from '@/lib/integrations/google-calendar'

let _adminClient: any = null
function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    )
  }
  return _adminClient
}

/**
 * GET - Manual or Cron Triggered Synchronization
 * Calls syncGoogleEventsToDatabase for all connected users to pull latest events.
 */
export async function GET() {
  console.log('[Google Calendar Cron/Sync] Starting sync for all connected accounts...')
  const db = getSupabaseAdmin()

  try {
    // Fetch all active tokens
    const { data: tokens, error } = await db
      .from('google_calendar_tokens')
      .select('account_id, user_id, email')

    if (error) {
      console.error('[Google Calendar Cron/Sync] Error fetching tokens:', error)
      return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
    }

    if (!tokens || tokens.length === 0) {
      console.log('[Google Calendar Cron/Sync] No connected accounts to sync.')
      return NextResponse.json({ status: 'success', synced: 0 })
    }

    let successCount = 0
    for (const token of tokens) {
      console.log(`[Google Calendar Cron/Sync] Syncing calendar for user_id=${token.user_id} email=${token.email}...`)
      const success = await syncGoogleEventsToDatabase(token.account_id, token.user_id)
      if (success) successCount++
    }

    return NextResponse.json({ status: 'success', synced: successCount, total: tokens.length })
  } catch (err: any) {
    console.error('[Google Calendar Cron/Sync] Critical error in sync endpoint:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST - Google Calendar Push Notification Webhook Receiver
 * (Handles Google's notification requests and triggers sync)
 */
export async function POST(request: Request) {
  // Google sends headers indicating calendar updates, e.g. x-goog-resource-state = 'exists'
  const state = request.headers.get('x-goog-resource-state')
  console.log('[Google Calendar Webhook] Received notification. State:', state)

  if (state === 'sync') {
    // Google sends a sync message when watch channel is created
    return new Response('Sync acknowledged', { status: 200 })
  }

  // To keep it simple, since Google doesn't send event IDs in headers and watch channels are highly volatile,
  // we trigger a full sync of all active Google Calendar tokens when a notification arrives.
  const db = getSupabaseAdmin()
  try {
    const { data: tokens } = await db
      .from('google_calendar_tokens')
      .select('account_id, user_id, email')

    if (tokens) {
      for (const token of tokens) {
        syncGoogleEventsToDatabase(token.account_id, token.user_id)
          .catch((err: any) => console.error(`[Google Calendar Webhook] Background sync failed for ${token.email}:`, err))
      }
    }
  } catch (err: any) {
    console.error('[Google Calendar Webhook] Error triggering webhook sync:', err)
  }

  return new Response('Webhook processed', { status: 200 })
}
