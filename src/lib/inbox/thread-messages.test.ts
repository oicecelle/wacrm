import { describe, expect, it } from "vitest";
import { BACKFILL_AGE_MS, insertMessageSorted, isBackfilledMessage } from "./thread-messages";

const NOW = Date.parse("2026-10-06T12:00:00Z");
const at = (iso: string) => ({ created_at: iso });

describe("isBackfilledMessage", () => {
  it("a message created just now is live", () => {
    expect(isBackfilledMessage(new Date(NOW - 5_000).toISOString(), NOW)).toBe(false);
    expect(isBackfilledMessage(new Date(NOW - BACKFILL_AGE_MS + 1000).toISOString(), NOW)).toBe(false);
  });
  it("one dated in the past is backfilled history", () => {
    expect(isBackfilledMessage("2026-09-01T10:00:00Z", NOW)).toBe(true);
    expect(isBackfilledMessage(new Date(NOW - BACKFILL_AGE_MS - 1000).toISOString(), NOW)).toBe(true);
  });
  it("missing or invalid dates are treated as live (never silently swallowed)", () => {
    expect(isBackfilledMessage(null, NOW)).toBe(false);
    expect(isBackfilledMessage(undefined, NOW)).toBe(false);
    expect(isBackfilledMessage("not a date", NOW)).toBe(false);
  });
});

describe("insertMessageSorted", () => {
  const thread: Array<{ id: string; created_at: string | null }> = [
    { id: "b", ...at("2026-09-02T10:00:00Z") },
    { id: "c", ...at("2026-09-03T10:00:00Z") },
  ];

  it("puts an OLDER message at the top, not the bottom", () => {
    const out = insertMessageSorted(thread, { id: "a", ...at("2026-09-01T10:00:00Z") });
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });
  it("puts one in the middle in the middle", () => {
    const out = insertMessageSorted(thread, { id: "x", ...at("2026-09-02T18:00:00Z") });
    expect(out.map((m) => m.id)).toEqual(["b", "x", "c"]);
  });
  it("a newer message goes to the end", () => {
    expect(insertMessageSorted(thread, { id: "z", ...at("2026-10-01T10:00:00Z") }).map((m) => m.id)).toEqual(["b", "c", "z"]);
  });
  it("equal timestamps keep arrival order", () => {
    const out = insertMessageSorted(thread, { id: "tie", ...at("2026-09-02T10:00:00Z") });
    expect(out.map((m) => m.id)).toEqual(["b", "tie", "c"]);
  });
  it("never duplicates a message that's already there", () => {
    const out = insertMessageSorted(thread, { id: "b", ...at("2026-09-02T10:00:00Z") });
    expect(out).toBe(thread);
  });
  it("doesn't mutate its input", () => {
    const copy = JSON.stringify(thread);
    insertMessageSorted(thread, { id: "a", ...at("2026-09-01T10:00:00Z") });
    expect(JSON.stringify(thread)).toBe(copy);
  });
  it("keeps optimistic messages (they sit at the end with 'now') in place", () => {
    const withOptimistic = [...thread, { id: "temp-1", ...at("2026-10-06T11:59:59Z") }];
    const out = insertMessageSorted(withOptimistic, { id: "a", ...at("2026-09-01T10:00:00Z") });
    expect(out.map((m) => m.id)).toEqual(["a", "b", "c", "temp-1"]);
  });
  it("a message with no usable date is appended rather than lost", () => {
    expect(insertMessageSorted(thread, { id: "nodate", created_at: null }).map((m) => m.id)).toEqual(["b", "c", "nodate"]);
  });
});
