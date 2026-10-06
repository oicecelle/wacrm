import { FIRST_PAIRING_WINDOW_MS } from "./history-import";

export interface ExistingConfigForImport {
  connected_at?: string | null;
  history_import_state?: string | null;
  history_import_started_at?: string | null;
}

/**
 * Decides, when a connection is saved, whether this opens the
 * first-pairing history window (the only time history may CREATE
 * contacts and conversations). Returns the fields to write, or null to
 * leave the stored state untouched.
 *
 * It opens only for a number that is NOT connected yet at save time —
 * the user is about to scan the QR code. If it was already connected,
 * WhatsApp's initial history sync happened before we were listening and
 * can't be replayed (the manual "load earlier" button covers that).
 * It never reopens for a connection that has connected before, nor one
 * whose import is already running or finished.
 */
export function decideHistoryImportStart(input: {
  connectedNow: boolean;
  existing: ExistingConfigForImport | null;
  nowMs?: number;
}): { history_import_state: "pending"; history_import_started_at: string } | null {
  const nowMs = input.nowMs ?? Date.now();
  if (input.connectedNow) return null;

  const open = { history_import_state: "pending" as const, history_import_started_at: new Date(nowMs).toISOString() };
  const { existing } = input;
  if (!existing) return open;

  if (existing.connected_at) return null; // has paired before
  const state = existing.history_import_state ?? null;
  if (state === "importing" || state === "done") return null;
  if (state === null) return open;

  // state === "pending": keep the window, unless it lapsed (saved days ago
  // and never scanned) — scanning now is a fresh first pairing.
  const started = existing.history_import_started_at ? Date.parse(existing.history_import_started_at) : NaN;
  return Number.isFinite(started) && nowMs - started <= FIRST_PAIRING_WINDOW_MS ? null : open;
}
