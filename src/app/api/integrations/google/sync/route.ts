import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getEnv } from '@/lib/env'
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '@/lib/integrations/google-calendar'

let _adminClient: any = null
function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    )
  }
  return _adminClient
}

export async function POST(request: Request) {
  try {
    const { action, appointmentId } = await request.json()
    if (!action || !appointmentId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const db = getSupabaseAdmin()

    // 1. Fetch appointment details with patient info
    const { data: appointment, error: fetchErr } = await db
      .from('appointments')
      .select('*, patients(name, phone)')
      .eq('id', appointmentId)
      .maybeSingle()

    if (fetchErr) {
      console.error('[Google Calendar Sync] Error fetching appointment:', fetchErr)
      return NextResponse.json({ error: 'Database fetch failed' }, { status: 500 })
    }

    if (!appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const accountId = appointment.clinic_id
    const userId = appointment.professional_id

    if (!accountId || !userId) {
      return NextResponse.json({ status: 'skipped', reason: 'Missing clinic or professional association' })
    }

    // Check if token exists for this professional/clinic
    const { data: tokenExists } = await db
      .from('google_calendar_tokens')
      .select('id')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!tokenExists) {
      // The professional hasn't integrated Google Calendar. Skip silently.
      return NextResponse.json({ status: 'skipped', reason: 'Integration not connected' })
    }

    if (action === 'create') {
      const googleEventId = await createGoogleEvent(accountId, userId, {
        type: appointment.type,
        notes: appointment.notes,
        start_time: appointment.start_time,
        end_time: appointment.end_time,
        patient_name: appointment.patients?.name,
        patient_phone: appointment.patients?.phone,
      })

      if (googleEventId) {
        await db
          .from('appointments')
          .update({ google_event_id: googleEventId })
          .eq('id', appointmentId)
        return NextResponse.json({ status: 'created', googleEventId })
      }
    } else if (action === 'update') {
      if (appointment.google_event_id) {
        const success = await updateGoogleEvent(accountId, userId, appointment.google_event_id, {
          type: appointment.type,
          notes: appointment.notes,
          start_time: appointment.start_time,
          end_time: appointment.end_time,
          patient_name: appointment.patients?.name,
          patient_phone: appointment.patients?.phone,
          status: appointment.status,
        })
        return NextResponse.json({ status: 'updated', success })
      } else {
        // If event wasn't created yet (e.g. connected integration later), create it now
        const googleEventId = await createGoogleEvent(accountId, userId, {
          type: appointment.type,
          notes: appointment.notes,
          start_time: appointment.start_time,
          end_time: appointment.end_time,
          patient_name: appointment.patients?.name,
          patient_phone: appointment.patients?.phone,
        })
        if (googleEventId) {
          await db
            .from('appointments')
            .update({ google_event_id: googleEventId })
            .eq('id', appointmentId)
          return NextResponse.json({ status: 'created', googleEventId })
        }
      }
    } else if (action === 'delete') {
      if (appointment.google_event_id) {
        const success = await deleteGoogleEvent(accountId, userId, appointment.google_event_id)
        return NextResponse.json({ status: 'deleted', success })
      }
    }

    return NextResponse.json({ status: 'ignored' })
  } catch (err: any) {
    console.error('[Google Calendar Sync] Critical sync route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
