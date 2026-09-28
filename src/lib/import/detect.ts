import { parseDateTime, parseTime } from "./coerce";
import { normalizeText, tokenize } from "./text";
import type { ColumnMapping, EntityDef, FieldDef } from "./types";

/**
 * Deterministic column detection — no AI, no network, same answer
 * every time. Two passes:
 *
 *  1. HEADER: each column header is compared against every field's
 *     synonym list (Portuguese + English, see entities.ts),
 *     accent-/case-/word-order-insensitively.
 *  2. CONTENT: columns the header pass couldn't place are sniffed by
 *     what's inside them (a column full of e-mails is the e-mail
 *     column even if it's called "Contact 2").
 *
 * Scores: 100 exact, 95 same words in another order, 85→60 header
 * contains the synonym plus extra words (penalized per extra word).
 * Only ≥ AUTO_THRESHOLD is applied automatically; weaker matches come
 * back as `suggestion` (shown to the user, but not pre-selected).
 */

export const AUTO_THRESHOLD = 75;
const SUGGESTION_THRESHOLD = 55;

interface CompiledSynonym {
  normalized: string;
  tokens: string[];
  tokenSet: Set<string>;
}

const compiledCache = new WeakMap<FieldDef, CompiledSynonym[]>();

function compile(field: FieldDef): CompiledSynonym[] {
  let c = compiledCache.get(field);
  if (c) return c;
  const seen = new Set<string>();
  c = [];
  for (const raw of [field.label, field.key.replace(/_/g, " "), ...field.synonyms]) {
    const normalized = normalizeText(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    const tokens = tokenize(raw);
    if (tokens.length === 0) continue;
    c.push({ normalized, tokens, tokenSet: new Set(tokens) });
  }
  compiledCache.set(field, c);
  return c;
}

/** Best score (0-100) of a header against one field. */
export function scoreHeader(header: string, field: FieldDef): number {
  const normalized = normalizeText(header);
  if (!normalized) return 0;
  const headerTokens = tokenize(header);
  if (headerTokens.length === 0) return 0;
  const headerSet = new Set(headerTokens);

  let best = 0;
  for (const syn of compile(field)) {
    let score = 0;
    if (syn.normalized === normalized) {
      score = 100;
    } else if (syn.tokenSet.size === headerSet.size && syn.tokens.every((t) => headerSet.has(t))) {
      score = 95; // same words, different order / connectors
    } else if (syn.tokens.every((t) => headerSet.has(t))) {
      // Header = synonym + extra words ("Telefone Celular 2" ⊇ "telefone")
      score = Math.max(60, 85 - 6 * (headerSet.size - syn.tokenSet.size));
    } else if (headerTokens.every((t) => syn.tokenSet.has(t)) && headerTokens.length >= 1) {
      // Header is a fragment of a longer synonym ("nascimento" of
      // "data de nascimento" would already be exact; this catches
      // generic fragments like "data" vs "data do pagamento").
      score = Math.max(SUGGESTION_THRESHOLD, 66 - 4 * (syn.tokenSet.size - headerSet.size));
    }
    if (score > best) best = score;
  }
  return best;
}

/* ───────────────────────── content sniffing ───────────────────────── */

const SAMPLE_SIZE = 60;

function sample(rows: string[][], col: number): string[] {
  const out: string[] = [];
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (v) out.push(v);
    if (out.length >= SAMPLE_SIZE) break;
  }
  return out;
}

function ratio(values: string[], test: (v: string) => boolean): number {
  if (values.length === 0) return 0;
  return values.filter(test).length / values.length;
}

const looksEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const looksCpf = (v: string) => /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(v);
const looksPhone = (v: string) => {
  if (looksCpf(v) || /^\d{2}\/\d{2}\/\d{2,4}$/.test(v) || v.includes("@")) return false;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13 && /^[\d\s()+\-.]+$/.test(v);
};
const looksDate = (v: string) => parseDateTime(v) !== null;
const looksTime = (v: string) => /^\d{1,2}\s*[:hH]/.test(v) && parseTime(v) !== null;

/* ───────────────────────── detection ───────────────────────── */

export function detectMapping(entity: EntityDef, headers: string[], rows: string[][]): ColumnMapping[] {
  const n = headers.length;
  const result: ColumnMapping[] = headers.map(() => ({ fieldKey: null, source: "auto", score: 0 }));

  // ── pass 1: header vs synonyms, greedy by best score ──
  interface Candidate { col: number; field: string; score: number }
  const candidates: Candidate[] = [];
  for (let c = 0; c < n; c++) {
    for (const f of entity.fields) {
      const score = scoreHeader(headers[c], f);
      if (score >= SUGGESTION_THRESHOLD) candidates.push({ col: c, field: f.key, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.col - b.col);

  const colTaken = new Set<number>();
  const fieldTaken = new Set<string>();
  for (const cand of candidates) {
    if (colTaken.has(cand.col) || fieldTaken.has(cand.field)) continue;
    colTaken.add(cand.col);
    fieldTaken.add(cand.field);
    result[cand.col] = {
      fieldKey: cand.field,
      source: cand.score >= AUTO_THRESHOLD ? "auto" : "suggestion",
      score: cand.score,
    };
  }

  // A weak "suggestion" must not block content sniffing from placing
  // a better-fitting field; suggestions don't count as taken for that.
  const appliedFields = new Set(result.filter((r) => r.fieldKey && r.source === "auto").map((r) => r.fieldKey as string));

  // ── pass 2: content sniffing for columns nothing placed ──
  const freeCols = result.map((r, i) => (r.source === "auto" && r.fieldKey ? -1 : i)).filter((i) => i >= 0);
  const hasField = (k: string) => entity.fields.some((f) => f.key === k);
  const place = (col: number, field: string, score: number) => {
    result[col] = { fieldKey: field, source: "content", score };
    appliedFields.add(field);
  };

  for (const col of freeCols) {
    const vals = sample(rows, col);
    if (vals.length < 2) continue;

    // First matching rule wins; each only fires if that field is still free.
    const emailField = hasField("email") && !appliedFields.has("email") ? "email" : null;
    if (emailField && ratio(vals, looksEmail) >= 0.8) { place(col, emailField, 80); continue; }

    const cpfField = hasField("cpf") && !appliedFields.has("cpf") ? "cpf" : null;
    if (cpfField && ratio(vals, looksCpf) >= 0.8) { place(col, cpfField, 78); continue; }

    const phoneField = ["phone", "patient_phone"].find((k) => hasField(k) && !appliedFields.has(k)) ?? null;
    if (phoneField && ratio(vals, looksPhone) >= 0.8) { place(col, phoneField, 76); continue; }

    const timeField = entity.sniffTimeField && !appliedFields.has(entity.sniffTimeField) ? entity.sniffTimeField : null;
    if (timeField && ratio(vals, looksTime) >= 0.9) { place(col, timeField, 76); continue; }

    const dateField = entity.sniffDateField && !appliedFields.has(entity.sniffDateField) ? entity.sniffDateField : null;
    if (dateField && ratio(vals, looksDate) >= 0.9) { place(col, dateField, 76); continue; }
  }

  // A weak suggestion whose field ended up claimed by a stronger match
  // elsewhere would show the same field twice — drop the weaker one.
  const claimed = new Set(result.filter((r) => r.fieldKey && r.source !== "suggestion").map((r) => r.fieldKey as string));
  for (const r of result) {
    if (r.source === "suggestion" && r.fieldKey && claimed.has(r.fieldKey)) {
      r.fieldKey = null;
      r.score = 0;
      r.source = "auto";
    }
  }

  return result;
}
