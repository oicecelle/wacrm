import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * Marks a document as viewed the first time its public signing link is
 * opened — the missing middle step of the sent -> viewed -> signed
 * funnel (sent_at and signed_at already existed; viewed_at didn't).
 * No auth here by design: this route exists precisely because the
 * caller is an unauthenticated patient following a public link, the
 * same trust boundary the page itself already crosses to read the
 * document by public_token. Idempotent — only ever sets viewed_at
 * once, on the first open.
 */
export async function POST(request: Request) {
  try {
    const { token } = await request.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: doc } = await admin
      .from('documents')
      .select('id, patient_id, title, viewed_at, status')
      .eq('public_token', token)
      .maybeSingle()

    if (!doc) {
      return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    }

    // Already viewed, or already signed (viewing after signing isn't
    // a meaningful new event) — nothing to do.
    if (doc.viewed_at || doc.status === 'signed') {
      return NextResponse.json({ success: true, alreadyViewed: true })
    }

    await admin.from('documents').update({ viewed_at: new Date().toISOString() }).eq('id', doc.id)

    if (doc.patient_id) {
      await admin.from('patient_timeline').insert({
        patient_id: doc.patient_id,
        event_type: 'document_viewed',
        title: `Documento visualizado: ${doc.title || 'Documento'}`,
        payload: { document_id: doc.id },
      })
    }

    return NextResponse.json({ success: true, alreadyViewed: false })
  } catch (err) {
    console.error('Error in documents/mark-viewed:', err)
    return NextResponse.json({ error: 'Falha ao registrar visualização.' }, { status: 500 })
  }
}
