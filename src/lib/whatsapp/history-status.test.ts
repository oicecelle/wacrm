import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyManualHistoryStatus, markPairingImportDone, markPairingImportStarted, parseHistoryStatusBatch } from "./history-status";

describe("parseHistoryStatusBatch", () => {
  it("reads the result of a manual 'load earlier' request", () => {
    expect(
      parseHistoryStatusBatch({
        event: "status",
        request_chat: "5511888888888@s.whatsapp.net",
        status: "completed",
        has_more: true,
        history_access: "available",
        received_messages: 50,
        batchHistoryStatus: "complete",
      }),
    ).toEqual({
      kind: "manual",
      requestChat: "5511888888888@s.whatsapp.net",
      state: "completed",
      receivedMessages: 50,
      hasMore: true,
      historyAccess: "available",
    });
  });

  it("a timeout is a timeout, not a success; unknown has_more stays null", () => {
    const r = parseHistoryStatusBatch({ request_chat: "x@s.whatsapp.net", status: "timeout", has_more: null, received_messages: 0 });
    expect(r).toMatchObject({ kind: "manual", state: "timeout", hasMore: null, receivedMessages: 0 });
  });

  it("an unrecognised status never claims success", () => {
    expect(parseHistoryStatusBatch({ request_chat: "x@s.whatsapp.net", status: "weird" })).toMatchObject({ state: "timeout" });
  });

  it("the closing batch of a pairing sync has no request_chat", () => {
    expect(parseHistoryStatusBatch({ event: "status", batchHistoryStatus: "complete" })).toEqual({ kind: "pairing_complete" });
  });

  it("a status with neither is nothing", () => {
    expect(parseHistoryStatusBatch({ event: "status" })).toBeNull();
    expect(parseHistoryStatusBatch(null)).toBeNull();
  });
});

function fakeDb(pending: { id: string } | null) {
  const writes: Array<{ table: string; patch?: unknown; filters: string[] }> = [];
  const db = {
    from(table: string) {
      const w: { table: string; patch?: unknown; filters: string[] } = { table, filters: [] };
      const b: Record<string, unknown> = {
        select: () => b,
        update: (p: unknown) => ((w.patch = p), writes.push(w), b),
        eq: (c: string, v: string) => (w.filters.push(`${c}=${v}`), b),
        in: (c: string, v: string[]) => (w.filters.push(`${c} in ${v.join("|")}`), b),
        order: () => b,
        limit: () => b,
        maybeSingle: () => Promise.resolve({ data: pending, error: null }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { db, writes };
}

describe("applyManualHistoryStatus", () => {
  const status = {
    kind: "manual" as const,
    requestChat: "5511888888888@s.whatsapp.net",
    state: "completed" as const,
    receivedMessages: 12,
    hasMore: false,
    historyAccess: "available",
  };
  it("updates the newest pending request for that chat, in this account", async () => {
    const { db, writes } = fakeDb({ id: "req1" });
    expect(await applyManualHistoryStatus(db, "acct", status)).toBe(true);
    const upd = writes.find((w) => w.patch)!;
    expect(upd.patch).toMatchObject({ state: "completed", received_messages: 12, has_more: false });
    expect(upd.filters).toContain("id=req1");
  });
  it("does nothing when no request is pending (a late batch after the answer)", async () => {
    const { db, writes } = fakeDb(null);
    expect(await applyManualHistoryStatus(db, "acct", status)).toBe(false);
    expect(writes.some((w) => w.patch)).toBe(false);
  });
});

describe("pairing import state", () => {
  it("completion only closes a pairing that is still open", async () => {
    const { db, writes } = fakeDb(null);
    await markPairingImportDone(db, "cfg");
    expect(writes[0].patch).toEqual({ history_import_state: "done" });
    expect(writes[0].filters).toContain("history_import_state in pending|importing");
  });
  it("starting only moves 'pending' → 'importing'", async () => {
    const { db, writes } = fakeDb(null);
    await markPairingImportStarted(db, "cfg");
    expect(writes[0].patch).toEqual({ history_import_state: "importing" });
    expect(writes[0].filters).toContain("history_import_state=pending");
  });
});
