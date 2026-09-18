import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { sendOneBroadcastRecipient } from '@/lib/whatsapp/broadcast-sender'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'

/**
 * Sends a single recipient immediately, synchronously, bypassing the
 * cron worker's interval pacing entirely — this is a deliberate,
 * one-off "just this one, right now" action, not a schedule change,
 * so there's no batching/pacing concern the way there is for the
 * whole-broadcast send-now.
 */
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

    // Ownership verified with the RLS-scoped client; the actual send
    // uses the admin client below only because it needs to write
    // whatsapp_config.uazapi_token/access_token, which regular users
    // can't read directly — same split the cron worker uses.
    const { data: recipient, error: fetchError } = await supabase
      .from('broadcast_recipients')
      .select(
        'id, params, contact_id, broadcast_id, contact:contacts(phone), broadcasts!inner(id, account_id, template_name, template_language)',
      )
      .eq('id', id)
      .eq('broadcasts.account_id', accountId)
      .maybeSingle()

    if (fetchError || !recipient) {
      return NextResponse.json({ error: 'Destinatário não encontrado.' }, { status: 404 })
    }

    const broadcast = Array.isArray(recipient.broadcasts) ? recipient.broadcasts[0] : recipient.broadcasts
    const contact = Array.isArray(recipient.contact) ? recipient.contact[0] : recipient.contact

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

    const result = await sendOneBroadcastRecipient(
      admin,
      { id: broadcast.id, template_name: broadcast.template_name, template_language: broadcast.template_language },
      { id: recipient.id, params: (recipient.params as Record<string, string>) ?? {}, phone: contact?.phone ?? null },
      config,
      templateRow,
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Falha ao enviar.' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in broadcasts/recipients/[id]/send-now:', err)
    return NextResponse.json({ error: 'Falha ao enviar destinatário.' }, { status: 500 })
  }
}
