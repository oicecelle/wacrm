import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendOneBroadcastRecipient } from '@/lib/whatsapp/broadcast-sender'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'

// "Enviar agora" for a whole waiting/in-progress broadcast. Sends
// every still-pending recipient right here in this request, ignoring
// the broadcast's configured interval_seconds — that pacing exists
// for the *scheduled* pace, but "enviar agora" is an explicit
// one-time override to push everything out immediately.
//
// An earlier version of this route only reset scheduled_at/last_sent_at
// and left delivery to the next cron tick — but the cron worker's own
// pacing logic (see /api/cron/broadcasts) still only releases one
// interval's worth of recipients per tick, so from the user's side
// "enviar agora" appeared to send just one message and stop. This
// version processes the whole pending list synchronously instead,
// bounded by the same kind of time budget the cron uses so a very
// large list degrades gracefully (finishes what it can, the cron
// picks up the rest on its normal schedule) rather than timing out.
export const maxDuration = 60
const TIME_BUDGET_MS = 50_000

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle()
    const accountId = profile?.account_id as string | undefined
    if (!accountId) {
      return NextResponse.json({ error: 'Seu perfil não está vinculado a uma conta.' }, { status: 403 })
    }

    const { data: broadcast, error: fetchError } = await supabase
      .from('broadcasts')
      .select('id, status, template_name, template_language')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Disparo não encontrado.' }, { status: 404 })
    }
    if (!['scheduled', 'sending'].includes(broadcast.status)) {
      return NextResponse.json(
        { error: 'Só é possível enviar agora um disparo agendado ou em andamento.' },
        { status: 400 },
      )
    }

    const admin = supabaseAdmin()

    await admin.from('broadcasts').update({ status: 'sending' }).eq('id', id)

    const { data: config } = await admin
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!config) {
      return NextResponse.json({ error: 'WhatsApp não configurado para esta conta.' }, { status: 400 })
    }

    const { data: rawTemplateRow } = await admin
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .eq('name', broadcast.template_name)
      .eq('language', broadcast.template_language || 'pt_BR')
      .maybeSingle()
    const templateRow = rawTemplateRow && isMessageTemplate(rawTemplateRow) ? rawTemplateRow : null

    const startedAt = Date.now()
    const summary = { sent: 0, failed: 0, remaining: 0 }

    // Paged so a very large list doesn't need to fit in memory at once.
    const PAGE = 200
    let keepGoing = true
    while (keepGoing && Date.now() - startedAt < TIME_BUDGET_MS) {
      const { data: pending } = await admin
        .from('broadcast_recipients')
        .select('id, params, contact:contacts(phone)')
        .eq('broadcast_id', id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(PAGE)

      if (!pending || pending.length === 0) {
        keepGoing = false
        break
      }

      for (const recipient of pending) {
        if (Date.now() - startedAt >= TIME_BUDGET_MS) break
        const contact = Array.isArray(recipient.contact) ? recipient.contact[0] : recipient.contact
        const result = await sendOneBroadcastRecipient(
          admin,
          { id: broadcast.id, template_name: broadcast.template_name, template_language: broadcast.template_language },
          { id: recipient.id, params: (recipient.params as Record<string, string>) ?? {}, phone: contact?.phone ?? null },
          config,
          templateRow,
        )
        if (result.success) summary.sent++
        else summary.failed++
      }

      if (pending.length < PAGE) keepGoing = false
    }

    const { count: stillPending } = await admin
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', id)
      .eq('status', 'pending')
    summary.remaining = stillPending ?? 0

    if (summary.remaining === 0) {
      const { count: failedCount } = await admin
        .from('broadcast_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', id)
        .eq('status', 'failed')
      const { count: totalCount } = await admin
        .from('broadcast_recipients')
        .select('id', { count: 'exact', head: true })
        .eq('broadcast_id', id)
      const finalStatus = totalCount && failedCount === totalCount ? 'failed' : 'sent'
      await admin.from('broadcasts').update({ status: finalStatus, last_sent_at: new Date().toISOString() }).eq('id', id)
    } else {
      // Time budget ran out with recipients still pending — leave it
      // 'sending' so the cron worker finishes the rest on its normal
      // schedule instead of getting stuck.
      await admin
        .from('broadcasts')
        .update({ last_sent_at: new Date().toISOString() })
        .eq('id', id)
    }

    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('Error in broadcasts/[id]/send-now:', err)
    return NextResponse.json({ error: 'Falha ao enviar agora.' }, { status: 500 })
  }
}
