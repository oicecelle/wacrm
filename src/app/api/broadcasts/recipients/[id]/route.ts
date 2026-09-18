import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Edits one recipient row within a still-pending broadcast — its
 * variables (broadcast_recipients.params) and, if provided, the
 * linked contact's name/phone. Only allowed while the recipient
 * itself hasn't been sent yet; editing something already delivered
 * would be misleading (the message that actually went out can't be
 * un-sent).
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const body = await request.json()
    const { name, phone, params: variables } = body as {
      name?: string
      phone?: string
      params?: Record<string, string>
    }

    // Ownership check happens through the broadcast, not the recipient
    // row directly — broadcast_recipients has no account_id column of
    // its own (see migration history), so the join to broadcasts is
    // what proves this row belongs to the caller's account.
    const { data: recipient, error: fetchError } = await supabase
      .from('broadcast_recipients')
      .select('id, status, contact_id, broadcasts!inner(account_id)')
      .eq('id', id)
      .eq('broadcasts.account_id', accountId)
      .maybeSingle()

    if (fetchError || !recipient) {
      return NextResponse.json({ error: 'Destinatário não encontrado.' }, { status: 404 })
    }
    if (recipient.status !== 'pending') {
      return NextResponse.json(
        { error: 'Só é possível editar um destinatário que ainda está aguardando envio.' },
        { status: 400 },
      )
    }

    if (variables) {
      const { error: updateError } = await supabase
        .from('broadcast_recipients')
        .update({ params: variables })
        .eq('id', id)
      if (updateError) {
        return NextResponse.json({ error: `Falha ao salvar variáveis: ${updateError.message}` }, { status: 500 })
      }
    }

    if ((name || phone) && recipient.contact_id) {
      const contactPatch: Record<string, string> = {}
      if (name) contactPatch.name = name
      if (phone) contactPatch.phone = phone
      const { error: contactError } = await supabase
        .from('contacts')
        .update(contactPatch)
        .eq('id', recipient.contact_id)
        .eq('account_id', accountId)
      if (contactError) {
        return NextResponse.json(
          { error: `Falha ao salvar dados do contato: ${contactError.message}` },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in broadcasts/recipients/[id] PATCH:', err)
    return NextResponse.json({ error: 'Falha ao editar destinatário.' }, { status: 500 })
  }
}
