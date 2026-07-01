import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'

// Lazy-initialized admin client to avoid build-time issues
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

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const stateStr = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    console.error('[Google Calendar Callback] Google auth error:', error)
    return NextResponse.redirect(`${origin}/equipe?google_error=auth_failed`)
  }

  if (!code || !stateStr) {
    return NextResponse.json({ error: 'Missing code or state parameters' }, { status: 400 })
  }

  let state: { accountId: string; userId: string; origin: string }
  try {
    state = JSON.parse(stateStr)
  } catch (err) {
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 })
  }

  const { accountId, userId } = state
  const isLocalhost = origin.startsWith('http://localhost')
  const redirectUri = isLocalhost 
    ? 'http://localhost:3000/api/integrations/google/callback'
    : `${origin}/api/integrations/google/callback`

  const clientId = getEnv('GOOGLE_CLIENT_ID', '461678176041-5854mrv7g1he083u931v948q3s62jdbl.apps.googleusercontent.com')
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientSecret) {
    console.error('[Google Calendar Callback] GOOGLE_CLIENT_SECRET is missing.')
    return NextResponse.redirect(`${origin}/equipe?google_error=secret_missing`)
  }

  try {
    // 1. Exchange OAuth code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text()
      console.error('[Google Calendar Callback] Token exchange failed:', tokenRes.status, errText)
      return NextResponse.redirect(`${origin}/equipe?google_error=token_exchange_failed`)
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    if (!refresh_token) {
      // NOTE: Google only returns refresh_token on the first authorization or if prompt=consent is set.
      // Since we set prompt=consent, we should get it.
      console.warn('[Google Calendar Callback] No refresh_token returned by Google.')
    }

    // 2. Fetch authenticated user's email from Google
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    let email = 'Google Calendar Account'
    if (userinfoRes.ok) {
      const userinfo = await userinfoRes.json()
      email = userinfo.email || email
    }

    // 3. Upsert token record in database
    const db = getSupabaseAdmin()
    
    // Check if a token record already exists for this user_id & account_id
    const { data: existingToken } = await db
      .from('google_calendar_tokens')
      .select('id, refresh_token')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .maybeSingle()

    const expiryDate = Date.now() + (expires_in * 1000)

    const upsertData: any = {
      account_id: accountId,
      user_id: userId,
      email,
      access_token,
      expiry_date: expiryDate,
      updated_at: new Date().toISOString(),
    }

    // Google only sends the refresh_token on the first consent screen. 
    // If it's missing on subsequent reconnects, preserve the existing one.
    if (refresh_token) {
      upsertData.refresh_token = refresh_token
    } else if (existingToken) {
      upsertData.refresh_token = existingToken.refresh_token
    } else {
      console.error('[Google Calendar Callback] No refresh_token and no existing token record found.')
      return NextResponse.redirect(`${origin}/equipe?google_error=missing_refresh_token`)
    }

    const { error: upsertError } = await db
      .from('google_calendar_tokens')
      .upsert(upsertData, { onConflict: 'account_id,user_id' })

    if (upsertError) {
      console.error('[Google Calendar Callback] Database save failed:', upsertError.message)
      return NextResponse.redirect(`${origin}/equipe?google_error=database_save_failed`)
    }

    console.log(`[Google Calendar Callback] Token successfully saved for user_id=${userId} email=${email}`)
    return NextResponse.redirect(`${origin}/equipe?google_success=true`)

  } catch (err) {
    console.error('[Google Calendar Callback] Critical callback error:', err)
    return NextResponse.redirect(`${origin}/equipe?google_error=unknown_error`)
  }
}
