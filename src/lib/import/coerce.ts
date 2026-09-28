import { normalizeBrazilianPhone } from "@/lib/whatsapp/phone-utils";
import { normalizeText, tokenize } from "./text";
import type { FieldDef } from "./types";

/**
 * Turns one raw spreadsheet cell into the typed value the database
 * wants, or explains why it can't. Pure and deterministic — no AI, no
 * I/O — so every rule here is covered by unit tests.
 *
 * Conventions: empty cell → `{ value: null }` (required-ness is
 * checked by the caller); a value that can't be understood →
 * `{ value: null, error }` which blocks that row; a value we could
 * use but aren't sure about → `{ value, warning }`.
 */

export interface CoerceResult {
  value: unknown;
  error?: string;
  warning?: string;
}

export type DateOrder = "dmy" | "mdy";

export interface CoerceOptions {
  /** Day-first (Brazil, default) vs month-first, decided per column. */
  dateOrder?: DateOrder;
}

/* ─────────────────────────── dates ─────────────────────────── */

const MONTHS_PT: Record<string, number> = {
  jan: 1, janeiro: 1, fev: 2, fevereiro: 2, mar: 3, marco: 3, abr: 4, abril: 4, mai: 5, maio: 5, jun: 6, junho: 6,
  jul: 7, julho: 7, ago: 8, agosto: 8, set: 9, setembro: 9, out: 10, outubro: 10, nov: 11, novembro: 11, dez: 12, dezembro: 12,
  // English, since exports from international tools are common
  feb: 2, apr: 4, may: 5, aug: 8, sep: 9, sept: 9, oct: 10, dec: 12, january: 1, february: 2, march: 3, april: 4,
  june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  // 2-digit year: pivot just past the current year, so "15/03/85" is
  // 1985 (a birthday) and "15/03/26" is 2026 (an appointment).
  const pivot = (new Date().getFullYear() % 100) + 1;
  return y <= pivot ? 2000 + y : 1900 + y;
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

interface ParsedDateTime {
  ymd: string;
  time: string | null; // HH:MM
  swapped: boolean;
}

/** Parse a date (and optional time) in the formats Brazilian and
 *  international spreadsheets actually contain. */
export function parseDateTime(raw: string, order: DateOrder = "dmy"): ParsedDateTime | null {
  const s = raw.trim();
  if (!s) return null;

  // Excel serial number (a date column stored as a plain number).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = parseFloat(s);
    if (serial > 20000 && serial < 80000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      const d = new Date(ms);
      const ymd = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const secs = Math.round((serial % 1) * 86400);
      const time = secs > 0 ? `${pad(Math.floor(secs / 3600))}:${pad(Math.floor((secs % 3600) / 60))}` : null;
      return { ymd, time, swapped: false };
    }
  }

  const timePart = "(?:[,\\sT]+(\\d{1,2})[:hH](\\d{2})(?::\\d{2}(?:\\.\\d+)?)?\\s*([aApP][mM])?)?";

  // ISO: 2026-09-28 or 2026-09-28T14:30 / 2026/09/28
  let m = s.match(new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${timePart}\\s*(?:Z|[+-]\\d{2}:?\\d{2})?$`));
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!isValidYMD(y, mo, d)) return null;
    return { ymd: `${y}-${pad(mo)}-${pad(d)}`, time: buildTime(m[4], m[5], m[6]), swapped: false };
  }

  // Numeric with separators: 28/09/2026, 28-09-26, 28.09.2026 [14:30]
  m = s.match(new RegExp(`^(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{2,4})${timePart}$`));
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    const y = expandYear(Number(m[3]));
    let swapped = false;
    // Column-level order wins; a value that's impossible in that order
    // (e.g. 09/28/2026 read day-first) gets swapped with a warning.
    let day = order === "dmy" ? a : b;
    let month = order === "dmy" ? b : a;
    if (!isValidYMD(y, month, day)) {
      [a, b] = [b, a];
      day = order === "dmy" ? a : b;
      month = order === "dmy" ? b : a;
      swapped = true;
    }
    if (!isValidYMD(y, month, day)) return null;
    return { ymd: `${y}-${pad(month)}-${pad(day)}`, time: buildTime(m[4], m[5], m[6]), swapped };
  }

  // Text month: "28 de setembro de 2026", "28/set/2026", "Sep 28, 2026"
  m = s.match(new RegExp(`^(\\d{1,2})\\s*(?:de\\s+)?[/\\-.\\s]*([A-Za-zÀ-ÿ]{3,10})\\.?[/\\-.\\s]*(?:de\\s+)?(\\d{2,4})${timePart}$`));
  if (m) {
    const month = MONTHS_PT[normalizeText(m[2])];
    const d = Number(m[1]);
    const y = expandYear(Number(m[3]));
    if (month && isValidYMD(y, month, d)) {
      return { ymd: `${y}-${pad(month)}-${pad(d)}`, time: buildTime(m[4], m[5], m[6]), swapped: false };
    }
  }
  m = s.match(new RegExp(`^([A-Za-z]{3,10})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})${timePart}$`));
  if (m) {
    const month = MONTHS_PT[normalizeText(m[1])];
    const d = Number(m[2]);
    const y = Number(m[3]);
    if (month && isValidYMD(y, month, d)) {
      return { ymd: `${y}-${pad(month)}-${pad(d)}`, time: buildTime(m[4], m[5], m[6]), swapped: false };
    }
  }
  return null;
}

function buildTime(h: string | undefined, min: string | undefined, ampm: string | undefined): string | null {
  if (h === undefined || min === undefined) return null;
  let hour = Number(h);
  const minute = Number(min);
  if (ampm) {
    const pm = ampm.toLowerCase() === "pm";
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
  }
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** Parse a clock time: 14:30, 14h30, 14h, 14:30:00, 2:30 PM, 1430. */
export function parseTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})\s*[:hH]\s*(\d{2})(?::\d{2})?\s*([aApP][mM])?$/);
  if (m) return buildTime(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})\s*[hH]$/);
  if (m) return buildTime(m[1], "00", undefined);
  m = s.match(/^(\d{1,2})\s*([aApP][mM])$/);
  if (m) return buildTime(m[1], "00", m[2]);
  m = s.match(/^(\d{2})(\d{2})$/);
  if (m) return buildTime(m[1], m[2], undefined);
  // A full date-time pasted into a time column ("28/09/2026 14:30").
  const dt = parseDateTime(s);
  if (dt?.time) return dt.time;
  // Excel time fraction (0.604166 = 14:30)
  if (/^0\.\d+$/.test(s)) {
    const secs = Math.round(parseFloat(s) * 86400);
    return buildTime(String(Math.floor(secs / 3600)), pad(Math.floor((secs % 3600) / 60)), undefined);
  }
  return null;
}

/** Decide day-first vs month-first for a whole column, from the values
 *  that can only be read one way ("28/09" can't be month-first). */
export function detectDateOrder(values: string[]): DateOrder {
  let dmyOnly = 0;
  let mdyOnly = 0;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.]\d{2,4}/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmyOnly++;
    else if (b > 12 && a <= 12) mdyOnly++;
  }
  return mdyOnly > dmyOnly ? "mdy" : "dmy";
}

/* ─────────────────────────── numbers ─────────────────────────── */

/** Parse Brazilian ("1.234,56", "R$ 1.234,56") and international
 *  ("1,234.56", "1234.56") numbers; parentheses and a leading minus
 *  mean negative. */
export function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/R\$|\$|€|reais|real|\s/gi, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: whichever comes last is the decimal separator.
    if (lastComma > lastDot) normalized = s.replace(/\./g, "").replace(",", ".");
    else normalized = s.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Only commas: "1,5" decimal; "1,234,567" thousands.
    const parts = s.split(",");
    normalized = parts.length > 2 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (lastDot !== -1) {
    // Only dots: "1.234" (BR thousands) vs "12.5" (decimal).
    const parts = s.split(".");
    const looksThousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0");
    normalized = looksThousands ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Durations: 60, "60 min", "1h", "1h30", "1:30", "1,5h", "90 minutos". */
export function parseMinutes(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+)\s*(?:min|mins|minutos?|m)?$/);
  if (m) return Number(m[1]);
  m = s.match(/^(\d+)\s*(?:h|hr|hrs|horas?)\s*(\d{1,2})\s*(?:min|m|minutos?)?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|horas?)$/);
  if (m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
  m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return null;
}

/* ─────────────────────────── phone / cpf / email ─────────────────────────── */

export function parsePhone(raw: string): { value: string | null; error?: string } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { value: null };
  // Spreadsheets turn long numbers like 5521999998888 into scientific
  // notation (5.522E+12), which throws the real digits away — the
  // number can't be recovered, so say so instead of guessing.
  if (/^\d+([.,]\d+)?e\+?\d+$/i.test(raw.trim())) {
    return { value: null, error: "Telefone em notação científica (a planilha apagou os dígitos — formate a coluna como texto)" };
  }
  // Drop a leading trunk 0 ("021 99999-8888") before adding 55.
  const trimmed = digits.length >= 11 && digits.startsWith("0") && !digits.startsWith("00") ? digits.slice(1) : digits;
  const normalized = normalizeBrazilianPhone(trimmed);
  if (normalized.length < 12 || normalized.length > 15) {
    return { value: null, error: `Telefone inválido (${digits.length} dígitos)` };
  }
  return { value: normalized };
}

export function parseCpf(raw: string): { value: string | null; warning?: string } {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return { value: null };
  if (digits.length === 11) {
    return { value: `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` };
  }
  if (digits.length === 14) {
    return { value: `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}` };
  }
  // A leading zero eaten by the spreadsheet is the usual cause of 10 digits.
  if (digits.length === 10) return parseCpf(`0${digits}`);
  return { value: raw.trim(), warning: "CPF/CNPJ com tamanho estranho — importado como veio" };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ─────────────────────────── enum ─────────────────────────── */

const enumCache = new WeakMap<FieldDef, { exact: Map<string, string>; entries: { tokens: string[]; canonical: string }[] }>();

function enumIndex(field: FieldDef) {
  let idx = enumCache.get(field);
  if (idx) return idx;
  const exact = new Map<string, string>();
  const entries: { tokens: string[]; canonical: string }[] = [];
  for (const [canonical, words] of Object.entries(field.enumValues ?? {})) {
    for (const w of [canonical, ...words]) {
      const key = normalizeText(w);
      if (key) exact.set(key, canonical);
      const tokens = tokenize(w);
      if (tokens.length) entries.push({ tokens, canonical });
    }
  }
  idx = { exact, entries };
  enumCache.set(field, idx);
  return idx;
}

export function coerceEnum(field: FieldDef, raw: string): { value: string | null; error?: string } {
  const key = normalizeText(raw);
  if (!key) return { value: null };
  const { exact, entries } = enumIndex(field);
  const hit = exact.get(key);
  if (hit) return { value: hit };

  // "Confirmado pelo WhatsApp" contains "confirmado": pick the longest
  // synonym found as a whole-word run; refuse if two different
  // meanings tie (that's a genuinely ambiguous cell).
  const valueTokens = tokenize(raw);
  const joined = ` ${valueTokens.join(" ")} `;
  let bestLen = 0;
  const bestCanon = new Set<string>();
  for (const e of entries) {
    if (!joined.includes(` ${e.tokens.join(" ")} `)) continue;
    if (e.tokens.length > bestLen) {
      bestLen = e.tokens.length;
      bestCanon.clear();
      bestCanon.add(e.canonical);
    } else if (e.tokens.length === bestLen) {
      bestCanon.add(e.canonical);
    }
  }
  if (bestCanon.size === 1) return { value: [...bestCanon][0] };
  return { value: null, error: `Valor não reconhecido: "${raw.trim()}"` };
}

/* ─────────────────────────── entry point ─────────────────────────── */

export function splitList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;|]/)) {
    const v = part.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Cells other systems use to mean "nothing here". Treated as empty
 *  rather than as an invalid value, so a "-" in a date column doesn't
 *  reject an otherwise good row. */
const PLACEHOLDERS = new Set([
  "n a", "na", "null", "nulo", "nan", "undefined", "nao informado", "nao se aplica", "sem informacao", "sem info",
  "vazio", "nenhum", "nenhuma", "none", "empty",
]);

export function isPlaceholder(s: string): boolean {
  const n = normalizeText(s);
  return n === "" || PLACEHOLDERS.has(n); // symbols-only ("-", "--", "???") normalizes to ""
}

export function coerceValue(field: FieldDef, raw: string, opts: CoerceOptions = {}): CoerceResult {
  const s = (raw ?? "").trim();
  if (!s || isPlaceholder(s)) return { value: null };

  switch (field.type) {
    case "text":
      return { value: s };

    case "phone": {
      const r = parsePhone(s);
      return r.error ? { value: null, error: r.error } : { value: r.value };
    }

    case "email": {
      const e = s.toLowerCase();
      return EMAIL_RE.test(e) ? { value: e } : { value: null, error: `E-mail inválido: "${s}"` };
    }

    case "cpf": {
      const r = parseCpf(s);
      return { value: r.value, warning: r.warning };
    }

    case "date": {
      const dt = parseDateTime(s, opts.dateOrder);
      if (!dt) return { value: null, error: `Data inválida: "${s}"` };
      return { value: dt.ymd, warning: dt.swapped ? `Data "${s}" lida como mês/dia` : undefined };
    }

    case "datetime": {
      const dt = parseDateTime(s, opts.dateOrder);
      if (!dt) return { value: null, error: `Data/hora inválida: "${s}"` };
      if (!dt.time) return { value: null, error: `Falta o horário em "${s}"` };
      return { value: `${dt.ymd}T${dt.time}`, warning: dt.swapped ? `Data "${s}" lida como mês/dia` : undefined };
    }

    case "time": {
      const t = parseTime(s);
      return t ? { value: t } : { value: null, error: `Horário inválido: "${s}"` };
    }

    case "number": {
      const n = parseNumber(s);
      return n === null ? { value: null, error: `Número inválido: "${s}"` } : { value: n };
    }

    case "money": {
      const n = parseNumber(s);
      return n === null ? { value: null, error: `Valor inválido: "${s}"` } : { value: Math.round(n * 100) / 100 };
    }

    case "minutes": {
      const n = parseMinutes(s);
      return n === null || n <= 0 ? { value: null, error: `Duração inválida: "${s}"` } : { value: n };
    }

    case "enum": {
      const r = coerceEnum(field, s);
      return r.error ? { value: null, error: r.error } : { value: r.value };
    }

    case "list":
      return { value: splitList(s) };

    default:
      return { value: s };
  }
}
