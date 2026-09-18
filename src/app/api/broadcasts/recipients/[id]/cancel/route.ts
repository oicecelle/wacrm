import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** Cancels one pending recipient — the cron worker only ever picks up
 *  status='pending' rows, so 'cancelled' is simply skipped forever,
 *  no worker changes needed. */
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

    const { data: recipient, error: fetchError } = await supabase
      .from('broadcast_recipients')
      .select('id, status, broadcasts!inner(account_id)')
      .eq('id', id)
      .eq('broadcasts.account_id', accountId)
      .maybeSingle()

    if (fetchError || !recipient) {
      return NextResponse.json({ error: 'Destinatário não encontrado.' }, { status: 404 })
    }
    if (recipient.status !== 'pending') {
      return NextResponse.json(
        { error: 'Só é possível cancelar um destinatário que ainda está aguardando envio.' },
        { status: 400 },
      )
    }

    const { error: updateError } = await supabase
      .from('broadcast_recipients')
      .update({ status: 'cancelled', error_message: 'Cancelado manualmente' })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: `Falha ao cancelar: ${updateError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in broadcasts/recipients/[id]/cancel:', err)
    return NextResponse.json({ error: 'Falha ao cancelar destinatário.' }, { status: 500 })
  }
}
