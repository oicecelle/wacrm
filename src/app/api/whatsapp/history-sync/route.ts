import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { requestEarlierMessages } from '@/lib/whatsapp/history-request'

/**
 * POST /api/whatsapp/history-sync   { conversation_id }
 *
 * "Load earlier messages": asks the clinic's phone, through Uazapi, for
 * older messages of ONE conversation. The answer is asynchronous and not
 * guaranteed — this only records and sends the request; the messages
 * arrive as `history` webhook batches and the outcome is written to
 * history_sync_requests. The account comes from the session.
 */
export async function POST(request: Request) {
  let ctx: { accountId: string; userId: string }
  try {
    const c = await getCurrentAccount()
    ctx = { accountId: c.accountId, userId: c.userId }
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const conversationId = typeof body?.conversation_id === 'string' ? body.conversation_id : ''
  if (!conversationId) {
    return NextResponse.json({ error: 'conversation_id é obrigatório.' }, { status: 400 })
  }

  const result = await requestEarlierMessages(supabaseAdmin(), ctx.accountId, ctx.userId, conversationId)
  if (result.ok) return NextResponse.json({ ok: true, request_id: result.requestId })

  const status =
    result.code === 'not_found' ? 404
    : result.code === 'cooldown' ? 429
    : result.code === 'refused' || result.code === 'failed' ? 502
    : 422
  return NextResponse.json({ error: result.message, code: result.code }, { status })
}
