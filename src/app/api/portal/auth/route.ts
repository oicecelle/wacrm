import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { dispatchSendMessage } from '@/lib/whatsapp/sender-dispatcher';
import { encrypt, decrypt } from '@/lib/whatsapp/encryption';

// Lazy-initialized admin client to bypass RLS for auth flows
let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcmhleGZjYnRkeXViZWhiem1sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg4NTQ1NywiZXhwIjoyMDg5NDYxNDU3fQ.YWlajoXWep2Gj4Zst0O85G9mwFaO-o8aFuGmcpQnxKk')
    );
  }
  return _adminClient;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, phone, slug, code } = body;

    if (!phone || !slug || !action) {
      return NextResponse.json({ error: 'Parâmetros ausentes' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const normalizedPhone = normalizePhone(phone);

    // 1. Resolve clinic by slug
    const { data: clinic, error: clinicErr } = await db
      .from('clinics')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();

    if (clinicErr || !clinic) {
      return NextResponse.json({ error: 'Clínica não encontrada' }, { status: 404 });
    }

    // 2. Resolve patient in this clinic
    const { data: patient, error: patientErr } = await db
      .from('patients')
      .select('id, name, phone')
      .eq('clinic_id', clinic.id)
      .maybeSingle(); // In production, we'd query by phone too. Let's do a flex matching:
      
    // Since phone formatting in the DB could be different, we fetch all patients and match by normalized phone.
    const { data: allPatients } = await db
      .from('patients')
      .select('id, name, phone')
      .eq('clinic_id', clinic.id);

    const targetPatient = (allPatients || []).find((p: any) => normalizePhone(p.phone) === normalizedPhone);

    if (!targetPatient) {
      return NextResponse.json({ error: 'Paciente não cadastrado nesta clínica' }, { status: 404 });
    }

    if (action === 'request-otp') {
      // 3. Generate 6-digit OTP code
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      // Delete old OTPs for this phone in the clinic
      await db
        .from('portal_otps')
        .delete()
        .eq('phone', normalizedPhone)
        .eq('clinic_id', clinic.id);

      // Save new OTP
      const { error: otpInsertErr } = await db.from('portal_otps').insert({
        phone: normalizedPhone,
        clinic_id: clinic.id,
        code: otpCode,
        expires_at: expiresAt,
      });

      if (otpInsertErr) {
        throw otpInsertErr;
      }

      // Log OTP code in development console for easy debugging
      console.log(`[Portal OTP] Código gerado para ${normalizedPhone} na clínica ${clinic.name}: ${otpCode}`);

      // 4. Try sending OTP via clinic's connected WhatsApp channel
      const { data: wsConfig } = await db
        .from('whatsapp_config')
        .select('*')
        .eq('account_id', clinic.id)
        .eq('status', 'connected')
        .maybeSingle();

      let messageSent = false;
      let sendError = null;

      if (wsConfig) {
        const messageText = `Seu código de acesso para o Portal do Paciente da clínica *${clinic.name}* é: *${otpCode}*.\n\nEste código é válido por 10 minutos.`;
        
        try {
          if (wsConfig.provider_type === 'uazapi') {
            const res = await dispatchSendMessage({
              config: {
                provider_type: 'uazapi',
                uazapi_token: wsConfig.uazapi_token,
                uazapi_base_url: wsConfig.uazapi_base_url,
                uazapi_instance_name: wsConfig.uazapi_instance_name,
              },
              to: normalizedPhone,
              messageType: 'text',
              content_text: messageText,
            });
            messageSent = res.success;
            sendError = res.error;
          } else {
            // For Meta fallback to text (since template might not exist yet)
            const res = await dispatchSendMessage({
              config: {
                provider_type: 'meta',
                phone_number_id: wsConfig.phone_number_id,
                access_token: wsConfig.access_token,
              },
              to: normalizedPhone,
              messageType: 'text',
              content_text: messageText,
            });
            messageSent = res.success;
            sendError = res.error;
          }
        } catch (err: any) {
          sendError = err.message;
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Código enviado com sucesso!',
        // Retornamos o código na resposta em ambiente local/debug para facilitar o teste
        debugCode: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
        whatsappSent: messageSent,
        whatsappError: sendError,
      });

    } else if (action === 'verify-otp') {
      if (!code) {
        return NextResponse.json({ error: 'Código OTP não informado' }, { status: 400 });
      }

      // Query OTP matching parameters
      const { data: otpMatch, error: otpMatchErr } = await db
        .from('portal_otps')
        .select('id, expires_at')
        .eq('phone', normalizedPhone)
        .eq('clinic_id', clinic.id)
        .eq('code', code.trim())
        .maybeSingle();

      if (otpMatchErr || !otpMatch) {
        return NextResponse.json({ error: 'Código de verificação incorreto' }, { status: 400 });
      }

      // Check expiration
      if (new Date(otpMatch.expires_at).getTime() < Date.now()) {
        await db.from('portal_otps').delete().eq('id', otpMatch.id);
        return NextResponse.json({ error: 'Código de verificação expirado' }, { status: 400 });
      }

      // Delete verification OTP row
      await db.from('portal_otps').delete().eq('id', otpMatch.id);

      // Create encrypted session token
      const sessionPayload = {
        patientId: targetPatient.id,
        clinicId: clinic.id,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      };

      const token = encrypt(JSON.stringify(sessionPayload));

      return NextResponse.json({
        success: true,
        token,
        patient: {
          id: targetPatient.id,
          name: targetPatient.name,
          phone: targetPatient.phone,
        },
        clinic: {
          id: clinic.id,
          name: clinic.name,
        }
      });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (err: any) {
    console.error('Error in portal auth endpoint:', err);
    return NextResponse.json({ error: err.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
