import { describe, expect, it } from "vitest";
import { INLINE_WAIT_MAX_MS, planPacedSend } from "./pacing";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("planPacedSend", () => {
  it("sends immediately when there is no reserved slot", () => {
    expect(planPacedSend(null, 10_000, NOW)).toEqual({ action: "send_now" });
  });
  it("sends immediately when the slot is already here (or negligibly close)", () => {
    expect(planPacedSend(at(-5_000), 10_000, NOW)).toEqual({ action: "send_now" });
    expect(planPacedSend(at(300), 10_000, NOW)).toEqual({ action: "send_now" });
  });
  it("waits inline for a short gap, so a sequence is genuinely spaced", () => {
    expect(planPacedSend(at(4_000), 10_000, NOW)).toEqual({ action: "wait_inline", ms: 4_000 });
  });
  it("defers a long gap to the cron instead of holding the request open", () => {
    const until = at(INLINE_WAIT_MAX_MS + 1_000);
    expect(planPacedSend(until, 60_000, NOW)).toEqual({ action: "defer", until });
  });
  it("defers once the per-run inline budget is spent, even for a short gap", () => {
    const until = at(4_000);
    expect(planPacedSend(until, 3_000, NOW)).toEqual({ action: "defer", until });
  });
  it("treats an unparseable slot as 'send now' rather than stalling the send", () => {
    expect(planPacedSend("not-a-date", 10_000, NOW)).toEqual({ action: "send_now" });
  });
});
