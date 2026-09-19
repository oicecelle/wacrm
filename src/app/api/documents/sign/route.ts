import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/flows/admin-client'

/**
 * Records a document signature with a real audit trail — IP address
 * and user agent read from the request itself, not a placeholder
 * string. An earlier version of the signing flow wrote the literal
 * text "Portal do Paciente (IP Registrado)" into the IP field, which
 * is worse than recording nothing: it looks like real evidence to
 * anyone reviewing the trail later without being any. Moving the
 * write server-side is also what makes real IP capture possible at
 * all — the browser can't see its own public IP, only a server
 * request can.
 *
 * No auth here by design — same public trust boundary as
 * mark-viewed: the caller is an unauthenticated patient with a
 * possession-only link, not a logged-in user.
 */
export async function POST(request: Request) {
  try {
    const { token, signatureDataUrl } = await request.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Token ausente.' }, { status: 400 })
    }
    if (!signatureDataUrl || typeof signatureDataUrl !== 'string') {
      return NextResponse.json({ error: 'Assinatura ausente.' }, { status: 400 })
    }

    const admin = supabaseAdmin()
    const { data: doc } = await admin
      .from('documents')
      .select('id, patient_id, title, content, status')
      .eq('public_token', token)
      .maybeSingle()

    if (!doc) {
      return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 })
    }
    if (doc.status === 'signed') {
      return NextResponse.json({ error: 'Este documento já foi assinado.' }, { status: 400 })
    }

    // x-forwarded-for can carry a comma-separated chain when the
    // request passed through multiple proxies — the first entry is
    // the original client.
    const forwardedFor = request.headers.get('x-forwarded-for')
    const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : (request.headers.get('x-real-ip') ?? 'desconhecido')
    const userAgent = request.headers.get('user-agent') ?? 'desconhecido'
    const signedAt = new Date().toISOString()

    const originalContent =
      typeof doc.content === 'object' && doc.content !== null ? doc.content : { text: doc.content || '' }

    // A real SHA-256 of the exact text the patient was shown and
    // agreed to — ties the signature to that specific content, so
    // any later edit to the stored document would produce a
    // different hash and be detectable. Computed over the text/body
    // the portal actually rendered, not the whole content object
    // (which also carries fields like the signature image itself,
    // which don't exist yet at signing time).
    const bodyForHash = String((originalContent as Record<string, unknown>).text ?? (originalContent as Record<string, unknown>).body ?? '')
    const contentHash = createHash('sha256').update(bodyForHash, 'utf8').digest('hex')

    const { error: updateErr } = await admin
      .from('documents')
      .update({
        status: 'signed',
        signed_at: signedAt,
        content: {
          ...originalContent,
          signature_image: signatureDataUrl,
          signature_ip: ip,
          signature_user_agent: userAgent,
          signature_content_hash: contentHash,
        },
      })
      .eq('id', doc.id)

    if (updateErr) throw updateErr

    if (doc.patient_id) {
      await admin.from('patient_timeline').insert({
        patient_id: doc.patient_id,
        event_type: 'document',
        title: `Documento [${doc.title}] assinado digitalmente pelo paciente`,
        payload: { document_id: doc.id, signed_at: signedAt, ip, user_agent: userAgent, content_hash: contentHash },
      })
    }

    return NextResponse.json({ success: true, signedAt, ip, contentHash })
  } catch (err) {
    console.error('Error in documents/sign:', err)
    return NextResponse.json({ error: 'Falha ao registrar a assinatura.' }, { status: 500 })
  }
}
