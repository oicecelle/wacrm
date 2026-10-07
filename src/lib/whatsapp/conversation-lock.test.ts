import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withConversationLock } from "./conversation-lock";

/** A fake database where the lock really is held until released, like the real one. */
function lockDb(opts: { failAcquire?: boolean } = {}) {
  const held = new Map<string, string>();
  const calls: string[] = [];
  const rpc = vi.fn(async (name: string, args: { p_conversation_id: string; p_holder: string }) => {
    calls.push(`${name}:${args.p_holder}`);
    if (name === "acquire_conversation_lock") {
      if (opts.failAcquire) return { data: null, error: { message: "boom" } };
      const owner = held.get(args.p_conversation_id);
      if (!owner || owner === args.p_holder) {
        held.set(args.p_conversation_id, args.p_holder);
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }
    if (held.get(args.p_conversation_id) === args.p_holder) held.delete(args.p_conversation_id);
    return { data: null, error: null };
  });
  return { db: { rpc } as unknown as SupabaseClient, held, calls, rpc };
}

const noSleep = async () => {};

describe("withConversationLock", () => {
  it("takes the lock, runs the work, and releases it", async () => {
    const { db, held, calls } = lockDb();
    const out = await withConversationLock(db, "conv1", async () => "done", { holder: "A", sleep: noSleep });
    expect(out).toBe("done");
    expect(held.size).toBe(0);
    expect(calls).toEqual(["acquire_conversation_lock:A", "release_conversation_lock:A"]);
  });

  it("REGRESSION: two quick messages in one conversation are processed ONE AT A TIME, in order", async () => {
    const { db } = lockDb();
    const events: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));

    const first = withConversationLock(
      db,
      "conv1",
      async () => {
        events.push("1 start");
        await gate; // the first message's flow is still running…
        events.push("1 end");
      },
      { holder: "first", sleep: noSleep },
    );
    await Promise.resolve();

    // …when the customer's second message arrives
    const second = withConversationLock(
      db,
      "conv1",
      async () => {
        events.push("2 start");
      },
      { holder: "second", sleep: async () => { await Promise.resolve(); } },
    );

    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(events).toEqual(["1 start"]); // the second is waiting, not running concurrently

    release();
    await Promise.all([first, second]);
    expect(events).toEqual(["1 start", "1 end", "2 start"]);
  });

  it("different conversations never block each other", async () => {
    const { db } = lockDb();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = withConversationLock(db, "convA", async () => { await gate; }, { holder: "A", sleep: noSleep });
    await Promise.resolve();
    let ranB = false;
    await withConversationLock(db, "convB", async () => { ranB = true; }, { holder: "B", sleep: noSleep });
    expect(ranB).toBe(true);
    release();
    await a;
  });

  it("FAILS OPEN: if the conversation stays busy past the wait limit, it runs anyway instead of dropping the work", async () => {
    const { db, held } = lockDb();
    held.set("conv1", "someone-else");
    const fn = vi.fn(async () => "ran");
    const out = await withConversationLock(db, "conv1", fn, { holder: "late", maxWaitMs: 900, pollMs: 300, sleep: noSleep });
    expect(out).toBe("ran");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(held.get("conv1")).toBe("someone-else"); // and it did NOT steal or release the other holder's lock
  });

  it("FAILS OPEN when the lock service errors", async () => {
    const { db } = lockDb({ failAcquire: true });
    const fn = vi.fn(async () => 42);
    expect(await withConversationLock(db, "conv1", fn, { holder: "A", sleep: noSleep })).toBe(42);
  });

  it("FAILS OPEN when the lock service throws", async () => {
    const db = { rpc: vi.fn(async () => { throw new Error("network"); }) } as unknown as SupabaseClient;
    expect(await withConversationLock(db, "conv1", async () => "ok", { sleep: noSleep })).toBe("ok");
  });

  it("releases the lock even when the work throws, and rethrows", async () => {
    const { db, held } = lockDb();
    await expect(
      withConversationLock(db, "conv1", async () => { throw new Error("flow exploded"); }, { holder: "A", sleep: noSleep }),
    ).rejects.toThrow("flow exploded");
    expect(held.size).toBe(0);
  });

  it("only releases a lock it actually took", async () => {
    const { db, calls } = lockDb({ failAcquire: true });
    await withConversationLock(db, "conv1", async () => 1, { holder: "A", sleep: noSleep });
    expect(calls.some((c) => c.startsWith("release_"))).toBe(false);
  });
});
