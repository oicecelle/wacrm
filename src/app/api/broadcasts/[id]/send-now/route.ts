import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * "Enviar agora" for a whole waiting/in-progress broadcast — pulls its
 * scheduled_at to right now and clears last_sent_at so the interval
 * pacing in the cron worker restarts fresh, making every recipient
 * immediately due instead of waiting out the original schedule. Actual
 * delivery still happens on the next cron tick (up to ~1 minute later
 * with the standard setup), not synchronously in this request — a
 * broadcast can have thousands of recipients, well past what a single
 * request should attempt inline.
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

    const { data: broadcast, error: fetchError } = await supabase
      .from('broadcasts')
      .select('id, status')
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

    const { error: updateError } = await supabase
      .from('broadcasts')
      .update({ status: 'scheduled', scheduled_at: new Date().toISOString(), last_sent_at: null })
      .eq('id', id)
      .eq('account_id', accountId)

    if (updateError) {
      return NextResponse.json({ error: `Falha ao atualizar o disparo: ${updateError.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in broadcasts/[id]/send-now:', err)
    return NextResponse.json({ error: 'Falha ao enviar agora.' }, { status: 500 })
  }
}
