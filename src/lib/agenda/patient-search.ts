import type { SupabaseClient } from "@supabase/supabase-js";

export interface PatientOption {
  id: string;
  name: string;
  phone?: string;
  email?: string;
}

/** Results per table. Plenty to find someone by name; small enough to stay instant. */
export const PATIENT_SEARCH_LIMIT = 20;

/**
 * Builds the PostgREST `.or()` filters for one search box.
 *
 * Characters PostgREST treats as syntax inside an `or()` (comma,
 * parentheses) or as wildcards (% and *) are stripped from what the
 * user typed, so a name like "Silva, Ana (2ª via)" can't break or
 * widen the query.
 *
 * Phones: `patients.phone` is stored digits-only (3,160 of 3,164
 * rows), so a masked search like "(83) 99999" is matched through its
 * digits. `contacts` also has the generated `phone_normalized`.
 */
export function buildPatientSearchFilters(raw: string): { patientsOr: string; contactsOr: string } | null {
  const q = raw.replace(/[,()%*\\]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return null;
  const digits = q.replace(/\D/g, "");

  const patients = [`name.ilike.%${q}%`, `phone.ilike.%${q}%`, `email.ilike.%${q}%`];
  const contacts = [...patients];
  if (digits.length >= 3) {
    if (digits !== q) patients.push(`phone.ilike.%${digits}%`);
    contacts.push(`phone_normalized.ilike.%${digits}%`);
  }
  return { patientsOr: patients.join(","), contactsOr: contacts.join(",") };
}

/**
 * Searches patients AND contacts on the server and merges them
 * (patients win on the same id — a contact without a patient row is
 * still bookable, which is why both tables are searched).
 *
 * This replaced downloading every patient and every contact each time
 * the modal opened and filtering in the browser: PostgREST silently
 * caps an unbounded select at 1,000 rows, so on an account with 3,164
 * patients and 3,474 contacts most people simply could not be found.
 * An empty search returns the first few alphabetically, as before.
 */
export async function searchPatientOptions(
  db: SupabaseClient,
  clinicId: string,
  rawQuery: string,
): Promise<PatientOption[]> {
  const filters = buildPatientSearchFilters(rawQuery);

  let patientsQuery = db.from("patients").select("id, name, phone, email").eq("clinic_id", clinicId);
  let contactsQuery = db.from("contacts").select("id, name, phone, email").eq("account_id", clinicId);
  if (filters) {
    patientsQuery = patientsQuery.or(filters.patientsOr);
    contactsQuery = contactsQuery.or(filters.contactsOr);
  }
  const [patientsRes, contactsRes] = await Promise.all([
    patientsQuery.order("name").limit(PATIENT_SEARCH_LIMIT),
    contactsQuery.order("name").limit(PATIENT_SEARCH_LIMIT),
  ]);

  const merged = new Map<string, PatientOption>();
  for (const p of (patientsRes.data ?? []) as PatientOption[]) merged.set(p.id, p);
  for (const c of (contactsRes.data ?? []) as Array<Partial<PatientOption> & { id: string }>) {
    if (merged.has(c.id)) continue;
    // A contact that hasn't been named yet is exactly who someone is
    // most likely to be booking a first appointment for — fall back to
    // the phone so they stay selectable.
    merged.set(c.id, {
      id: c.id,
      name: c.name || c.phone || "Contato sem nome",
      phone: c.phone,
      email: c.email,
    });
  }
  return Array.from(merged.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, PATIENT_SEARCH_LIMIT);
}
