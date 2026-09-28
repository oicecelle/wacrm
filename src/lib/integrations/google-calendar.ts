import { createClient } from "@supabase/supabase-js";
import { normalizeGuestEmails } from "@/lib/appointments/guests";
import { getEnv } from "@/lib/env";

// Lazy-initialized Supabase Admin Client
let _adminClient: any = null;
function getSupabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL", "https://scrhexfcbtdyubehbzml.supabase.co"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    );
  }
  return _adminClient;
}

interface GoogleToken {
  id: string;
  access_token: string;
  refresh_token: string;
  expiry_date: number;
}

/**
 * Gets OAuth tokens from the database for the given account/user and refreshes them if expired.
 */
export async function getValidAccessToken(accountId: string, userId?: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  let query = db.from("google_calendar_tokens").select("*").eq("account_id", accountId);
  
  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.is("user_id", null);
  }

  const { data: tokens, error } = await query.maybeSingle();
  if (error || !tokens) {
    console.warn(`[Google Calendar] No tokens found for account_id=${accountId} user_id=${userId}`);
    return null;
  }

  const nowMs = Date.now();
  // If token is expired or expires in less than 2 minutes, refresh it
  if (Number(tokens.expiry_date) - 120000 < nowMs) {
    console.log(`[Google Calendar] Token expired or near expiry. Refreshing token for email=${tokens.email}`);
    const newTokens = await refreshAccessToken(tokens.refresh_token);
    if (!newTokens) {
      console.error(`[Google Calendar] Failed to refresh token for email=${tokens.email}`);
      return null;
    }

    // Save refreshed tokens
    const { error: updateError } = await db
      .from("google_calendar_tokens")
      .update({
        access_token: newTokens.access_token,
        expiry_date: newTokens.expiry_date,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokens.id);

    if (updateError) {
      console.error(`[Google Calendar] Error saving refreshed token to DB:`, updateError.message);
    }

    return newTokens.access_token;
  }

  return tokens.access_token;
}

/**
 * Trade refresh_token for a new access_token
 */
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expiry_date: number } | null> {
  const clientId = getEnv("GOOGLE_CLIENT_ID", "461678176041-5854mrv7g1he083u931v948q3s62jdbl.apps.googleusercontent.com");
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientSecret) {
    console.error("[Google Calendar] GOOGLE_CLIENT_SECRET environment variable is missing.");
    return null;
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Google Calendar] OAuth token refresh failed: ${res.status} - ${errText}`);
      return null;
    }

    const data = await res.json();
    const expiryDate = Date.now() + (data.expires_in * 1000);
    return {
      access_token: data.access_token,
      expiry_date: expiryDate,
    };
  } catch (err) {
    console.error("[Google Calendar] Error refreshing access token:", err);
    return null;
  }
}

/* ───────────────────────── event payload ───────────────────────── */

export interface EventAppointment {
  type?: string | null;
  notes?: string | null;
  start_time: string;
  end_time: string;
  patient_name?: string | null;
  patient_phone?: string | null;
  status?: string | null;
  guest_emails?: string[] | null;
}

export interface EventPayloadOptions {
  /** Adds the status line and "(DESMARCADO)" title — the update flavor. */
  forUpdate?: boolean;
  /** Include the attendee list (an empty array means "remove all guests"). */
  includeAttendees?: boolean;
  /** Ask Google to create a Meet room and attach it to the event. */
  createMeet?: boolean;
  /** Remove an existing Meet from the event. */
  removeMeet?: boolean;
  /** Idempotency key for the Meet creation request. */
  requestId?: string;
}

/**
 * Builds the JSON body sent to the Google Calendar API. Pure, so the
 * rules that matter (who gets invited, when a Meet is requested, that
 * updates never blank out fields they don't own) are unit-tested.
 */
export function buildEventPayload(a: EventAppointment, opts: EventPayloadOptions = {}): Record<string, unknown> {
  const isCancelled = a.status === "cancelled" || a.status === "provisional";
  const title = `${a.type || "Consulta"} - ${a.patient_name || "Sem Nome"}${opts.forUpdate && isCancelled ? " (DESMARCADO)" : ""}`;
  const description =
    `Paciente: ${a.patient_name || "N/A"}\nTelefone: ${a.patient_phone || "N/A"}\nNotas: ${a.notes || "Nenhuma"}` +
    `${opts.forUpdate ? `\nStatus: ${a.status || "N/A"}` : ""}\nAgendado pelo LeadPluz.`;

  const body: Record<string, unknown> = {
    summary: title,
    description,
    start: { dateTime: a.start_time },
    end: { dateTime: a.end_time },
  };

  if (opts.includeAttendees) {
    body.attendees = normalizeGuestEmails(a.guest_emails).map((email) => ({ email }));
  }

  if (opts.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: opts.requestId || `lp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  } else if (opts.removeMeet) {
    body.conferenceData = null;
  }
  return body;
}

/** The Meet URL of an event response, if it has one. */
export function extractMeetLink(event: unknown): string | null {
  const e = event as {
    hangoutLink?: string;
    conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  } | null;
  if (!e) return null;
  if (e.hangoutLink) return e.hangoutLink;
  const video = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video" && p.uri);
  return video?.uri ?? null;
}

function conferenceStatus(event: unknown): string | null {
  return (event as { conferenceData?: { createRequest?: { status?: { statusCode?: string } } } })?.conferenceData
    ?.createRequest?.status?.statusCode ?? null;
}

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/** Google creates Meet rooms asynchronously; when the first response
 *  says "pending", ask again shortly instead of losing the link. */
async function waitForMeetLink(token: string, eventId: string, first: unknown): Promise<string | null> {
  let link = extractMeetLink(first);
  if (link || conferenceStatus(first) !== "pending") return link;
  for (let attempt = 0; attempt < 3 && !link; attempt++) {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const res = await fetch(`${EVENTS_URL}/${eventId}?conferenceDataVersion=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) link = extractMeetLink(await res.json());
    } catch {
      // keep trying; the caller treats a missing link as a soft failure
    }
  }
  return link;
}

export interface CreatedEvent {
  eventId: string;
  meetLink: string | null;
}

/**
 * Creates an event in the user's primary calendar. Guests become
 * attendees (and get Google's invitation e-mail); `createMeet` also
 * attaches a Google Meet room. The event is created even if the Meet
 * could not be — `meetLink` is then null and the caller can say so.
 */
export async function createGoogleEvent(
  accountId: string,
  userId: string | undefined,
  appointment: EventAppointment,
  opts: { createMeet?: boolean } = {},
): Promise<CreatedEvent | null> {
  const token = await getValidAccessToken(accountId, userId);
  if (!token) return null;

  const guests = normalizeGuestEmails(appointment.guest_emails);
  const body = buildEventPayload(appointment, { includeAttendees: guests.length > 0, createMeet: opts.createMeet });
  const params = new URLSearchParams({ conferenceDataVersion: "1" });
  if (guests.length > 0) params.set("sendUpdates", "all");

  try {
    const res = await fetch(`${EVENTS_URL}?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Google Calendar] Create event failed: ${res.status} - ${errText}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Google Calendar] Successfully created event ID=${data.id}`);
    const meetLink = opts.createMeet ? await waitForMeetLink(token, data.id, data) : null;
    return { eventId: data.id, meetLink };
  } catch (err) {
    console.error("[Google Calendar] Error creating event:", err);
    return null;
  }
}

export interface UpdatedEvent {
  success: boolean;
  /** Set when this update created a Meet room. */
  meetLink?: string | null;
}

/**
 * Updates an event in Google Calendar. Uses PATCH (not PUT): a PUT
 * replaces the whole event, which would silently erase the Meet room,
 * guests and anything else edited directly in Google that we don't
 * send. Attendees are only sent when the caller says the list is
 * something we own (`syncGuests`), so events that pre-date this
 * feature keep the guests someone added by hand in Google.
 */
export async function updateGoogleEvent(
  accountId: string,
  userId: string | undefined,
  googleEventId: string,
  appointment: EventAppointment,
  opts: { syncGuests?: boolean; createMeet?: boolean; removeMeet?: boolean } = {},
): Promise<UpdatedEvent> {
  const token = await getValidAccessToken(accountId, userId);
  if (!token) return { success: false };

  const guests = normalizeGuestEmails(appointment.guest_emails);
  const body = buildEventPayload(appointment, {
    forUpdate: true,
    includeAttendees: !!opts.syncGuests,
    createMeet: opts.createMeet,
    removeMeet: opts.removeMeet,
  });
  const params = new URLSearchParams({ conferenceDataVersion: "1" });
  if (opts.syncGuests && guests.length > 0) params.set("sendUpdates", "all");

  try {
    const res = await fetch(`${EVENTS_URL}/${googleEventId}?${params.toString()}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Google Calendar] Update event failed: ${res.status} - ${errText}`);
      return { success: false };
    }

    console.log(`[Google Calendar] Successfully updated event ID=${googleEventId}`);
    if (opts.createMeet) {
      const meetLink = await waitForMeetLink(token, googleEventId, await res.json());
      return { success: true, meetLink };
    }
    return { success: true };
  } catch (err) {
    console.error("[Google Calendar] Error updating event:", err);
    return { success: false };
  }
}

/**
 * Deletes an event from Google Calendar
 */
export async function deleteGoogleEvent(
  accountId: string,
  userId: string | undefined,
  googleEventId: string
): Promise<boolean> {
  const token = await getValidAccessToken(accountId, userId);
  if (!token) return false;

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // 204 No Content means success. 410 Gone also means it is already deleted.
    if (res.status === 204 || res.status === 410) {
      console.log(`[Google Calendar] Successfully deleted/removed event ID=${googleEventId}`);
      return true;
    }

    const errText = await res.text();
    console.error(`[Google Calendar] Delete event failed: ${res.status} - ${errText}`);
    return false;
  } catch (err) {
    console.error("[Google Calendar] Error deleting event:", err);
    return false;
  }
}

/**
 * Synchronizes events from the user's primary Google Calendar back to the WACRM local database.
 */
export async function syncGoogleEventsToDatabase(accountId: string, userId: string): Promise<boolean> {
  const token = await getValidAccessToken(accountId, userId);
  if (!token) return false;

  const db = getSupabaseAdmin();

  try {
    // Fetch Google events from 30 days ago to 90 days in the future
    const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&maxResults=250`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Google Calendar] Fetch events list failed: ${res.status} - ${errText}`);
      return false;
    }

    const data = await res.json();
    const googleEvents = data.items || [];
    console.log(`[Google Calendar] Fetched ${googleEvents.length} events from Google Calendar for sync.`);

    // 1. Find or create a default "Google Calendar Sync" patient record to associate with external events
    let syncPatientId: string | null = null;
    const { data: syncPatient } = await db
      .from("contacts")
      .select("id")
      .eq("account_id", accountId)
      .eq("name", "Bloqueio (Google Calendar)")
      .maybeSingle();

    if (syncPatient) {
      syncPatientId = syncPatient.id;
    } else {
      const { data: newPat, error: patErr } = await db
        .from("contacts")
        .insert({
          account_id: accountId,
          name: "Bloqueio (Google Calendar)",
          phone: "00000000000",
        })
        .select("id")
        .single();
      
      if (!patErr && newPat) {
        syncPatientId = newPat.id;
      }
    }

    if (!syncPatientId) {
      console.error("[Google Calendar] Failed to resolve default sync patient.");
      return false;
    }

    for (const event of googleEvents) {
      const startStr = event.start?.dateTime || event.start?.date;
      const endStr = event.end?.dateTime || event.end?.date;
      if (!startStr || !endStr) continue;

      const startTime = new Date(startStr).toISOString();
      const endTime = new Date(endStr).toISOString();
      const title = event.summary || "Bloqueio de Agenda";
      const isGoogleCancelled = event.status === "cancelled";

      // Try to find if this event is already mapped to an appointment in WACRM
      const { data: existingAppt } = await db
        .from("appointments")
        .select("id, start_time, end_time, status")
        .eq("google_event_id", event.id)
        .maybeSingle();

      if (existingAppt) {
        if (isGoogleCancelled) {
          // If cancelled/deleted in Google Calendar, cancel/provisional in WACRM
          await db
            .from("appointments")
            .update({ status: "cancelled" })
            .eq("id", existingAppt.id);
          console.log(`[Google Calendar] Cancelled appointment ID=${existingAppt.id} because Google event was deleted.`);
        } else {
          // Update details if changed
          if (existingAppt.start_time !== startTime || existingAppt.end_time !== endTime) {
            await db
              .from("appointments")
              .update({
                start_time: startTime,
                end_time: endTime,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingAppt.id);
            console.log(`[Google Calendar] Updated appointment ID=${existingAppt.id} times from Google Calendar.`);
          }
        }
      } else if (!isGoogleCancelled) {
        // Only import if not cancelled and does not contain WACRM in description (prevent looping)
        const isFromWacrm = event.description?.includes("Agendado pelo WACRM") || event.description?.includes("Agendado pelo LeadPluz");
        if (isFromWacrm) continue;

        // Create a blocker/provisional appointment for the professional
        const { error: insertErr } = await db
          .from("appointments")
          .insert({
            clinic_id: accountId,
            patient_id: syncPatientId,
            professional_id: userId,
            start_time: startTime,
            end_time: endTime,
            status: "provisional",
            type: "Bloqueio",
            notes: event.description || "Compromisso sincronizado do Google Calendar.",
            google_event_id: event.id,
          });

        if (insertErr) {
          console.error(`[Google Calendar] Error importing external Google event:`, insertErr.message);
        } else {
          console.log(`[Google Calendar] Successfully imported Google event ID=${event.id} as a blocker.`);
        }
      }
    }

    return true;
  } catch (err) {
    console.error("[Google Calendar] Error running calendar sync:", err);
    return false;
  }
}
