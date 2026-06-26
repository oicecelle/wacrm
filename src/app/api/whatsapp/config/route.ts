import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import {
  getUazapiStatus,
  setUazapiWebhook,
} from '@/lib/whatsapp/uazapi-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

/**
 * Resolve the caller's account_id from their profile. Inlined here
 * (rather than going through `@/lib/auth/account.getCurrentAccount`)
 * because the GET handler wants to return shaped 200s for every
 * non-auth failure mode, not throw — keeping the helper minimal lets
 * the existing response branches stay as-is.
 *
 * Returns null if the user has no profile or no account; callers
 * should treat that the same as "not connected".
 */
async function resolveAccountId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data?.account_id) return null
  return data.account_id as string
}

import { getEnv } from '@/lib/env'

// Lazy-initialised service-role client. We need it to detect a
// phone_number_id already claimed by a *different* user — under RLS,
// the user's own session can't see other users' rows, so the conflict
// would be invisible without the service role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk')
    )
  }
  return _adminClient
}

function cleanString(str: string): string {
  if (!str) return '';
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findBestClinicMatch(accountName: string, userEmail: string | undefined, clinics: any[]) {
  const emailToUse = accountName.includes('@') ? accountName : (userEmail || '');
  if (emailToUse) {
    const prefix = cleanString(emailToUse.split('@')[0]);
    if (prefix) {
      const match = clinics.find(c => {
        const cleanName = cleanString(c.name);
        return cleanName.includes(prefix) || prefix.includes(cleanName);
      });
      if (match) return match;
    }
  }

  const cleanAccName = cleanString(accountName);
  if (cleanAccName) {
    const match = clinics.find(c => {
      const cleanName = cleanString(c.name);
      return cleanName.includes(cleanAccName) || cleanAccName.includes(cleanName);
    });
    if (match) return match;
  }

  return null;
}

function findBestConfigMatch(clinicName: string, configs: any[]) {
  const cleanClinicName = cleanString(clinicName);
  if (!cleanClinicName) return null;

  let match = configs.find(c => cleanString(c.nome) === cleanClinicName);
  if (match) return match;

  match = configs.find(c => {
    const cleanNome = cleanString(c.nome);
    return cleanNome.includes(cleanClinicName) || cleanClinicName.includes(cleanNome);
  });
  
  return match || null;
}

async function autoResolveClinicDetails(
  supabase: any,
  user: any,
  accountId: string
): Promise<{ token: string | null; name: string | null; clinicId: string | null }> {
  try {
    const admin = supabaseAdmin()

    // 1. Get clinic_id from clinic_users mapping
    const { data: clinicUser } = await admin
      .from('clinic_users')
      .select('clinic_id')
      .eq('user_id', user.id)
      .maybeSingle()

    let clinicId = clinicUser?.clinic_id || null
    let clinicName: string | null = null
    let uazapiToken: string | null = null

    // 2. Query clinics table
    if (clinicId) {
      const { data: clinic } = await admin
        .from('clinics')
        .select('name, uazapi_token')
        .eq('id', clinicId)
        .maybeSingle()
      if (clinic) {
        clinicName = clinic.name
        uazapiToken = clinic.uazapi_token
      }
    }

    // 3. Fallback: try account matching if clinicId is not resolved
    if (!clinicName) {
      const { data: accountRow } = await admin
        .from('accounts')
        .select('name')
        .eq('id', accountId)
        .maybeSingle()
      
      if (accountRow?.name) {
        const { data: clinicsList } = await admin
          .from('clinics')
          .select('id, name, uazapi_token')
        
        if (clinicsList) {
          const match = findBestClinicMatch(accountRow.name, user.email, clinicsList)
          if (match) {
            clinicId = match.id
            clinicName = match.name
            uazapiToken = match.uazapi_token
          }
        }
      }
    }

    // 4. Resolve uazapi_token from clinicas_config if missing in clinics table
    if (clinicName && !uazapiToken) {
      const { data: configList } = await admin
        .from('clinicas_config')
        .select('nome, uazapi_token')
      
      if (configList) {
        const configMatch = findBestConfigMatch(clinicName, configList)
        if (configMatch) {
          uazapiToken = configMatch.uazapi_token
        }
      }
    }

    return {
      token: uazapiToken,
      name: clinicName,
      clinicId
    }
  } catch (err) {
    console.error('[autoResolveClinicDetails] error:', err)
    return { token: null, name: null, clinicId: null }
  }
}

/**
 * GET /api/whatsapp/config
 *
 * Used by the "Test API Connection" button and by the page to check
 * whether the saved config is healthy. Returns 200 in all non-auth cases
 * so the UI can render an appropriate message rather than show a 500.
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_account',
          message: 'Your profile is not linked to an account.',
        },
        { status: 200 },
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    if (configError) {
      console.error('Error fetching whatsapp_config:', configError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!config) {
      const resolved = await autoResolveClinicDetails(supabase, user, accountId);
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'No WhatsApp configuration saved yet. Fill in the form and click Save Configuration.',
          provider_type: 'uazapi',
          uazapi_token: resolved.token,
          uazapi_instance_name: resolved.name,
          timezone: 'America/Sao_Paulo',
        },
        { status: 200 }
      )
    }

    // Handle Uazapi connection check
    if (config.provider_type === 'uazapi') {
      const baseUrl = config.uazapi_base_url || 'https://customix.uazapi.com'
      const token = config.uazapi_token
      if (!token) {
        return NextResponse.json({
          connected: false,
          reason: 'uazapi_not_configured',
          message: 'Uazapi token is not configured.'
        }, { status: 200 })
      }

      const status = await getUazapiStatus(baseUrl, token)
      return NextResponse.json({
        connected: status.connected,
        provider_type: 'uazapi',
        state: status.state,
        raw: status.raw,
        uazapi_token: token,
        uazapi_instance_name: config.uazapi_instance_name,
        uazapi_base_url: baseUrl,
        timezone: config.timezone,
        phone_number_id: config.phone_number_id
      }, { status: 200 })
    }

    // Try to decrypt the stored token with the current ENCRYPTION_KEY.
    let accessToken: string
    try {
      if (!config.access_token) {
        return NextResponse.json({
          connected: false,
          reason: 'meta_not_configured',
          message: 'Meta access token is not configured.'
        }, { status: 200 })
      }
      accessToken = decrypt(config.access_token)
    } catch (err) {
      console.error('[whatsapp/config GET] Token decryption failed:', err)
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message:
            'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. Click "Reset Configuration" below, then re-save.',
        },
        { status: 200 }
      )
    }

    // Validate credentials against Meta
    try {
      const phoneInfo = await verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
      })
      return NextResponse.json({ connected: true, provider_type: 'meta', phone_info: phoneInfo })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/config GET] Meta API verification failed:', message)
      return NextResponse.json(
        {
          connected: false,
          reason: 'meta_api_error',
          message: `Meta API rejected the credentials: ${message}`,
        },
        { status: 200 }
      )
    }
  } catch (error) {
    console.error('Error in WhatsApp config GET:', error)
    return NextResponse.json(
      { connected: false, reason: 'unknown', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/whatsapp/config
 *
 * Saves or updates the WhatsApp config for the authenticated user.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const {
      provider_type = 'meta',
      phone_number_id,
      waba_id,
      access_token,
      verify_token,
      pin,
      uazapi_token,
      uazapi_instance_name,
      uazapi_base_url = 'https://customix.uazapi.com',
      timezone = 'America/Sao_Paulo',
      phone_number
    } = body

    // 1. Uazapi configuration pathway
    if (provider_type === 'uazapi') {
      let resolvedToken = uazapi_token
      let resolvedInstanceName = uazapi_instance_name
      let clinicId = null

      if (!resolvedToken) {
        const resolved = await autoResolveClinicDetails(supabase, user, accountId)
        resolvedToken = resolved.token
        resolvedInstanceName = resolved.name
        clinicId = resolved.clinicId
      }

      if (!resolvedToken) {
        return NextResponse.json(
          { error: 'Não foi possível encontrar um token Uazapi pré-alocado para a sua clínica. Por favor, entre em contato com o suporte.' },
          { status: 400 }
        )
      }

      // Check connection status
      const status = await getUazapiStatus(uazapi_base_url, resolvedToken)

      // Automatically configure the inbound webhook on the Uazapi server
      const host = request.headers.get('host') || 'localhost:3000'
      const proto = request.headers.get('x-forwarded-proto') || 'http'
      const publicUrl = `${proto}://${host}`
      const webhookUrl = `${publicUrl}/api/whatsapp/uazapi-webhook?account_id=${accountId}`

      const webhookSuccess = await setUazapiWebhook(uazapi_base_url, resolvedToken, webhookUrl)
      if (!webhookSuccess) {
        console.warn('[whatsapp/config] Uazapi setWebhook failed or was skipped.')
      }

      const cleanPhone = phone_number ? phone_number.replace(/\D/g, '') : (phone_number_id ? phone_number_id.replace(/\D/g, '') : null)

      const payload = {
        account_id: accountId,
        user_id: user.id,
        provider_type: 'uazapi',
        uazapi_token: resolvedToken,
        uazapi_instance_name: resolvedInstanceName,
        uazapi_base_url,
        timezone,
        status: status.connected ? 'connected' : 'disconnected',
        connected_at: status.connected ? new Date().toISOString() : null,
        phone_number_id: cleanPhone,
        waba_id: null,
        access_token: null,
        verify_token: null,
        registered_at: null,
        subscribed_apps_at: null,
        updated_at: new Date().toISOString()
      }

      // Check if config exists
      const { data: existing } = await supabase
        .from('whatsapp_config')
        .select('id')
        .eq('account_id', accountId)
        .maybeSingle()

      if (existing) {
        const { error } = await supabase
          .from('whatsapp_config')
          .update(payload)
          .eq('account_id', accountId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('whatsapp_config')
          .insert(payload)
        if (error) throw error
      }

      // Sync the phone number and status back to clinicas_config and clinics
      if (cleanPhone && resolvedInstanceName) {
        const admin = supabaseAdmin()
        
        // A. Update clinicas_config table
        await admin
          .from('clinicas_config')
          .update({ numero_whatsapp: cleanPhone })
          .ilike('nome', resolvedInstanceName)

        // B. Update clinics table
        if (clinicId) {
          await admin
            .from('clinics')
            .update({ numero_whatsapp: cleanPhone, whatsapp_status: status.connected ? 'connected' : 'disconnected' })
            .eq('id', clinicId)
        } else {
          await admin
            .from('clinics')
            .update({ numero_whatsapp: cleanPhone, whatsapp_status: status.connected ? 'connected' : 'disconnected' })
            .ilike('name', resolvedInstanceName)
        }
      }

      return NextResponse.json({
        success: true,
        saved: true,
        connected: status.connected,
        state: status.state,
        webhook_configured: webhookSuccess,
        uazapi_token: resolvedToken
      })
    }

    // 2. Meta configuration pathway
    if (!access_token || !phone_number_id) {
      return NextResponse.json(
        { error: 'access_token and phone_number_id are required' },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    // Reject if another account has already claimed this phone_number_id.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone_number_id)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance. Each phone number can only be connected to one wacrm user.',
        },
        { status: 409 }
      )
    }

    // Verify credentials with Meta BEFORE saving
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API verification failed during save:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      )
    }

    // Encrypt sensitive tokens before storing
    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    try {
      encryptedAccessToken = encrypt(access_token)
      encryptedVerifyToken = verify_token ? encrypt(verify_token) : null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 }
      )
    }

    // Look up any pre-existing row for this account so we know whether
    // this number is already registered with Meta — if so we can skip
    // /register when the user didn't provide a PIN this time around.
    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id, registered_at, phone_number_id')
      .eq('account_id', accountId)
      .maybeSingle()

    const sameNumber =
      existing?.phone_number_id === phone_number_id &&
      existing?.registered_at != null

    // Step 1: register the phone number for inbound webhooks.
    let registeredAt: string | null = existing?.registered_at ?? null
    let registrationError: string | null = null
    let registrationSkipped = false

    const needsRegistration = !sameNumber || (typeof pin === 'string' && pin.length > 0)
    if (needsRegistration) {
      if (!pin) {
        registrationSkipped = true
      } else {
        try {
          await registerPhoneNumber({
            phoneNumberId: phone_number_id,
            accessToken: access_token,
            pin,
          })
          registeredAt = new Date().toISOString()
        } catch (err) {
          registrationError =
            err instanceof Error ? err.message : 'Unknown Meta API error'
          console.error('Phone number /register failed:', registrationError)
        }
      }
    }

    // Step 2: subscribe the WABA to this app.
    let subscribedAppsAt: string | null = null
    if (waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id,
          accessToken: access_token,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('WABA subscribed_apps failed (non-fatal):', message)
      }
    }

    // Persist everything in one shot
    const baseRow = {
      provider_type: 'meta',
      phone_number_id,
      waba_id: waba_id || null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: registrationError ? 'disconnected' : 'connected',
      connected_at: registrationError ? null : new Date().toISOString(),
      registered_at: registrationError ? null : registeredAt,
      subscribed_apps_at: subscribedAppsAt ?? null,
      last_registration_error: registrationError,
      uazapi_token: null,
      uazapi_instance_name: null,
      uazapi_base_url: null,
      timezone: timezone || 'America/Sao_Paulo',
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', accountId)

      if (updateError) {
        console.error('Error updating whatsapp_config:', updateError)
        return NextResponse.json(
          { error: 'Failed to update configuration' },
          { status: 500 }
        )
      }
    } else {
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...baseRow,
        })

      if (insertError) {
        console.error('Error inserting whatsapp_config:', insertError)
        return NextResponse.json(
          { error: 'Failed to save configuration' },
          { status: 500 }
        )
      }
    }

    if (registrationError) {
      return NextResponse.json({
        success: false,
        saved: true,
        registered: false,
        registration_error: registrationError,
        phone_info: phoneInfo,
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: registeredAt != null,
      registration_skipped: registrationSkipped,
      phone_info: phoneInfo,
    })
  } catch (error) {
    console.error('Error in WhatsApp config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/whatsapp/config
 *
 * Removes the authenticated user's WhatsApp configuration row.
 * Used by the "Reset Configuration" button to recover from a corrupted
 * encrypted token (mismatched ENCRYPTION_KEY across environments).
 */
export async function DELETE() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const { error: deleteError } = await supabase
      .from('whatsapp_config')
      .delete()
      .eq('account_id', accountId)

    if (deleteError) {
      console.error('Error deleting whatsapp_config:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in WhatsApp config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
