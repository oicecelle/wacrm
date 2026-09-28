/**
 * Guest e-mails on an appointment. Shared by the modal (typing/pasting
 * addresses) and the Google Calendar sync (what actually gets invited),
 * so both sides apply exactly the same rules: lowercase, valid format,
 * no duplicates, capped.
 */

export const MAX_GUESTS = 20;

const EMAIL_RE = /^[^\s@,;<>()]+@[^\s@,;<>()]+\.[^\s@,;<>()]{2,}$/;

export function isValidGuestEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/** Split what a person typed or pasted ("a@x.com, b@y.com; c@z.com")
 *  into candidate addresses. Also unwraps "Maria <maria@x.com>". */
export function splitEmailInput(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((p) => p.trim().replace(/^<|>$/g, "").replace(/^[("']+|[)"']+$/g, ""))
    .filter(Boolean);
}

/** Clean a stored/incoming list: valid, lowercase, unique, capped. */
export function normalizeGuestEmails(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const email = item.trim().toLowerCase();
    if (!isValidGuestEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
    if (out.length >= MAX_GUESTS) break;
  }
  return out;
}

export interface AddGuestsResult {
  emails: string[];
  added: string[];
  invalid: string[];
  duplicates: string[];
  overLimit: boolean;
}

/** Add whatever was typed to the current list, reporting what was
 *  skipped and why so the UI can say so instead of silently dropping. */
export function addGuestEmails(current: string[], raw: string): AddGuestsResult {
  const emails = [...current];
  const have = new Set(current.map((e) => e.toLowerCase()));
  const result: AddGuestsResult = { emails, added: [], invalid: [], duplicates: [], overLimit: false };

  for (const candidate of splitEmailInput(raw)) {
    const email = candidate.toLowerCase();
    if (!isValidGuestEmail(email)) {
      result.invalid.push(candidate);
    } else if (have.has(email)) {
      result.duplicates.push(email);
    } else if (emails.length >= MAX_GUESTS) {
      result.overLimit = true;
    } else {
      emails.push(email);
      have.add(email);
      result.added.push(email);
    }
  }
  return result;
}
