import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { syncLabelDefinitions } from '@/lib/whatsapp/labels-sync'
import { backfillLabelsPage } from '@/lib/whatsapp/labels-backfill'
import { uazapiRefreshLabels } from '@/lib/whatsapp/uazapi-api'

// A page of 200 chats is a couple of seconds; the loop below stops well
// before this limit and hands back where it stopped.
export const maxDuration = 60

const PAGE_SIZE = 200
/** Stop starting new pages after this long, leaving room under maxDuration. */
const TIME_BUDGET_MS = 30_000

/**
 * POST /api/whatsapp/labels/sync   { offset?: number }
 *
 * Two jobs, resumable:
 *  1. (first call, offset 0) pull the label DEFINITIONS (GET /labels) and
 *     ask the phone to re-send them (POST /labels/refresh);
 *  2. load WHO HAS WHICH label by reading the instance's chats
 *     (POST /chat/find) a page at a time. This is needed because the
 *     `history` label batch carries definitions only and `chat_labels`
 *     events only fire when a label changes — anyone already labelled
 *     before we listened would otherwise never show up.
 *
 * Returns `hasMore` + `nextOffset`; the caller keeps calling until done.
 * A failure reading chats never undoes the definitions already saved.
 */
export async function POST(request: Request) {
  let accountId: string
  try {
    accountId = (await getCurrentAccount()).accountId
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => ({}))
  let offset = Number.isInteger(body?.offset) && body.offset >= 0 ? (body.offset as number) : 0

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
  const token = config.uazapi_token as string

  const uazapiRefused = (message: string) =>
    /HTTP (401|403)\b/.test(message)
      ? 'A Uazapi recusou o token desta conexão. Reconecte o número em Configurações → WhatsApp e tente de novo.'
      : message

  let labels: number | undefined
  if (offset === 0) {
    try {
      labels = await syncLabelDefinitions(db, accountId, baseUrl, token)
      await uazapiRefreshLabels(baseUrl, token)
    } catch (err) {
      console.error('[whatsapp/labels/sync] definitions failed:', err)
      const message = err instanceof Error ? err.message : ''
      return NextResponse.json(
        { error: uazapiRefused(message) || 'Falha ao sincronizar etiquetas.', source: 'uazapi' },
        { status: 502 },
      )
    }
  }

  const started = Date.now()
  const totals = { scanned: 0, withLabels: 0, matchedContacts: 0, matchedWithLabels: 0, contactsChanged: 0 }
  let hasMore = false
  let total: number | null = null
  let backfillError: string | null = null

  try {
    do {
      const page = await backfillLabelsPage(db, accountId, baseUrl, token, offset, PAGE_SIZE)
      totals.scanned += page.scanned
      totals.withLabels += page.withLabels
      totals.matchedContacts += page.matchedContacts
      totals.matchedWithLabels += page.matchedWithLabels
      totals.contactsChanged += page.contactsChanged
      total = page.total ?? total
      hasMore = page.hasMore && page.nextOffset !== null
      if (hasMore) offset = page.nextOffset as number
    } while (hasMore && Date.now() - started < TIME_BUDGET_MS)
  } catch (err) {
    console.error('[whatsapp/labels/sync] chat backfill failed:', err)
    backfillError = uazapiRefused(err instanceof Error ? err.message : 'Falha ao ler os chats.')
    hasMore = false
  }

  return NextResponse.json({
    ok: true,
    labels,
    ...totals,
    total,
    hasMore,
    nextOffset: hasMore ? offset : null,
    backfill_error: backfillError,
  })
}
