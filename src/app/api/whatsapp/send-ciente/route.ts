import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Resolve clinic ID
    const { data: profile } = await supabase
      .from('profiles')
      .select('account_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const clinicId = profile?.account_id;
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic not found for user' }, { status: 403 });
    }

    const { record_id, patient_id } = await request.json();
    if (!record_id || !patient_id) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Fetch the patient record
    const { data: rec } = await supabase
      .from('patient_records')
      .select('*')
      .eq('id', record_id)
      .eq('patient_id', patient_id)
      .maybeSingle();

    if (!rec) {
      return NextResponse.json({ error: 'Patient record not found' }, { status: 404 });
    }

    // Fetch the contact phone
    const { data: contact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', patient_id)
      .maybeSingle();

    if (!contact || !contact.phone) {
      return NextResponse.json({ error: 'Patient phone number not found' }, { status: 404 });
    }

    // Fetch WhatsApp config
    const { data: wsConfig } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', clinicId)
      .maybeSingle();

    if (!wsConfig) {
      return NextResponse.json({ error: 'WhatsApp is not configured for this clinic' }, { status: 400 });
    }

    // Generate message content
    let text = `Olá, ${contact.name || 'Paciente'}! Segue o registro do seu atendimento de hoje: "${rec.title || 'Evolução Clínica'}".`;
    if (rec.content) {
      text += `\n\nDetalhes:\n${rec.content}`;
    }
    if (rec.file_url) {
      text += `\n\nLink do arquivo para visualização: ${rec.file_url}`;
    }
    text += `\n\nPor favor, responda "Ciente" nesta conversa para confirmar o recebimento e ciência.`;

    console.log(`[Send Ciente] Dispatching WhatsApp message to ${contact.phone}...`);

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
      content_text: text,
    });

    if (dispatchRes.success) {
      // Update patient_records
      await supabase
        .from('patient_records')
        .update({ ciente_sent_at: new Date().toISOString() })
        .eq('id', record_id);

      // Write timeline event
      await supabase.from('contact_timeline').insert({
        account_id: clinicId,
        contact_id: patient_id,
        event_type: 'payment',
        title: 'Ciência solicitada via WhatsApp',
        description: `Mensagem de ciente clínico enviada para obter confirmação do paciente.`,
        metadata: { by: 'system', record_id, message: text }
      });

      return NextResponse.json({ success: true });
    } else {
      console.error('[Send Ciente] WhatsApp dispatch error:', dispatchRes.error);
      return NextResponse.json({ error: 'Failed to send message via WhatsApp', details: dispatchRes.error }, { status: 500 });
    }
  } catch (err: any) {
    console.error('[Send Ciente] Server error:', err);
    return NextResponse.json({ error: 'Server error', details: err.message }, { status: 500 });
  }
}
