import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'

/**
 * Sends an already-saved quote's message straight through the
 * account's configured WhatsApp provider — no wa.me redirect, no
 * WhatsApp Web tab, no manual "send" click left for the user. Mirrors
 * send-ciente/route.ts's pattern (the other "message not tied to an
 * existing open conversation" sender in this app).
 */
export async function POST(request: Request) {
  try {
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

    const { quote_id, message_text } = await request.json()
    if (!quote_id || !message_text) {
      return NextResponse.json({ error: 'quote_id e message_text são obrigatórios.' }, { status: 400 })
    }

    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('id, contact_id, status, total_value')
      .eq('id', quote_id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (quoteErr || !quote) {
      return NextResponse.json({ error: 'Orçamento não encontrado.' }, { status: 404 })
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('id', quote.contact_id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!contact?.phone) {
      return NextResponse.json({ error: 'Este contato não tem WhatsApp cadastrado.' }, { status: 400 })
    }

    const { data: wsConfig } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!wsConfig) {
      return NextResponse.json({ error: 'WhatsApp não configurado para esta conta.' }, { status: 400 })
    }

    const dispatchRes = await dispatchSendMessage({
      config: {
        provider_type: wsConfig.provider_type,
        phone_number_id: wsConfig.phone_number_id,
        access_token: wsConfig.access_token,
        uazapi_token: wsConfig.uazapi_token,
        uazapi_base_url: wsConfig.uazapi_base_url,
        uazapi_instance_name: wsConfig.uazapi_instance_name,
      },
      to: contact.phone,
      messageType: 'text',
      content_text: message_text,
    })

    if (!dispatchRes.success) {
      return NextResponse.json({ error: dispatchRes.error || 'Falha ao enviar pelo WhatsApp.' }, { status: 500 })
    }

    const sentAt = new Date().toISOString()
    await supabase
      .from('quotes')
      .update({ status: 'sent', sent_at: sentAt, message_text })
      .eq('id', quote_id)

    await supabase.from('contact_timeline').insert({
      account_id: accountId,
      contact_id: contact.id,
      event_type: 'quote_sent',
      title: `Orçamento enviado via WhatsApp — ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(quote.total_value)}`,
      description: message_text,
      metadata: { quote_id, sent_at: sentAt },
    })

    return NextResponse.json({ success: true, sentAt })
  } catch (err) {
    console.error('Error in quotes/send:', err)
    return NextResponse.json({ error: 'Falha ao enviar o orçamento.' }, { status: 500 })
  }
}
