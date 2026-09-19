import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendOneBroadcastRecipient } from '@/lib/whatsapp/broadcast-sender'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'

// Retries every recipient currently at status='failed' for this
// broadcast — same pacing as send-now (respects interval_seconds
// between each attempt) and the same time-budget/paging shape, just
// scoped to the failed subset instead of the pending one.
export const maxDuration = 60
const TIME_BUDGET_MS = 50_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
      .select('id, status, template_name, template_language, interval_seconds')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Disparo não encontrado.' }, { status: 404 })
    }

    const intervalMs = Math.max(1, broadcast.interval_seconds ?? 5) * 1000
    const admin = supabaseAdmin()

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

    const PAGE = 200
    let keepGoing = true
    let isFirstSend = true
    while (keepGoing && Date.now() - startedAt < TIME_BUDGET_MS) {
      const { data: failedBatch } = await admin
        .from('broadcast_recipients')
        .select('id, params, contact:contacts(phone)')
        .eq('broadcast_id', id)
        .eq('status', 'failed')
        .order('created_at', { ascending: true })
        .limit(PAGE)

      if (!failedBatch || failedBatch.length === 0) {
        keepGoing = false
        break
      }

      for (const recipient of failedBatch) {
        if (Date.now() - startedAt >= TIME_BUDGET_MS) break

        if (!isFirstSend && intervalMs < TIME_BUDGET_MS - (Date.now() - startedAt)) {
          await sleep(intervalMs)
        }
        isFirstSend = false

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

      // Re-querying status='failed' each pass naturally excludes rows
      // that just succeeded, so this loop converges even without a
      // separate "processed" marker.
      if (failedBatch.length < PAGE) keepGoing = false
    }

    const { count: stillFailed } = await admin
      .from('broadcast_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('broadcast_id', id)
      .eq('status', 'failed')
    summary.remaining = stillFailed ?? 0

    await admin.from('broadcasts').update({ last_sent_at: new Date().toISOString() }).eq('id', id)

    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('Error in broadcasts/[id]/retry-failed:', err)
    return NextResponse.json({ error: 'Falha ao reenviar.' }, { status: 500 })
  }
}
