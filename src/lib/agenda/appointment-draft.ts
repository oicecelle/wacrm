// ── Draft safety net ─────────────────────────────────────────────
// A reload or a discarded tab (common on mobile, when you switch apps
// and come back) throws away React state no matter how carefully the
// effects behave. For a NEW appointment, what's been typed is mirrored
// to sessionStorage — it dies with the tab, so it never lingers on a
// shared computer — and restored the next time the same booking is
// opened. It is cleared whenever the modal is closed on purpose; a
// reload is not a close, so it survives exactly the case it's for.
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

export interface AppointmentDraftFields {
  patientId: string;
  selectedPatientInfo: unknown;
  professionalId: string;
  procedureName: string;
  procedureId: string | null;
  roomId: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string;
  apptType: string;
  appointmentTag: string;
  appointmentTagColor: string;
  isOnline: boolean;
  guestEmails: string[];
  sendWa: boolean;
}

const draftStorageKey = (clinicId: string) => `appt-draft:${clinicId}`;

export function readAppointmentDraft(clinicId: string, initKey: string): AppointmentDraftFields | null {
  try {
    const raw = sessionStorage.getItem(draftStorageKey(clinicId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { initKey: string; savedAt: number; fields: AppointmentDraftFields };
    if (parsed.initKey !== initKey || Date.now() - parsed.savedAt > DRAFT_TTL_MS) return null;
    return parsed.fields;
  } catch {
    return null;
  }
}

export function writeAppointmentDraft(clinicId: string, initKey: string, fields: AppointmentDraftFields) {
  try {
    sessionStorage.setItem(draftStorageKey(clinicId), JSON.stringify({ initKey, savedAt: Date.now(), fields }));
  } catch {
    // Storage full / disabled (private mode): the draft is a bonus.
  }
}

export function clearAppointmentDraft(clinicId: string) {
  try {
    sessionStorage.removeItem(draftStorageKey(clinicId));
  } catch {
    /* ignore */
  }
}

