import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher'
import { randomBytes } from 'crypto'

/**
 * Turns an "Assinar Digitalmente" checkbox the clinic ticks on its own
 * — which never involved the patient at all — into a real signature
 * request: creates an actual document (same signing infrastructure
 * used everywhere else: public token, real IP + hash on signing),
 * sends the link over WhatsApp, and links it back to the evolution
 * so the clinic can tell "requested" from "actually signed by the
 * patient" instead of just trusting its own checkbox.
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

    const { evolution_id } = await request.json()
    if (!evolution_id) {
      return NextResponse.json({ error: 'evolution_id é obrigatório.' }, { status: 400 })
    }

    const { data: evolution } = await supabase
      .from('clinical_evolutions')
      .select('id, content, patient_id, clinic_id, created_at')
      .eq('id', evolution_id)
      .eq('clinic_id', accountId)
      .maybeSingle()
    if (!evolution) {
      return NextResponse.json({ error: 'Evolução não encontrada.' }, { status: 404 })
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, name, phone')
      .eq('id', evolution.patient_id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (!contact?.phone) {
      return NextResponse.json({ error: 'Este paciente não tem WhatsApp cadastrado.' }, { status: 400 })
    }

    const token = randomBytes(16).toString('hex')
    const evolutionDate = new Date(evolution.created_at).toLocaleString('pt-BR')
    const consentText = `TERMO DE CIÊNCIA DE ATENDIMENTO\n\nPaciente: ${contact.name || 'Paciente'}\nData/hora do atendimento: ${evolutionDate}\n\nDescrição do que foi realizado:\n${evolution.content}\n\nAo assinar abaixo, declaro estar ciente de que o atendimento acima descrito foi realizado na data e horário indicados.`

    const { data: newDoc, error: docErr } = await supabase
      .from('documents')
      .insert({
        clinic_id: accountId,
        patient_id: evolution.patient_id,
        title: `Ciência de Atendimento — ${evolutionDate}`,
        type: 'consentimento',
        status: 'pending',
        sent_via: 'whatsapp',
        sent_at: new Date().toISOString(),
        public_token: token,
        content: { text: consentText },
      })
      .select('id')
      .single()
    if (docErr) throw docErr

    await supabase
      .from('clinical_evolutions')
      .update({ consent_document_id: newDoc.id, consent_requested_at: new Date().toISOString() })
      .eq('id', evolution_id)

    const { data: wsConfig } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!wsConfig) {
      return NextResponse.json({ error: 'WhatsApp não configurado para esta conta.' }, { status: 400 })
    }

    const portalLink = `${new URL(request.url).origin}/portal/documento/${token}`
    const message = `Olá, ${contact.name || ''}! Pra confirmar que você está ciente do atendimento realizado em ${evolutionDate}, por favor assine este termo simples:\n\n${portalLink}`

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
      content_text: message,
    })

    if (!dispatchRes.success) {
      return NextResponse.json({ error: dispatchRes.error || 'Falha ao enviar pelo WhatsApp.' }, { status: 500 })
    }

    await supabase.from('contact_timeline').insert({
      account_id: accountId,
      contact_id: evolution.patient_id,
      event_type: 'document_sent',
      title: 'Termo de ciência de atendimento enviado',
      description: `Referente ao atendimento de ${evolutionDate}.`,
      metadata: { document_id: newDoc.id, evolution_id },
    })

    return NextResponse.json({ success: true, documentId: newDoc.id })
  } catch (err) {
    console.error('Error in evolutions/send-consent:', err)
    return NextResponse.json({ error: 'Falha ao enviar para assinatura.' }, { status: 500 })
  }
}
