import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reserveHistoryContactSlots } from "./history-cap";
import { FIRST_PAIRING_MAX_CONTACTS } from "./history-import";

const dbReturning = (result: { data?: unknown; error?: { message: string } | null }) => {
  const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
  return { db: { rpc } as unknown as SupabaseClient, rpc };
};

describe("reserveHistoryContactSlots", () => {
  it("asks the database for the slots, with the config, amount and cap", async () => {
    const { db, rpc } = dbReturning({ data: 40 });
    expect(await reserveHistoryContactSlots(db, "cfg1", 40)).toBe(40);
    expect(rpc).toHaveBeenCalledWith("reserve_history_contact_slots", {
      p_config_id: "cfg1",
      p_requested: 40,
      p_max: FIRST_PAIRING_MAX_CONTACTS,
    });
  });

  it("returns only what was granted when the cap is nearly reached", async () => {
    expect(await reserveHistoryContactSlots(dbReturning({ data: 7 }).db, "cfg1", 40)).toBe(7);
  });

  it("REGRESSION: fails CLOSED — a database error creates NO contacts instead of bypassing the cap", async () => {
    expect(await reserveHistoryContactSlots(dbReturning({ error: { message: "function does not exist" } }).db, "cfg1", 40)).toBe(0);
    const throwing = { rpc: vi.fn(async () => { throw new Error("network"); }) } as unknown as SupabaseClient;
    expect(await reserveHistoryContactSlots(throwing, "cfg1", 40)).toBe(0);
  });

  it("never grants more than was asked, or a negative or invalid amount", async () => {
    expect(await reserveHistoryContactSlots(dbReturning({ data: 999 }).db, "cfg1", 10)).toBe(10);
    expect(await reserveHistoryContactSlots(dbReturning({ data: -5 }).db, "cfg1", 10)).toBe(0);
    expect(await reserveHistoryContactSlots(dbReturning({ data: "oops" }).db, "cfg1", 10)).toBe(0);
    expect(await reserveHistoryContactSlots(dbReturning({ data: null }).db, "cfg1", 10)).toBe(0);
  });

  it("doesn't even call the database for nothing to reserve", async () => {
    const { db, rpc } = dbReturning({ data: 1 });
    expect(await reserveHistoryContactSlots(db, "cfg1", 0)).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });
});
