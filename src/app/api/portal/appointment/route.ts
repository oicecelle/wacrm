import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/env';
import { decrypt } from '@/lib/whatsapp/encryption';

let _adminClient: any = null;
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    );
  }
  return _adminClient;
}

// Surfaces a client-initiated portal action (booked/rescheduled/
// cancelled) to the clinic — reuses system_alerts, the same table
// the dashboard's top banner already polls every 5 minutes, so no
// new UI plumbing is needed for the clinic to actually see this.
async function notifyClinicOfPortalAction(
  db: any,
  clinicId: string,
  patientId: string,
  actionLabel: string,
  when: Date,
) {
  try {
    const { data: patient } = await db.from('contacts').select('name').eq('id', patientId).maybeSingle();
    const patientName = patient?.name || 'Um paciente';
    await db.from('system_alerts').insert({
      clinic_id: clinicId,
      severity: 'info',
      title: 'Ação no Portal do Paciente',
      message: `${patientName} ${actionLabel} pelo portal, para ${when.toLocaleString('pt-BR')}.`,
    });
  } catch (err) {
    // Never let a notification failure block the actual booking/
    // cancel/reschedule the patient is waiting on.
    console.error('[portal/appointment] Failed to notify clinic:', err);
  }
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

      // 5. Packages — real credit/session data, not decorative text.
      const { data: packages } = await db
        .from('patient_packages')
        .select('id, package_name, sessions_total, sessions_used, status, expires_at')
        .eq('patient_id', session.patientId)
        .order('created_at', { ascending: false });

      // 6. Clinical evolutions (notes) — patient-facing view only ever
      // shows ones the clinic marked as shared.
      const { data: evolutions } = await db
        .from('clinical_evolutions')
        .select('id, created_at, content, shared')
        .eq('patient_id', session.patientId)
        .eq('shared', true)
        .order('created_at', { ascending: false });

      // Progress photos live as their own patient_timeline events
      // (event_type 'emr_photo'), not attached to a specific
      // evolution note — same source the clinic's own "Fotos de
      // Acompanhamento" section already reads from.
      const { data: photoEvents } = await db
        .from('patient_timeline')
        .select('id, created_at, payload')
        .eq('patient_id', session.patientId)
        .eq('event_type', 'emr_photo')
        .order('created_at', { ascending: false });

      // 7. Documents — real signing status + link to the actual
      // signing portal, not just a status label with no way to act.
      const { data: documents } = await db
        .from('documents')
        .select('id, title, type, status, public_token, created_at, signed_at')
        .eq('patient_id', session.patientId)
        .order('created_at', { ascending: false });

      return NextResponse.json({
        appointments: appointments || [],
        timeline: timeline || [],
        settings: settings || null,
        clinic: clinicData || null,
        packages: packages || [],
        evolutions: evolutions || [],
        photos: photoEvents || [],
        documents: documents || [],
      });

    } else if (action === 'get-slots') {
      if (!date) {
        return NextResponse.json({ error: 'Data não informada' }, { status: 400 });
      }

      // Get all active staff in the clinic — appointments.professional_id
      // references clinic_users.id, not profiles.id, and profiles has
      // no clinic_id/status columns at all (this query always returned
      // nothing before, so online booking never actually had anyone to
      // book with).
      const { data: staff } = await db
        .from('clinic_users')
        .select('id, name')
        .eq('clinic_id', session.clinicId)
        .eq('is_active', true);

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

      await notifyClinicOfPortalAction(db, session.clinicId, session.patientId, 'agendou uma consulta', startObj);

      return NextResponse.json({ success: true, appointmentId: newAppt.id });

    } else if (action === 'reschedule') {
      if (!portalConfig.enabled_rescheduling) {
        return NextResponse.json({ error: 'Remarcação online desativada pela clínica' }, { status: 403 });
      }
      if (!appointmentId || !slot) {
        return NextResponse.json({ error: 'Agendamento ou novo horário não informados' }, { status: 400 });
      }

      const { data: existingForReschedule } = await db
        .from('appointments')
        .select('id, start_time, end_time')
        .eq('id', appointmentId)
        .eq('patient_id', session.patientId)
        .maybeSingle();

      if (!existingForReschedule) {
        return NextResponse.json({ error: 'Agendamento inválido ou não pertencente a este paciente' }, { status: 404 });
      }

      const newStart = new Date(slot);
      const durationMs =
        new Date(existingForReschedule.end_time).getTime() - new Date(existingForReschedule.start_time).getTime();
      const newEnd = new Date(newStart.getTime() + (durationMs > 0 ? durationMs : 60 * 60 * 1000));

      const { error: rescheduleErr } = await db
        .from('appointments')
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          status: 'provisional',
          ...(professionalId ? { professional_id: professionalId } : {}),
        })
        .eq('id', appointmentId);

      if (rescheduleErr) throw rescheduleErr;

      await db.from('patient_timeline').insert({
        patient_id: session.patientId,
        event_type: 'appointment_rescheduled',
        title: 'Consulta Remarcada pelo Paciente',
        payload: {
          appointment_id: appointmentId,
          previous_start_time: existingForReschedule.start_time,
          new_start_time: newStart.toISOString(),
          origin: 'portal',
        },
      });

      await notifyClinicOfPortalAction(db, session.clinicId, session.patientId, 'remarcou uma consulta', newStart);

      return NextResponse.json({ success: true });

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

      await notifyClinicOfPortalAction(db, session.clinicId, session.patientId, 'cancelou uma consulta', new Date(existingAppt.start_time));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });

  } catch (err: any) {
    console.error('Error in portal appointment API:', err);
    return NextResponse.json({ error: err.message || 'Erro interno do servidor' }, { status: 500 });
  }
}
