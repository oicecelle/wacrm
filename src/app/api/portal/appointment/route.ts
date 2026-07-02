import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { decrypt } from '@/lib/whatsapp/encryption';

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

export async function POST(request: Request) {
  try {
    // 1. Authenticate patient token
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Token de autenticação não fornecido' }, { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    let session: { patientId: string; clinicId: string; expiresAt: number };
    try {
      session = JSON.parse(decrypt(token));
    } catch {
      return NextResponse.json({ error: 'Sessão inválida ou expirada' }, { status: 401 });
    }

    if (session.expiresAt < Date.now()) {
      return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 });
    }

    const body = await request.json();
    const { action, appointmentId, date, slot, professionalId } = body;
    const db = supabaseAdmin();

    // Check if portal functions are enabled for the clinic
    const { data: portalSet } = await db
      .from('portal_settings')
      .select('enabled_scheduling, enabled_cancellation, enabled_rescheduling')
      .eq('account_id', session.clinicId)
      .maybeSingle();

    const portalConfig = portalSet || {
      enabled_scheduling: true,
      enabled_cancellation: true,
      enabled_rescheduling: true,
    };

    if (action === 'get-history') {
      // 2. Fetch appointments
      const { data: appointments } = await db
        .from('appointments')
        .select(`
          id,
          start_time,
          end_time,
          status,
          notes,
          professional:profiles(name)
        `)
        .eq('patient_id', session.patientId)
        .eq('clinic_id', session.clinicId)
        .order('start_time', { ascending: false });

      // 3. Fetch patient timeline feed (documents, signatures, etc.)
      const { data: timeline } = await db
        .from('patient_timeline')
        .select('*')
        .eq('patient_id', session.patientId)
        .order('created_at', { ascending: false });

      // 4. Fetch portal configuration & banners
      const { data: settings } = await db
        .from('portal_settings')
        .select('*')
        .eq('account_id', session.clinicId)
        .maybeSingle();

      const { data: clinicData } = await db
        .from('clinics')
        .select('name, whatsapp_url, phone, address')
        .eq('id', session.clinicId)
        .maybeSingle();

      return NextResponse.json({
        appointments: appointments || [],
        timeline: timeline || [],
        settings: settings || null,
        clinic: clinicData || null,
      });

    } else if (action === 'get-slots') {
      if (!date) {
        return NextResponse.json({ error: 'Data não informada' }, { status: 400 });
      }

      // Get all staff profiles in the clinic
      const { data: staff } = await db
        .from('profiles')
        .select('id, name')
        .eq('clinic_id', session.clinicId)
        .eq('status', 'active');

      if (!staff || staff.length === 0) {
        return NextResponse.json({ slots: [] });
      }

      // Fetch appointments for this clinic on the selected date
      const startOfDay = `${date}T00:00:00Z`;
      const endOfDay = `${date}T23:59:59Z`;

      const { data: dayAppts } = await db
        .from('appointments')
        .select('id, start_time, end_time, professional_id')
        .eq('clinic_id', session.clinicId)
        .gte('start_time', startOfDay)
        .lte('start_time', endOfDay)
        .neq('status', 'cancelled');

      // Define default working hours: 08:00 to 18:00 (1 hour slots)
      const workingHours = [
        '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'
      ];

      const slots = workingHours.map(timeStr => {
        const slotStartISO = `${date}T${timeStr}:00.000Z`;
        const slotStart = new Date(slotStartISO);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1 hour duration

        // Find which staff members are free at this slot
        const availableStaff = staff.filter((prof: any) => {
          const hasOverlap = (dayAppts || []).some((appt: any) => {
            if (appt.professional_id !== prof.id) return false;
            const apptStart = new Date(appt.start_time);
            const apptEnd = new Date(appt.end_time);
            // Overlap check
            return apptStart < slotEnd && apptEnd > slotStart;
          });
          return !hasOverlap;
        });

        return {
          time: timeStr,
          isoString: slotStartISO,
          available: availableStaff.length > 0,
          professionals: availableStaff,
        };
      });

      return NextResponse.json({ slots });

    } else if (action === 'book') {
      if (!portalConfig.enabled_scheduling) {
        return NextResponse.json({ error: 'Agendamento online desativado pela clínica' }, { status: 403 });
      }
      if (!slot || !professionalId) {
        return NextResponse.json({ error: 'Horário ou profissional não selecionados' }, { status: 400 });
      }

      const startObj = new Date(slot);
      const endObj = new Date(startObj.getTime() + 60 * 60 * 1000); // 1 hour

      // Insert appointment
      const { data: newAppt, error: apptErr } = await db
        .from('appointments')
        .insert({
          clinic_id: session.clinicId,
          patient_id: session.patientId,
          professional_id: professionalId,
          start_time: startObj.toISOString(),
          end_time: endObj.toISOString(),
          status: 'provisional',
          notes: 'Agendado pelo Portal do Paciente',
        })
        .select('id')
        .single();

      if (apptErr) throw apptErr;

      // Log in timeline
      await db.from('patient_timeline').insert({
        patient_id: session.patientId,
        event_type: 'appointment_created',
        title: 'Consulta Pré-Agendada',
        payload: {
          appointment_id: newAppt.id,
          start_time: startObj.toISOString(),
          origin: 'portal',
        },
      });

      return NextResponse.json({ success: true, appointmentId: newAppt.id });

    } else if (action === 'cancel') {
      if (!portalConfig.enabled_cancellation) {
        return NextResponse.json({ error: 'Cancelamento online desativado pela clínica' }, { status: 403 });
      }
      if (!appointmentId) {
        return NextResponse.json({ error: 'Código do agendamento não informado' }, { status: 400 });
      }

      // Check if appointment belongs to this patient
      const { data: existingAppt } = await db
        .from('appointments')
        .select('id, start_time')
        .eq('id', appointmentId)
        .eq('patient_id', session.patientId)
        .maybeSingle();

      if (!existingAppt) {
        return NextResponse.json({ error: 'Agendamento inválido ou não pertencente a este paciente' }, { status: 404 });
      }

      // Update status to cancelled
      const { error: cancelErr } = await db
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId);

      if (cancelErr) throw cancelErr;

      // Log in timeline
      await db.from('patient_timeline').insert({
        patient_id: session.patientId,
        event_type: 'appointment_cancelled',
        title: 'Consulta Cancelada',
        payload: {
          appointment_id: appointmentId,
          start_time: existingAppt.start_time,
          cancelled_by: 'patient',
          origin: 'portal',
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (err: any) {
    console.error('Error in portal appointment API:', err);
    return NextResponse.json({ error: err.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
