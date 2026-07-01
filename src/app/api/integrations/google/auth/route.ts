import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEnv } from '@/lib/env'

export async function GET(request: Request) {
  const { origin } = new URL(request.url)

  // Get authenticated user session
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get profile to find the account_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const accountId = profile?.account_id
  if (!accountId) {
    return NextResponse.json({ error: 'Account not found' }, { status: 400 })
  }

  const clientId = getEnv('GOOGLE_CLIENT_ID', '461678176041-5854mrv7g1he083u931v948q3s62jdbl.apps.googleusercontent.com')
  
  // Choose the redirect URI dynamically based on whether it is running on localhost or Vercel
  const isLocalhost = origin.startsWith('http://localhost')
  const redirectUri = isLocalhost 
    ? 'http://localhost:3000/api/integrations/google/callback'
    : `${origin}/api/integrations/google/callback`

  // Pass account_id and user_id in OAuth 'state' parameter to map it back in the callback
  const state = JSON.stringify({
    accountId,
    userId: user.id,
    origin,
  })

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  googleAuthUrl.searchParams.set('client_id', clientId)
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri)
  googleAuthUrl.searchParams.set('response_type', 'code')
  googleAuthUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email')
  googleAuthUrl.searchParams.set('access_type', 'offline')
  googleAuthUrl.searchParams.set('prompt', 'consent')
  googleAuthUrl.searchParams.set('state', state)

  return NextResponse.redirect(googleAuthUrl.toString())
}
