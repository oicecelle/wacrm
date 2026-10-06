import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { syncLabelDefinitions } from '@/lib/whatsapp/labels-sync'
import { uazapiRefreshLabels } from '@/lib/whatsapp/uazapi-api'

/**
 * POST /api/whatsapp/labels/sync
 *
 * Pulls the instance's label definitions (GET /labels, documented
 * schema) into whatsapp_labels, and asks the phone to re-send its
 * labels (POST /labels/refresh) — which arrive as `history` batches.
 * Those batches are only RECORDED for now (their item shape isn't in
 * the docs), so this fills in definitions; who-has-which-label then
 * comes from live `chat_labels` events.
 */
export async function POST() {
  let accountId: string
  try {
    accountId = (await getCurrentAccount()).accountId
  } catch (err) {
    return toErrorResponse(err)
  }

  const db = supabaseAdmin()
  const { data: config } = await db
    .from('whatsapp_config')
    .select('provider_type, uazapi_base_url, uazapi_token')
    .eq('account_id', accountId)
    .maybeSingle()
  if (!config || config.provider_type !== 'uazapi' || !config.uazapi_token) {
    return NextResponse.json({ error: 'Etiquetas do WhatsApp exigem uma conexão Uazapi ativa.' }, { status: 400 })
  }

  const baseUrl = config.uazapi_base_url || 'https://customix.uazapi.com'
  try {
    const saved = await syncLabelDefinitions(db, accountId, baseUrl, config.uazapi_token)
    const refreshRequested = await uazapiRefreshLabels(baseUrl, config.uazapi_token)
    return NextResponse.json({ ok: true, labels: saved, refresh_requested: refreshRequested })
  } catch (err) {
    console.error('[whatsapp/labels/sync] failed:', err)
    const message = err instanceof Error ? err.message : ''
    // Uazapi itself refusing the instance token is a different problem
    // from our own session check — say so, in plain words.
    if (/HTTP (401|403)\b/.test(message)) {
      return NextResponse.json(
        { error: 'A Uazapi recusou o token desta conexão. Reconecte o número em Configurações → WhatsApp e tente de novo.', source: 'uazapi' },
        { status: 502 },
      )
    }
    return NextResponse.json({ error: message || 'Falha ao sincronizar etiquetas.', source: 'uazapi' }, { status: 502 })
  }
}
