import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { getEnv } from '@/lib/env'
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  isImportedGoogleBlock,
  type EventAppointment,
} from '@/lib/integrations/google-calendar'
import { normalizeGuestEmails } from '@/lib/appointments/guests'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      getEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://scrhexfcbtdyubehbzml.supabase.co'),
      getEnv('SUPABASE_SERVICE_ROLE_KEY', '')
    )
  }
  return _adminClient
}

// POST /api/integrations/google/sync
// body: { action: 'create' | 'update' | 'delete', appointmentId, guestsChanged? }
//
// Mirrors an appointment into the professional's Google Calendar:
// guests become attendees (Google e-mails them the invitation) and an
// online appointment gets a Google Meet room, whose link is saved on
// the appointment (teleconsult_link).
export async function POST(request: Request) {
  try {
    // This route uses the service-role key (it has to read another
    // user's calendar token), so it must not be callable by strangers:
    // require a signed-in user, and require that the appointment is one
    // that user can actually see — the database's row-level security
    // decides that, not this code.
    const session = await createSessionClient()
    const {
      data: { user },
    } = await session.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    }

    const { action, appointmentId, guestsChanged } = await request.json()
    if (!action || !appointmentId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const { data: visible } = await session.from('appointments').select('id').eq('id', appointmentId).maybeSingle()
    if (!visible) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
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

    // A block that was imported FROM Google mirrors someone's real event.
    // Editing or deleting the mirror here must leave that event alone.
    if (action !== 'create' && isImportedGoogleBlock(appointment.patients?.name)) {
      return NextResponse.json({ status: 'skipped', reason: 'Imported from Google — original event left untouched' })
    }

    const guests = normalizeGuestEmails(appointment.guest_emails)
    const eventInput: EventAppointment = {
      type: appointment.type,
      notes: appointment.notes,
      start_time: appointment.start_time,
      end_time: appointment.end_time,
      patient_name: appointment.patients?.name,
      patient_phone: appointment.patients?.phone,
      status: appointment.status,
      guest_emails: guests,
    }
    const wantsMeet = !!appointment.is_teleconsult
    const hasMeet = !!appointment.teleconsult_link

    const createEvent = async () => {
      const created = await createGoogleEvent(accountId, userId, eventInput, { createMeet: wantsMeet })
      if (!created) return NextResponse.json({ status: 'failed' })
      await db
        .from('appointments')
        .update({ google_event_id: created.eventId, ...(created.meetLink ? { teleconsult_link: created.meetLink } : {}) })
        .eq('id', appointmentId)
      return NextResponse.json({ status: 'created', googleEventId: created.eventId, meetLink: created.meetLink })
    }

    if (action === 'create') {
      return await createEvent()
    } else if (action === 'update') {
      if (!appointment.google_event_id) {
        // If event wasn't created yet (e.g. connected integration later), create it now
        return await createEvent()
      }
      const result = await updateGoogleEvent(accountId, userId, appointment.google_event_id, eventInput, {
        // Only push the guest list when we own it: the user edited it
        // now, or there are guests recorded. Otherwise leave whatever
        // was added by hand in Google untouched.
        syncGuests: guestsChanged === true || guests.length > 0,
        createMeet: wantsMeet && !hasMeet,
        removeMeet: !wantsMeet && hasMeet,
      })
      if (result.success) {
        if (result.meetLink) {
          await db.from('appointments').update({ teleconsult_link: result.meetLink }).eq('id', appointmentId)
        } else if (!wantsMeet && hasMeet) {
          await db.from('appointments').update({ teleconsult_link: null }).eq('id', appointmentId)
        }
      }
      return NextResponse.json({
        status: 'updated',
        success: result.success,
        meetLink: result.meetLink ?? (wantsMeet ? appointment.teleconsult_link ?? null : null),
      })
    } else if (action === 'delete') {
      if (appointment.google_event_id) {
        const success = await deleteGoogleEvent(accountId, userId, appointment.google_event_id)
        return NextResponse.json({ status: 'deleted', success })
      }
    }

    return NextResponse.json({ status: 'ignored' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('[Google Calendar Sync] Critical sync route error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
