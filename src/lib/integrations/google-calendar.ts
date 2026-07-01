import { createClient } from "@supabase/supabase-js";
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

/**
 * Creates an event in the user's primary calendar
 */
export async function createGoogleEvent(
  accountId: string,
  userId: string | undefined,
  appointment: {
    type?: string;
    notes?: string;
    start_time: string;
    end_time: string;
    patient_name?: string;
    patient_phone?: string;
  }
): Promise<string | null> {
  const token = await getValidAccessToken(accountId, userId);
  if (!token) return null;

  const eventTitle = `${appointment.type || "Consulta"} - ${appointment.patient_name || "Sem Nome"}`;
  const eventDesc = `Paciente: ${appointment.patient_name || "N/A"}\nTelefone: ${appointment.patient_phone || "N/A"}\nNotas: ${appointment.notes || "Nenhuma"}\nAgendado pelo WACRM.`;

  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: eventTitle,
        description: eventDesc,
        start: { dateTime: appointment.start_time },
        end: { dateTime: appointment.end_time },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Google Calendar] Create event failed: ${res.status} - ${errText}`);
      return null;
    }

    const data = await res.json();
    console.log(`[Google Calendar] Successfully created event ID=${data.id}`);
    return data.id;
  } catch (err) {
    console.error("[Google Calendar] Error creating event:", err);
    return null;
  }
}

/**
 * Updates an event in Google Calendar
 */
export async function updateGoogleEvent(
  accountId: string,
  userId: string | undefined,
  googleEventId: string,
  appointment: {
    type?: string;
    notes?: string;
    start_time: string;
    end_time: string;
    patient_name?: string;
    patient_phone?: string;
    status?: string;
  }
): Promise<boolean> {
  const token = await getValidAccessToken(accountId, userId);
  if (!token) return false;

  const isCancelled = appointment.status === "cancelled" || appointment.status === "provisional";
  const eventTitle = `${appointment.type || "Consulta"} - ${appointment.patient_name || "Sem Nome"}${isCancelled ? " (DESMARCADO)" : ""}`;
  const eventDesc = `Paciente: ${appointment.patient_name || "N/A"}\nTelefone: ${appointment.patient_phone || "N/A"}\nNotas: ${appointment.notes || "Nenhuma"}\nStatus: ${appointment.status || "N/A"}\nAgendado pelo WACRM.`;

  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: eventTitle,
        description: eventDesc,
        start: { dateTime: appointment.start_time },
        end: { dateTime: appointment.end_time },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[Google Calendar] Update event failed: ${res.status} - ${errText}`);
      return false;
    }

    console.log(`[Google Calendar] Successfully updated event ID=${googleEventId}`);
    return true;
  } catch (err) {
    console.error("[Google Calendar] Error updating event:", err);
    return false;
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
        const isFromWacrm = event.description?.includes("Agendado pelo WACRM");
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
