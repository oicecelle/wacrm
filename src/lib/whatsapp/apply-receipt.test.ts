import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceMessageStatuses, idVariants } from "./apply-receipt";

function fakeDb(rows: Array<{ id: string; status: string | null }>) {
  const calls = { inIds: [] as string[][], updates: [] as { patch: unknown; ids: string[] }[], filters: [] as string[] };
  const db = {
    from: () => {
      let mode: "select" | "update" = "select";
      let patch: unknown;
      const b: Record<string, unknown> = {
        select: () => ((mode = "select"), b),
        update: (p: unknown) => ((mode = "update"), (patch = p), b),
        in: (col: string, ids: string[]) => {
          if (mode === "update") {
            calls.updates.push({ patch, ids });
            return Promise.resolve({ error: null });
          }
          calls.inIds.push(ids);
          return b;
        },
        eq: (col: string, v: string) => (calls.filters.push(`${col}=${v}`), b),
        neq: (col: string, v: string) => (calls.filters.push(`${col}!=${v}`), Promise.resolve({ data: rows, error: null })),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("idVariants", () => {
  it("matches both the bare id and the owner-prefixed form", () => {
    expect(idVariants(["A", "B"], "5511999999999").sort()).toEqual(
      ["A", "B", "5511999999999:A", "5511999999999:B"].sort(),
    );
    expect(idVariants(["A"], null)).toEqual(["A"]);
  });
});

describe("advanceMessageStatuses", () => {
  it("moves sent → delivered and sent → read", async () => {
    const { db, calls } = fakeDb([{ id: "m1", status: "sent" }]);
    expect(await advanceMessageStatuses(db, "acct", ["A"], "delivered")).toBe(1);
    expect(calls.updates[0]).toEqual({ patch: { status: "delivered" }, ids: ["m1"] });
    const second = fakeDb([{ id: "m2", status: "sent" }]);
    await advanceMessageStatuses(second.db, "acct", ["A"], "read");
    expect(second.calls.updates[0].patch).toEqual({ status: "read" });
  });

  it("REGRESSION: a late 'delivered' never undoes 'read' (receipts arrive out of order)", async () => {
    const { db, calls } = fakeDb([{ id: "m1", status: "read" }]);
    expect(await advanceMessageStatuses(db, "acct", ["A"], "delivered")).toBe(0);
    expect(calls.updates).toHaveLength(0);
  });

  it("does not re-write a message already at the target status", async () => {
    const { db, calls } = fakeDb([{ id: "m1", status: "delivered" }]);
    expect(await advanceMessageStatuses(db, "acct", ["A"], "delivered")).toBe(0);
    expect(calls.updates).toHaveLength(0);
  });

  it("never touches a failed message", async () => {
    const { db, calls } = fakeDb([{ id: "m1", status: "failed" }]);
    expect(await advanceMessageStatuses(db, "acct", ["A"], "read")).toBe(0);
    expect(calls.updates).toHaveLength(0);
  });

  it("updates only the messages that are behind, in one batch", async () => {
    const { db, calls } = fakeDb([
      { id: "m1", status: "sent" },
      { id: "m2", status: "read" },
      { id: "m3", status: "sending" },
    ]);
    expect(await advanceMessageStatuses(db, "acct", ["A", "B", "C"], "read")).toBe(2);
    expect(calls.updates[0].ids.sort()).toEqual(["m1", "m3"]);
  });

  it("is scoped to the account and skips the customer's own messages", async () => {
    const { db, calls } = fakeDb([]);
    await advanceMessageStatuses(db, "acct-1", ["A"], "read", "5511");
    expect(calls.filters).toContain("conversations.account_id=acct-1");
    expect(calls.filters).toContain("sender_type!=customer");
    expect(calls.inIds[0].sort()).toEqual(["5511:A", "A"]);
  });

  it("does nothing for an empty id list", async () => {
    const { db, calls } = fakeDb([]);
    expect(await advanceMessageStatuses(db, "acct", [], "read")).toBe(0);
    expect(calls.inIds).toHaveLength(0);
  });
});
