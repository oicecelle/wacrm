import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { setContactWhatsappLabel } from '@/lib/whatsapp/label-actions'

/**
 * POST /api/whatsapp/chat-labels  { contact_id, wa_label_id, op: 'add' | 'remove' }
 *
 * Adds or removes a WhatsApp label on a contact's chat — the same
 * service the automations and flows use. The account comes from the
 * session, never from the body.
 */
export async function POST(request: Request) {
  let accountId: string
  try {
    accountId = (await getCurrentAccount()).accountId
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const contactId = typeof body?.contact_id === 'string' ? body.contact_id : ''
  const labelId = typeof body?.wa_label_id === 'string' ? body.wa_label_id : ''
  const op = body?.op === 'add' || body?.op === 'remove' ? body.op : null
  if (!contactId || !labelId || !op) {
    return NextResponse.json({ error: 'contact_id, wa_label_id e op (add|remove) são obrigatórios.' }, { status: 400 })
  }

  const result = await setContactWhatsappLabel(supabaseAdmin(), accountId, contactId, labelId, op)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json({ ok: true })
}
