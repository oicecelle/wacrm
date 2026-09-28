/**
 * Text helpers shared by the spreadsheet-import engine. Everything
 * here is pure (no I/O) so the header-matching and value-parsing
 * rules can be unit-tested exhaustively.
 */

/** Lowercase, strip accents, collapse every non-alphanumeric run to
 *  one space. "Data de Nascimento (dd/mm)" → "data de nascimento dd mm". */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Connector words that carry no meaning for column matching, so
 *  "data de nascimento" and "data nascimento" compare equal. */
const STOPWORDS = new Set(["de", "do", "da", "dos", "das", "no", "na", "o", "a", "e", "the", "of", "r", "rs", "reais"]);

/** Normalized, stopword-free tokens of a header/synonym. */
export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t));
}
