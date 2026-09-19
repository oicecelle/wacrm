/**
 * Turns a configured template like:
 *   "agendamos sua {{servico}} para o dia {{data}} às {{hora}}"
 * into a matcher against a real message, and — when it matches —
 * extracts each {{placeholder}}'s value, parsed according to its
 * name. This is the shared building block behind create_appointment,
 * update_appointment_status (reschedule), and register_payment: the
 * clinic configures one example sentence with the parts that vary
 * marked out, and any message shaped like it (regardless of the
 * actual date/time/value) matches and yields those values — no AI,
 * no interpretation of free-form phrasing beyond this fixed shape.
 */

export interface ExtractedFields {
  /** Raw captured text per placeholder name, before type parsing. */
  raw: Record<string, string>;
  /** {{data}}, if present and parseable — as a Date at local midnight. */
  data?: Date;
  /** {{hora}}, if present and parseable — as { hours, minutes }. */
  hora?: { hours: number; minutes: number };
  /** {{valor}}, if present and parseable — as a plain number (reais). */
  valor?: number;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Escapes a literal fragment for use inside a RegExp, then loosens
 *  whitespace so "dia  19/09" still matches "dia 19/09" — templates
 *  are typed by hand and small spacing slips shouldn't break the
 *  match. */
function escapeAndLoosen(literal: string): string {
  const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(/\s+/g, '\\s+');
}

/** Builds a RegExp from the template: each {{name}} becomes a named
 *  capture group with a pattern suited to what it's named. */
function buildPattern(template: string): { pattern: RegExp; names: string[] } | null {
  const names: string[] = [];
  let lastIndex = 0;
  let regexStr = '';
  let match: RegExpExecArray | null;

  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(template))) {
    const [full, name] = match;
    regexStr += escapeAndLoosen(template.slice(lastIndex, match.index));

    let group: string;
    if (name === 'data') {
      group = '(\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)';
    } else if (name === 'hora') {
      group = '(\\d{1,2}[:h]\\d{0,2}|\\d{1,2}h)';
    } else if (name === 'valor') {
      group = '(?:r\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)';
    } else {
      // Free text — non-greedy, stops at the next literal chunk or
      // end of string.
      group = '(.+?)';
    }
    regexStr += `(?<${name}>${group})`;
    names.push(name);
    lastIndex = match.index + full.length;
  }
  regexStr += escapeAndLoosen(template.slice(lastIndex));

  if (names.length === 0) return null;
  try {
    return { pattern: new RegExp(regexStr, 'is'), names };
  } catch {
    return null;
  }
}

function parseBrDate(raw: string): Date | undefined {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const now = new Date();
  let year = m[3] ? Number(m[3]) : now.getFullYear();
  if (year < 100) year += 2000;
  const date = new Date(year, month, day, 0, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return undefined;
  // No year given and the date already passed this year — assume next
  // year rather than silently booking into the past.
  if (!m[3] && date.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) {
    date.setFullYear(year + 1);
  }
  return date;
}

function parseBrTime(raw: string): { hours: number; minutes: number } | undefined {
  const m = raw.match(/^(\d{1,2})[:h](\d{0,2})$|^(\d{1,2})h$/);
  if (!m) return undefined;
  const hours = Number(m[1] ?? m[3]);
  const minutes = m[2] ? Number(m[2]) : 0;
  if (hours > 23 || minutes > 59) return undefined;
  return { hours, minutes };
}

function parseBrMoney(raw: string): number | undefined {
  const normalized = raw.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Matches `messageText` against `template` and, if it matches,
 * returns the extracted fields. Returns null when the message doesn't
 * fit the configured shape at all (the calling step should then treat
 * the automation as not triggered for this message).
 */
export function extractFromTemplate(template: string, messageText: string): ExtractedFields | null {
  const built = buildPattern(template);
  if (!built) return null;
  const m = built.pattern.exec(messageText);
  if (!m || !m.groups) return null;

  const raw: Record<string, string> = {};
  for (const name of built.names) {
    raw[name] = (m.groups[name] ?? '').trim();
  }

  const result: ExtractedFields = { raw };
  if (raw.data) result.data = parseBrDate(raw.data);
  if (raw.hora) result.hora = parseBrTime(raw.hora);
  if (raw.valor) result.valor = parseBrMoney(raw.valor);
  return result;
}

/** Combines an extracted {data} + {hora} into a single Date, defaulting
 *  the time to 09:00 if the template had no {{hora}} placeholder. */
export function combineDateAndTime(fields: ExtractedFields): Date | undefined {
  if (!fields.data) return undefined;
  const combined = new Date(fields.data);
  if (fields.hora) {
    combined.setHours(fields.hora.hours, fields.hora.minutes, 0, 0);
  } else {
    combined.setHours(9, 0, 0, 0);
  }
  return combined;
}
