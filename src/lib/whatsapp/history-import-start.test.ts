import { describe, expect, it } from "vitest";
import { FIRST_PAIRING_WINDOW_MS } from "./history-import";
import { decideHistoryImportStart } from "./history-import-start";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("decideHistoryImportStart", () => {
  it("a brand-new number waiting for the QR code opens the window", () => {
    expect(decideHistoryImportStart({ connectedNow: false, existing: null, nowMs: NOW })).toEqual({
      history_import_state: "pending",
      history_import_started_at: iso(NOW),
    });
  });

  it("a number already connected at save time does NOT open it (its initial sync already happened)", () => {
    expect(decideHistoryImportStart({ connectedNow: true, existing: null, nowMs: NOW })).toBeNull();
  });

  it("REGRESSION: a connection that has connected before never reopens the window — even if it is saved while disconnected", () => {
    expect(decideHistoryImportStart({ connectedNow: false, existing: { connected_at: iso(NOW - 86_400_000 * 30) }, nowMs: NOW })).toBeNull();
  });

  it("a saved-but-never-paired row (state NULL, never connected) opens it", () => {
    expect(decideHistoryImportStart({ connectedNow: false, existing: { connected_at: null, history_import_state: null }, nowMs: NOW })).toMatchObject({
      history_import_state: "pending",
    });
  });

  it("an import that is running or finished is left alone", () => {
    for (const state of ["importing", "done"]) {
      expect(decideHistoryImportStart({ connectedNow: false, existing: { connected_at: null, history_import_state: state }, nowMs: NOW })).toBeNull();
    }
  });

  it("saving again while still pending keeps the original window", () => {
    expect(
      decideHistoryImportStart({
        connectedNow: false,
        existing: { connected_at: null, history_import_state: "pending", history_import_started_at: iso(NOW - 3_600_000) },
        nowMs: NOW,
      }),
    ).toBeNull();
  });

  it("a pending window that lapsed (saved long ago, never scanned) re-arms for the new attempt", () => {
    const r = decideHistoryImportStart({
      connectedNow: false,
      existing: { connected_at: null, history_import_state: "pending", history_import_started_at: iso(NOW - FIRST_PAIRING_WINDOW_MS - 1000) },
      nowMs: NOW,
    });
    expect(r).toEqual({ history_import_state: "pending", history_import_started_at: iso(NOW) });
  });
});
